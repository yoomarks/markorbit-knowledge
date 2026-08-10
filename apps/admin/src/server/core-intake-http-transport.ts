import type { CoreIntakeRequest, CoreIntakeResult } from "@markorbit/contracts";

const CORE_INTAKE_STATUSES = new Set<CoreIntakeResult["status"]>([
  "RECEIVED",
  "ACCEPTED",
  "REJECTED",
]);
const DEFAULT_CORE_INTAKE_TIMEOUT_MS = 15_000;

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
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CoreIntakeTransportError(
      "CORE_INTAKE_TRANSPORT_URL_INVALID",
      "MARKORBIT_CORE_INTAKE_URL must use HTTP or HTTPS",
      503,
    );
  }
  if (url.username || url.password) {
    throw new CoreIntakeTransportError(
      "CORE_INTAKE_TRANSPORT_URL_CREDENTIALS_FORBIDDEN",
      "MARKORBIT_CORE_INTAKE_URL must not embed credentials",
      503,
    );
  }
  return url.toString();
}

function configuredDestination(): string {
  const url = process.env.MARKORBIT_CORE_INTAKE_URL?.trim();
  if (!url) {
    throw new CoreIntakeTransportError(
      "CORE_INTAKE_TRANSPORT_NOT_CONFIGURED",
      "MARKORBIT_CORE_INTAKE_URL is not configured",
      503,
    );
  }
  return destination(url);
}

export function coreIntakeTransportReadiness(): CoreIntakeTransportReadiness {
  try {
    configuredDestination();
    return { configured: true, issueCode: null };
  } catch (error) {
    if (error instanceof CoreIntakeTransportError) {
      return { configured: false, issueCode: error.code };
    }
    throw error;
  }
}

function parseResult(value: unknown, readyPackageId: string): CoreIntakeResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CoreIntakeTransportError(
      "CORE_INTAKE_TRANSPORT_RESPONSE_INVALID",
      "Core intake response must be a JSON object",
      502,
    );
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(",") !== "intakeId,readyPackageId,status") {
    throw new CoreIntakeTransportError(
      "CORE_INTAKE_TRANSPORT_RESPONSE_INVALID",
      "Core intake response contains unexpected fields",
      502,
    );
  }
  if (
    typeof record.intakeId !== "string" ||
    !record.intakeId.trim() ||
    typeof record.readyPackageId !== "string" ||
    !record.readyPackageId.trim() ||
    !CORE_INTAKE_STATUSES.has(record.status as CoreIntakeResult["status"])
  ) {
    throw new CoreIntakeTransportError(
      "CORE_INTAKE_TRANSPORT_RESPONSE_INVALID",
      "Core intake response does not match CoreIntakeResult",
      502,
    );
  }
  if (record.readyPackageId !== readyPackageId) {
    throw new CoreIntakeTransportError(
      "CORE_INTAKE_TRANSPORT_PACKAGE_MISMATCH",
      "Core intake response belongs to another ReadyPackage",
      502,
    );
  }
  return {
    intakeId: record.intakeId,
    status: record.status as CoreIntakeResult["status"],
    readyPackageId: record.readyPackageId,
  };
}

function timeoutError(): CoreIntakeTransportError {
  return new CoreIntakeTransportError(
    "CORE_INTAKE_TRANSPORT_TIMEOUT",
    "Core intake destination did not respond before the delivery timeout",
    504,
  );
}

export class HttpCoreIntakeTransport implements CoreIntakeTransport {
  private readonly url: string;

  constructor(
    intakeUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = DEFAULT_CORE_INTAKE_TIMEOUT_MS,
  ) {
    this.url = destination(intakeUrl);
  }

  async submit(request: CoreIntakeRequest, idempotencyKey: string): Promise<CoreIntakeResult> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(request),
        signal,
      });
    } catch {
      if (signal.aborted) throw timeoutError();
      throw new CoreIntakeTransportError(
        "CORE_INTAKE_TRANSPORT_UNAVAILABLE",
        "Core intake destination is unavailable",
        502,
      );
    }
    if (!response.ok) {
      throw new CoreIntakeTransportError(
        "CORE_INTAKE_TRANSPORT_HTTP_ERROR",
        `Core intake destination returned HTTP ${response.status}`,
        502,
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (signal.aborted) throw timeoutError();
      throw new CoreIntakeTransportError(
        "CORE_INTAKE_TRANSPORT_RESPONSE_INVALID",
        "Core intake response must be valid JSON",
        502,
      );
    }
    return parseResult(body, request.readyPackageId);
  }
}

export function configuredCoreIntakeTransport(
  fetchImpl: typeof fetch = fetch,
): CoreIntakeTransport {
  return {
    async submit(request, idempotencyKey) {
      return new HttpCoreIntakeTransport(configuredDestination(), fetchImpl).submit(
        request,
        idempotencyKey,
      );
    },
  };
}
