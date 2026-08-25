import { AiKnowledgeAcquisitionError } from "./ai-distilled-knowledge-acquirer";
import type {
  ManagedAiExecutionClient,
  ManagedAiKnowledgeExecutionInputV1,
  ManagedAiKnowledgeExecutionOutcomeV1,
} from "./managed-ai-knowledge-adapter";

export const MANAGED_AI_EXECUTION_ROUTE = "/internal/v1/managed-ai-executions" as const;

const DEFAULT_REQUEST_TIMEOUT_MS = 315_000;
const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_REQUEST_TIMEOUT_MS = 360_000;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

export type ManagedAiHttpTransportRequest = {
  url: string;
  headers: Readonly<Record<string, string>>;
  body: string;
  timeoutMs: number;
  maxResponseBytes: number;
};

export type ManagedAiHttpTransportResponse = {
  status: number;
  body: Uint8Array;
};

export type ManagedAiHttpTransport = (
  request: Readonly<ManagedAiHttpTransportRequest>,
) => Promise<ManagedAiHttpTransportResponse>;

export class ManagedAiExecutionHttpClientError extends AiKnowledgeAcquisitionError {
  constructor(code: string, message: string, retryable: boolean) {
    super(code, message, retryable);
    this.name = "ManagedAiExecutionHttpClientError";
  }
}

export class ManagedAiHttpTransportError extends Error {
  constructor(
    readonly code:
      | "MANAGED_AI_HTTP_TIMEOUT"
      | "MANAGED_AI_HTTP_NETWORK_ERROR"
      | "MANAGED_AI_HTTP_RESPONSE_TOO_LARGE",
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ManagedAiHttpTransportError";
  }
}

export type ManagedAiExecutionHttpClientOptions = {
  baseUrl: string;
  internalServiceSecret: string;
  idempotencyKey: string;
  correlationId: string;
  transport?: ManagedAiHttpTransport;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
};

type ManagedAiHttpErrorBody = {
  code: string;
  message: string;
  retryable: boolean;
  correlationId?: string;
};

function boundedInteger(value: number, field: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function nonEmpty(value: string, field: string, maxLength: number): string {
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength) {
    throw new TypeError(`${field} must contain 1 to ${maxLength} characters`);
  }
  return cleaned;
}

function managedAiEndpoint(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new TypeError("Managed AI baseUrl must be a valid URL");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password
  ) {
    throw new TypeError("Managed AI baseUrl must use http/https and must not contain credentials");
  }
  if (parsed.search || parsed.hash) {
    throw new TypeError("Managed AI baseUrl must not contain query or fragment components");
  }
  return new URL(MANAGED_AI_EXECUTION_ROUTE, parsed).toString();
}

function parseJsonBytes(raw: Uint8Array, context: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(raw)) as unknown;
  } catch {
    throw new ManagedAiExecutionHttpClientError(
      "AI_MANAGED_AI_HTTP_INVALID_JSON",
      `${context} did not contain valid JSON`,
      false,
    );
  }
}

function parseErrorBody(value: unknown): ManagedAiHttpErrorBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.code !== "string" ||
    !record.code.trim() ||
    typeof record.message !== "string" ||
    !record.message.trim() ||
    typeof record.retryable !== "boolean"
  ) {
    return null;
  }
  return {
    code: record.code,
    message: record.message,
    retryable: record.retryable,
    ...(typeof record.correlationId === "string" && record.correlationId.trim()
      ? { correlationId: record.correlationId }
      : {}),
  };
}

function requiresReconciliation(error: ManagedAiHttpErrorBody): boolean {
  return (
    error.code.includes("RECONCILIATION_REQUIRED") ||
    (error.code === "MANAGED_AI_CLAIM_STORE_UNAVAILABLE" && error.retryable === false)
  );
}

