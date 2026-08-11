import { CoreIntakeTransportError } from "./core-intake-http-transport";
import type { ReadyPackageCoreContentResult } from "@markorbit/persistence/ready-package-core-intake-submissions";

const DEFAULT_CORE_CONTENT_TIMEOUT_MS = 15_000;
const INTERNAL_AUTH_HEADER = "x-markorbit-internal-authorization";
const SHA256 = /^[a-f0-9]{64}$/u;

export interface CoreContentTransport {
  submit(
    intakeId: string,
    requestJson: string,
    expected: { readyPackageId: string; exportSha256: string },
  ): Promise<ReadyPackageCoreContentResult>;
}

export type CoreContentTransportReadiness = {
  configured: boolean;
  issueCode: string | null;
};

function configuredIntakeUrl(): string {
  const raw = process.env.MARKORBIT_CORE_INTAKE_URL?.trim();
  if (!raw) {
    throw new CoreIntakeTransportError(
      "CORE_CONTENT_TRANSPORT_NOT_CONFIGURED",
      "MARKORBIT_CORE_INTAKE_URL is not configured",
      503,
    );
  }
  return raw;
}

function configuredInternalSecret(): string {
  const secret = process.env.MARKORBIT_CORE_INTERNAL_SECRET?.trim();
  if (!secret) {
    throw new CoreIntakeTransportError(
      "CORE_CONTENT_TRANSPORT_AUTH_NOT_CONFIGURED",
      "MARKORBIT_CORE_INTERNAL_SECRET is not configured",
      503,
    );
  }
  return secret;
}

function contentDestination(intakeUrl: string, intakeId: string): string {
  let url: URL;
  try {
    url = new URL(intakeUrl);
  } catch {
    throw new CoreIntakeTransportError(
      "CORE_CONTENT_TRANSPORT_URL_INVALID",
      "MARKORBIT_CORE_INTAKE_URL must be a complete HTTP(S) URL",
      503,
    );
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new CoreIntakeTransportError(
      "CORE_CONTENT_TRANSPORT_URL_INVALID",
      "MARKORBIT_CORE_INTAKE_URL must be an HTTP(S) URL without embedded credentials",
      503,
    );
  }
  const path = url.pathname.replace(/\/+$/u, "");
  url.pathname = `${path}/${encodeURIComponent(intakeId)}/content`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function coreContentTransportReadiness(): CoreContentTransportReadiness {
  try {
    contentDestination(configuredIntakeUrl(), "readiness");
    configuredInternalSecret();
    return { configured: true, issueCode: null };
  } catch (error) {
    if (error instanceof CoreIntakeTransportError) {
      return { configured: false, issueCode: error.code };
    }
    throw error;
  }
}

function parseResult(value: unknown): ReadyPackageCoreContentResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CoreIntakeTransportError(
      "CORE_CONTENT_TRANSPORT_RESPONSE_INVALID",
      "Core content receiver returned an invalid response envelope",
      502,
    );
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== 4 ||
    keys[0] !== "exportSha256" ||
    keys[1] !== "intakeId" ||
    keys[2] !== "readyPackageId" ||
    keys[3] !== "status" ||
    typeof record.intakeId !== "string" ||
    !record.intakeId.trim() ||
    typeof record.readyPackageId !== "string" ||
    !record.readyPackageId.trim() ||
    record.status !== "ACCEPTED" ||
    typeof record.exportSha256 !== "string" ||
    !SHA256.test(record.exportSha256)
  ) {
    throw new CoreIntakeTransportError(
      "CORE_CONTENT_TRANSPORT_RESPONSE_INVALID",
      "Core content receiver returned an invalid response envelope",
      502,
    );
  }
  return {
    intakeId: record.intakeId,
    readyPackageId: record.readyPackageId,
    status: "ACCEPTED",
    exportSha256: record.exportSha256,
  };
}

function timeoutFailure(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

export class HttpCoreContentTransport implements CoreContentTransport {
  constructor(
    private readonly intakeUrl: string,
    private readonly internalSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = DEFAULT_CORE_CONTENT_TIMEOUT_MS,
  ) {}

  async submit(
    intakeId: string,
    requestJson: string,
    expected: { readyPackageId: string; exportSha256: string },
  ): Promise<ReadyPackageCoreContentResult> {
    if (!intakeId.trim()) {
      throw new CoreIntakeTransportError(
        "CORE_CONTENT_INTAKE_ID_INVALID",
        "Core content delivery requires an intake ID",
        409,
      );
    }
    if (!requestJson.trim() || !SHA256.test(expected.exportSha256)) {
      throw new CoreIntakeTransportError(
        "CORE_CONTENT_REQUEST_INVALID",
        "Core content delivery requires a frozen request body and SHA-256 fingerprint",
        409,
      );
    }
    const signal = AbortSignal.timeout(this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(contentDestination(this.intakeUrl, intakeId), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [INTERNAL_AUTH_HEADER]: this.internalSecret,
        },
        body: requestJson,
        signal,
      });
    } catch (error) {
      if (timeoutFailure(error, signal)) {
        throw new CoreIntakeTransportError(
          "CORE_CONTENT_TRANSPORT_TIMEOUT",
          "Core content request exceeded the bounded delivery timeout",
          504,
        );
      }
      throw new CoreIntakeTransportError(
        "CORE_CONTENT_TRANSPORT_UNAVAILABLE",
        "Core content request could not be delivered",
        502,
      );
    }
    if (!response.ok) {
      throw new CoreIntakeTransportError(
        "CORE_CONTENT_TRANSPORT_HTTP_ERROR",
        `Core content receiver returned HTTP ${response.status}`,
        502,
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new CoreIntakeTransportError(
        "CORE_CONTENT_TRANSPORT_RESPONSE_INVALID",
        "Core content receiver returned a non-JSON response",
        502,
      );
    }
    const result = parseResult(body);
    if (
      result.intakeId !== intakeId ||
      result.readyPackageId !== expected.readyPackageId ||
      result.exportSha256 !== expected.exportSha256
    ) {
      throw new CoreIntakeTransportError(
        "CORE_CONTENT_TRANSPORT_RESULT_MISMATCH",
        "Core content response does not match the frozen request",
        502,
      );
    }
    return result;
  }
}

export function configuredCoreContentTransport(
  fetchImpl: typeof fetch = fetch,
): CoreContentTransport {
  return {
    async submit(intakeId, requestJson, expected) {
      return new HttpCoreContentTransport(
        configuredIntakeUrl(),
        configuredInternalSecret(),
        fetchImpl,
      ).submit(intakeId, requestJson, expected);
    },
  };
}
