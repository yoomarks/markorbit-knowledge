import { createHash } from "node:crypto";
import {
  READY_PACKAGE_V2_DELIVERY_PROTOCOL_VERSION,
  assertReadyPackageV2DeliveryRequestV1,
  assertReadyPackageV2DeliveryResultV1,
  type ReadyPackageV2DeliveryResultV1,
} from "@markorbit/contracts";
import { isCanonicalCoreWorkspaceId } from "@markorbit/persistence/core-workspace-bindings";

const DEFAULT_TIMEOUT_MS = 15_000;
const INTERNAL_AUTH_HEADER = "x-markorbit-internal-authorization";
const PROTOCOL_HEADER = "x-markorbit-ready-package-v2-delivery-protocol";

export type ReadyPackageV2DeliveryTransportReadiness = {
  configured: boolean;
  issueCode: string | null;
};

export interface ReadyPackageV2DeliveryTransport {
  submit(requestJson: string, idempotencyKey: string): Promise<ReadyPackageV2DeliveryResultV1>;
}

export class ReadyPackageV2DeliveryTransportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "ReadyPackageV2DeliveryTransportError";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function destination(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ReadyPackageV2DeliveryTransportError(
      "CORE_V2_DELIVERY_URL_INVALID",
      "MARKORBIT_CORE_V2_DELIVERY_URL must be a complete HTTP(S) URL",
      503,
    );
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new ReadyPackageV2DeliveryTransportError(
      "CORE_V2_DELIVERY_URL_INVALID",
      "MARKORBIT_CORE_V2_DELIVERY_URL must be HTTP(S) without embedded credentials",
      503,
    );
  }
  return url.toString();
}

function configuredDestination(): string {
  const raw = process.env.MARKORBIT_CORE_V2_DELIVERY_URL?.trim();
  if (!raw) {
    throw new ReadyPackageV2DeliveryTransportError(
      "CORE_V2_DELIVERY_NOT_CONFIGURED",
      "MARKORBIT_CORE_V2_DELIVERY_URL is not configured",
      503,
    );
  }
  const configured = destination(raw);
  const legacy = process.env.MARKORBIT_CORE_INTAKE_URL?.trim();
  if (legacy) {
    try {
      if (destination(legacy) === configured) {
        throw new ReadyPackageV2DeliveryTransportError(
          "CORE_V2_DELIVERY_V1_ENDPOINT_REUSE_FORBIDDEN",
          "ReadyPackage V2 delivery must not reuse the frozen V1 Core intake endpoint",
          503,
        );
      }
    } catch (error) {
      if (error instanceof ReadyPackageV2DeliveryTransportError) throw error;
    }
  }
  return configured;
}

function configuredSecret(): string {
  const secret = process.env.MARKORBIT_CORE_INTERNAL_SECRET?.trim();
  if (!secret) {
    throw new ReadyPackageV2DeliveryTransportError(
      "CORE_V2_DELIVERY_AUTH_NOT_CONFIGURED",
      "MARKORBIT_CORE_INTERNAL_SECRET is not configured",
      503,
    );
  }
  return secret;
}

function configuredProtocolVersion(): string {
  const version = process.env.MARKORBIT_CORE_V2_PROTOCOL_VERSION?.trim();
  if (!version) {
    throw new ReadyPackageV2DeliveryTransportError(
      "CORE_V2_DELIVERY_PROTOCOL_NOT_DECLARED",
      "MARKORBIT_CORE_V2_PROTOCOL_VERSION must explicitly declare consumer support",
      503,
    );
  }
  if (version !== READY_PACKAGE_V2_DELIVERY_PROTOCOL_VERSION) {
    throw new ReadyPackageV2DeliveryTransportError(
      "CORE_V2_DELIVERY_PROTOCOL_UNSUPPORTED",
      `Configured Core V2 protocol ${version} is not supported by Knowledge`,
      503,
    );
  }
  return version;
}

export function readyPackageV2DeliveryTransportReadiness(
  coreWorkspaceId?: string | null,
): ReadyPackageV2DeliveryTransportReadiness {
  if (!coreWorkspaceId?.trim()) {
    return { configured: false, issueCode: "CORE_WORKSPACE_NOT_BOUND" };
  }
  if (!isCanonicalCoreWorkspaceId(coreWorkspaceId)) {
    return { configured: false, issueCode: "CORE_WORKSPACE_BINDING_INVALID" };
  }
  try {
    configuredDestination();
    configuredSecret();
    configuredProtocolVersion();
    return { configured: true, issueCode: null };
  } catch (error) {
    if (error instanceof ReadyPackageV2DeliveryTransportError) {
      return { configured: false, issueCode: error.code };
    }
    throw error;
  }
}