export const fetchManagedAiHttpTransport: ManagedAiHttpTransport = async (request) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
      redirect: "error",
    });
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        size += result.value.byteLength;
        if (size > request.maxResponseBytes) {
          await reader.cancel();
          throw new ManagedAiHttpTransportError(
            "MANAGED_AI_HTTP_RESPONSE_TOO_LARGE",
            "Managed AI response exceeded the configured byte limit",
            false,
          );
        }
        chunks.push(result.value);
      }
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { status: response.status, body };
  } catch (error) {
    if (error instanceof ManagedAiHttpTransportError) throw error;
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new ManagedAiHttpTransportError(
      aborted ? "MANAGED_AI_HTTP_TIMEOUT" : "MANAGED_AI_HTTP_NETWORK_ERROR",
      aborted ? "Managed AI request timed out" : "Managed AI request failed",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
};

export class ManagedAiExecutionHttpClient implements ManagedAiExecutionClient {
  private readonly url: string;
  private readonly internalServiceSecret: string;
  private readonly idempotencyKey: string;
  private readonly correlationId: string;
  private readonly transport: ManagedAiHttpTransport;
  private readonly requestTimeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(options: ManagedAiExecutionHttpClientOptions) {
    this.url = managedAiEndpoint(options.baseUrl);
    this.internalServiceSecret = nonEmpty(
      options.internalServiceSecret,
      "internalServiceSecret",
      4_096,
    );
    if (Buffer.byteLength(this.internalServiceSecret) < 32) {
      throw new TypeError("internalServiceSecret must contain at least 32 bytes");
    }
    this.idempotencyKey = nonEmpty(options.idempotencyKey, "idempotencyKey", 500);
    this.correlationId = nonEmpty(options.correlationId, "correlationId", 300);
    this.transport = options.transport ?? fetchManagedAiHttpTransport;
    this.requestTimeoutMs = boundedInteger(
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      "requestTimeoutMs",
      1_000,
      MAX_REQUEST_TIMEOUT_MS,
    );
    this.maxResponseBytes = boundedInteger(
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      "maxResponseBytes",
      1,
      MAX_RESPONSE_BYTES,
    );
  }

  async execute(
    input: Readonly<ManagedAiKnowledgeExecutionInputV1>,
  ): Promise<ManagedAiKnowledgeExecutionOutcomeV1> {
    let response: ManagedAiHttpTransportResponse;
    try {
      response = await this.transport({
        url: this.url,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-markorbit-internal-authorization": this.internalServiceSecret,
          "idempotency-key": this.idempotencyKey,
          "x-correlation-id": this.correlationId,
        },
        body: JSON.stringify(input),
        timeoutMs: this.requestTimeoutMs,
        maxResponseBytes: this.maxResponseBytes,
      });
    } catch (error) {
      if (error instanceof ManagedAiHttpTransportError) {
        throw new ManagedAiExecutionHttpClientError(error.code, error.message, error.retryable);
      }
      throw new ManagedAiExecutionHttpClientError(
        "AI_MANAGED_AI_HTTP_NETWORK_ERROR",
        error instanceof Error ? error.message : "Managed AI transport failed",
        true,
      );
    }

    const parsed = parseJsonBytes(response.body, "Managed AI response");
    if (response.status < 200 || response.status >= 300) {
      const error = parseErrorBody(parsed);
      if (!error) {
        throw new ManagedAiExecutionHttpClientError(
          "AI_MANAGED_AI_HTTP_ERROR_RESPONSE_INVALID",
          `Managed AI returned HTTP ${response.status} with an invalid governed error body`,
          false,
        );
      }
      if (requiresReconciliation(error)) {
        throw new ManagedAiExecutionHttpClientError(
          "AI_PROVIDER_NETWORK_ERROR",
          `${error.code}: ${error.message}`,
          false,
        );
      }
      throw new ManagedAiExecutionHttpClientError(
        `AI_MANAGED_AI_HTTP_${error.code}`,
        error.message,
        error.retryable,
      );
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ManagedAiExecutionHttpClientError(
        "AI_MANAGED_AI_HTTP_OUTCOME_INVALID",
        "Managed AI success response must contain an outcome object",
        false,
      );
    }
    return parsed as ManagedAiKnowledgeExecutionOutcomeV1;
  }
}
