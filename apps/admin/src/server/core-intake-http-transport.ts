import type { CoreIntakeRequest, CoreIntakeResult } from "@markorbit/contracts";
import { isCanonicalCoreWorkspaceId } from "@markorbit/persistence/core-workspace-bindings";

const CORE_INTAKE_STATUSES = new Set<CoreIntakeResult["status"]>([
  "RECEIVED",
  "ACCEPTED",
  "REJECTED",
]);
const DEFAULT_CORE_INTAKE_TIMEOUT_MS = 15_000;
const INTERNAL_AUTH_HEADER = "x-markorbit-internal-authorization";

export interface CoreIntakeTransport {
  submit(request: CoreIntakeRequest, idempotencyKey: string): Promise<CoreIntakeResult>;
}

export type CoreIntakeTransportReadiness = {
  configured: boolean;
  issueCode: string | null;
};

export class CoreIntakeTransportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "CoreIntakeTransportError";
  }
}

function destination(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CoreIntakeTransportError(
      "CORE_INTAKE_TRANSPORT_URL_INVALID",
      "MARKORBIT_CORE_INTAKE_URL must be a complete HTTP(S) URL",
      503,
    );
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new CoreIntakeTransportError(
      "CORE_INTAKE_TRANSPORT_URL_INVALID",
      "MARKORBIT_CORE_INTAKE_URL must be an HTTP(S) URL without embedded credentials",
      503,
    );
  }
  return url.toString();
}

function configuredDestination(): string {
  const raw = process.env.MARKORBIT_CORE_INTAKE_URL?.trim();
  if (!raw) {
    throw new CoreIntakeTransportError(
      "CORE_INTAKE_TRANSPORT_NOT_CONFIGURED",
      "MARKORBIT_CORE_INTAKE_URL is not configured",
      503,
    );
  }
  return destination(raw);
}

function internalSecret(raw: string | null | undefined): string {
  const secret = raw?.trim();
  if (!secret) {
    throw new CoreIntakeTransportError(
      "CORE_INTAKE_TRANSPORT_AUTH_NOT_CONFIGURED",
      "MARKORBIT_CORE_INTERNAL_SECRET is not configured",
      503,
    );
  }
  return secret;
}

function configuredInternalSecret(): string {
  return internalSecret(process.env.MARKORBIT_CORE_INTERNAL_SECRET);
}

function requireCanonicalWorkspaceId(workspaceId: string): void {
  if (!isCanonicalCoreWorkspaceId(workspaceId)) {
    throw new CoreIntakeTransportError(
      "CORE_WORKSPACE_BINDING_INVALID",
      "Core intake request workspaceId must be a canonical UUID",
      409,
    );
  }
}

export function coreIntakeTransportReadiness(
  coreWorkspaceId?: string | null,
): CoreIntakeTransportReadiness {
  try {
    configuredDestination();
    configuredInternalSecret();
  } catch (error) {
    if (error instanceof CoreIntakeTransportError) {
      return { configured: false, issueCode: error.code };
    }
    throw error;
  }

  if (!coreWorkspaceId?.trim()) {
    return { configured: false, issueCode: "CORE_WORKSPACE_NOT_BOUND" };
  }
  if (!isCanonicalCoreWorkspaceId(coreWorkspaceId)) {
    return { configured: false, issueCode: "CORE_WORKSPACE_BINDING_INVALID" };
  }
  return { configured: true, issueCode: null };
}

function parseResult(value: unknown): CoreIntakeResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CoreIntakeTransportError(
      "CORE_INTAKE_TRANSPORT_RESPONSE_INVALID",
      "Core intake returned an invalid response envelope",
      502,
    );
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== 3 ||
    keys[0] !== "intakeId" ||
    keys[1] !== "readyPackageId" ||
    keys[2] !== "status" ||
    typeof record.intakeId !== "string" ||
    !record.intakeId.trim() ||
    typeof record.readyPackageId !== "string" ||
    !record.readyPackageId.trim() ||
    typeof record.status !== "string" ||
    !CORE_INTAKE_STATUSES.has(record.status as CoreIntakeResult["status"])
  ) {
    throw new CoreIntakeTransportError(
      "CORE_INTAKE_TRANSPORT_RESPONSE_INVALID",
      "Core intake returned an invalid response envelope",
      502,
    );
  }
  return {
    intakeId: record.intakeId,
    readyPackageId: record.readyPackageId,
    status: record.status as CoreIntakeResult["status"],
  };
}

function isTimeoutFailure(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

export class HttpCoreIntakeTransport implements CoreIntakeTransport {
  private readonly url: string;
  private readonly secret: string;

  constructor(
    intakeUrl: string,
    internalAuthorizationSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = DEFAULT_CORE_INTAKE_TIMEOUT_MS,
  ) {
    this.url = destination(intakeUrl);
    this.secret = internalSecret(internalAuthorizationSecret);
  }

  async submit(request: CoreIntakeRequest, idempotencyKey: string): Promise<CoreIntakeResult> {
    requireCanonicalWorkspaceId(request.workspaceId);
    const signal = AbortSignal.timeout(this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          [INTERNAL_AUTH_HEADER]: this.secret,
        },
        body: JSON.stringify(request),
        signal,
      });
    } catch (error) {
      if (isTimeoutFailure(error, signal)) {
        throw new CoreIntakeTransportError(
          "CORE_INTAKE_TRANSPORT_TIMEOUT",
          "Core intake request exceeded the bounded delivery timeout",
          504,
        );
      }
      throw new CoreIntakeTransportError(
        "CORE_INTAKE_TRANSPORT_UNAVAILABLE",
        "Core intake request could not be delivered",
        502,
      );
    }

    if (!response.ok) {
      throw new CoreIntakeTransportError(
        "CORE_INTAKE_TRANSPORT_HTTP_ERROR",
        `Core intake returned HTTP ${response.status}`,
        502,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new CoreIntakeTransportError(
        "CORE_INTAKE_TRANSPORT_RESPONSE_INVALID",
        "Core intake returned a non-JSON response",
        502,
      );
    }
    const result = parseResult(body);
    if (result.readyPackageId !== request.readyPackageId) {
      throw new CoreIntakeTransportError(
        "CORE_INTAKE_TRANSPORT_PACKAGE_MISMATCH",
        "Core intake response belongs to another ReadyPackage",
        502,
      );
    }
    return result;
  }
}

export function configuredCoreIntakeTransport(fetchImpl: typeof fetch = fetch): CoreIntakeTransport {
  return {
    async submit(request, idempotencyKey) {
      return new HttpCoreIntakeTransport(
        configuredDestination(),
        configuredInternalSecret(),
        fetchImpl,
      ).submit(request, idempotencyKey);
    },
  };
}