function isTimeoutFailure(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

export class HttpReadyPackageV2DeliveryTransport implements ReadyPackageV2DeliveryTransport {
  private readonly url: string;
  private readonly secret: string;

  constructor(
    deliveryUrl: string,
    internalSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.url = destination(deliveryUrl);
    this.secret = internalSecret.trim();
    if (!this.secret) {
      throw new ReadyPackageV2DeliveryTransportError(
        "CORE_V2_DELIVERY_AUTH_NOT_CONFIGURED",
        "ReadyPackage V2 delivery requires an internal authorization secret",
        503,
      );
    }
  }

  async submit(requestJson: string, idempotencyKey: string): Promise<ReadyPackageV2DeliveryResultV1> {
    let request: unknown;
    try {
      request = JSON.parse(requestJson);
    } catch {
      throw new ReadyPackageV2DeliveryTransportError(
        "CORE_V2_DELIVERY_REQUEST_INVALID",
        "Frozen ReadyPackage V2 delivery request is not valid JSON",
        409,
      );
    }
    try {
      assertReadyPackageV2DeliveryRequestV1(request);
    } catch {
      throw new ReadyPackageV2DeliveryTransportError(
        "CORE_V2_DELIVERY_REQUEST_INVALID",
        "Frozen ReadyPackage V2 delivery request violates protocol V1",
        409,
      );
    }
    if (!idempotencyKey?.trim()) {
      throw new ReadyPackageV2DeliveryTransportError(
        "CORE_V2_DELIVERY_IDEMPOTENCY_KEY_INVALID",
        "ReadyPackage V2 delivery requires a stable idempotency key",
        409,
      );
    }

    const signal = AbortSignal.timeout(this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          [INTERNAL_AUTH_HEADER]: this.secret,
          [PROTOCOL_HEADER]: READY_PACKAGE_V2_DELIVERY_PROTOCOL_VERSION,
        },
        body: requestJson,
        signal,
      });
    } catch (error) {
      if (isTimeoutFailure(error, signal)) {
        throw new ReadyPackageV2DeliveryTransportError(
          "CORE_V2_DELIVERY_TIMEOUT",
          "ReadyPackage V2 delivery exceeded the bounded timeout; outcome is unknown",
          504,
        );
      }
      throw new ReadyPackageV2DeliveryTransportError(
        "CORE_V2_DELIVERY_UNAVAILABLE",
        "ReadyPackage V2 delivery could not be completed; outcome is unknown",
        502,
      );
    }
    if (!response.ok) {
      throw new ReadyPackageV2DeliveryTransportError(
        "CORE_V2_DELIVERY_HTTP_ERROR",
        `ReadyPackage V2 consumer returned HTTP ${response.status}`,
        502,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
      assertReadyPackageV2DeliveryResultV1(body);
    } catch {
      throw new ReadyPackageV2DeliveryTransportError(
        "CORE_V2_DELIVERY_RESPONSE_INVALID",
        "ReadyPackage V2 consumer returned an invalid result envelope",
        502,
      );
    }
    const result = body as ReadyPackageV2DeliveryResultV1;
    if (
      result.deliveryId !== request.deliveryId ||
      result.readyPackageId !== request.readyPackageId ||
      result.requestSha256 !== sha256(requestJson)
    ) {
      throw new ReadyPackageV2DeliveryTransportError(
        "CORE_V2_DELIVERY_RESPONSE_MISMATCH",
        "ReadyPackage V2 consumer result does not match the frozen request",
        502,
      );
    }
    return result;
  }
}

export function configuredReadyPackageV2DeliveryTransport(
  fetchImpl: typeof fetch = fetch,
): ReadyPackageV2DeliveryTransport {
  return {
    async submit(requestJson, idempotencyKey) {
      configuredProtocolVersion();
      return new HttpReadyPackageV2DeliveryTransport(
        configuredDestination(),
        configuredSecret(),
        fetchImpl,
      ).submit(requestJson, idempotencyKey);
    },
  };
}
