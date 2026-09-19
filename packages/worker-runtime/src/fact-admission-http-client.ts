export type FactAdmissionJson = Record<string, unknown>;

export type FactAdmissionReceipt = FactAdmissionJson & {
  outcome?: string;
};

export type FactAdmissionRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
};

export interface FactAdmissionClient {
  post<TPayload extends object>(path: string, payload: TPayload): Promise<FactAdmissionReceipt>;
}

export class FactAdmissionHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "FactAdmissionHttpError";
  }
}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 250;

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Fact admission base URL must use http or https");
  }
  return url.toString().replace(/\/$/u, "");
}

function normalizePath(value: string): string {
  const path = value.trim();
  if (!path.startsWith("/api/admin/v2/fact-admissions/")) {
    throw new Error("Fact admission path must stay under /api/admin/v2/fact-admissions/");
  }
  if (path.includes("://") || path.includes("?") || path.includes("#")) {
    throw new Error("Fact admission path must be a relative canonical path");
  }
  return path;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseErrorPayload(value: unknown): {
  code: string;
  message: string;
  retryable: boolean | null;
} | null {
  const outer = record(value);
  if (!outer) return null;
  const detail = record(outer.detail) ?? record(outer.error) ?? outer;
  const code = typeof detail.code === "string" ? detail.code : null;
  const message = typeof detail.message === "string" ? detail.message : null;
  const retryable = typeof detail.retryable === "boolean" ? detail.retryable : null;
  if (!code && !message && retryable === null) return null;
  return {
    code: code ?? "FACT_ADMISSION_HTTP_ERROR",
    message: message ?? "Fact admission request failed",
    retryable,
  };
}

export class HttpFactAdmissionClient implements FactAdmissionClient {
  private readonly baseUrl: string;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (delayMs: number) => Promise<void>;

  constructor(
    baseUrl: string,
    private readonly credential: string,
    private readonly fetcher: typeof fetch = fetch,
    options: FactAdmissionRetryOptions = {},
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    if (!credential.trim()) {
      throw new Error("Fact admission credential is required");
    }
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.sleep =
      options.sleep ?? ((delayMs) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));

    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1 || this.maxAttempts > 5) {
      throw new Error("Fact admission maxAttempts must be an integer from 1 to 5");
    }
    if (!Number.isFinite(this.baseDelayMs) || this.baseDelayMs < 0 || this.baseDelayMs > 5_000) {
      throw new Error("Fact admission baseDelayMs must be between 0 and 5000");
    }
  }

  private delayMs(attempt: number): number {
    return Math.min(this.baseDelayMs * 2 ** (attempt - 1), 2_000);
  }

  async post<TPayload extends object>(
    path: string,
    payload: TPayload,
  ): Promise<FactAdmissionReceipt> {
    const normalizedPath = normalizePath(path);
    const url = `${this.baseUrl}${normalizedPath}`;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.credential}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        if (attempt >= this.maxAttempts) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new FactAdmissionHttpError(
            0,
            "FACT_ADMISSION_TRANSPORT_FAILED",
            `Fact admission transport failed after ${attempt} attempt(s): ${detail}`,
            true,
          );
        }
        if (this.baseDelayMs > 0) {
          await this.sleep(this.delayMs(attempt));
        }
        continue;
      }

      if (!response.ok) {
        let parsed: ReturnType<typeof parseErrorPayload> = null;
        try {
          parsed = parseErrorPayload(await response.json());
        } catch {
          // Preserve transport-level defaults when the response is not JSON.
        }
        const retryable = parsed?.retryable ?? RETRYABLE_STATUSES.has(response.status);
        const code =
          parsed?.code ??
          (response.status === 401 || response.status === 403
            ? "FACT_ADMISSION_AUTH_REJECTED"
            : "FACT_ADMISSION_HTTP_ERROR");
        const message =
          parsed?.message ?? `Fact admission request failed with HTTP ${response.status}`;

        if (retryable && RETRYABLE_STATUSES.has(response.status) && attempt < this.maxAttempts) {
          try {
            await response.body?.cancel();
          } catch {
            // The failed response is discarded before a bounded retry.
          }
          if (this.baseDelayMs > 0) {
            await this.sleep(this.delayMs(attempt));
          }
          continue;
        }

        throw new FactAdmissionHttpError(response.status, code, message, retryable);
      }

      let result: unknown;
      try {
        result = await response.json();
      } catch {
        throw new FactAdmissionHttpError(
          response.status,
          "FACT_ADMISSION_RESPONSE_INVALID",
          "Fact admission success response must be valid JSON",
          false,
        );
      }
      const receipt = record(result);
      if (!receipt) {
        throw new FactAdmissionHttpError(
          response.status,
          "FACT_ADMISSION_RESPONSE_INVALID",
          "Fact admission success response must be an object",
          false,
        );
      }
      return receipt;
    }

    throw new Error("Fact admission retry loop exhausted unexpectedly");
  }
}
