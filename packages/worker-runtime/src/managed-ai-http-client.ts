import { createHash } from "node:crypto";
import { assertAiKnowledgeAssignmentV1 } from "@markorbit/contracts";
import {
  AiKnowledgeAcquisitionError,
  type AiKnowledgeAcquisition,
  type AiKnowledgeProviderAdapter,
  type AiKnowledgeProviderRequest,
} from "./ai-distilled-knowledge-acquirer";
import {
  MANAGED_AI_KNOWLEDGE_OUTPUT_SCHEMA_ID,
  MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_ID,
  MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_VERSION,
  ManagedAiDeepSeekKnowledgeAdapter,
  type ManagedAiKnowledgeExecutionInputV1,
  type ManagedAiKnowledgeExecutionOutcomeV1,
} from "./managed-ai-knowledge-adapter";

const MANAGED_AI_EXECUTION_PATH = "/internal/v1/managed-ai-executions";
const SYSTEM_INSTRUCTION =
  "You are an external research lawyer contributing a distilled knowledge artifact. Follow the assignment exactly. Return Markdown only. Do not claim that MarkOrbit verified the legal truth of your answer.";
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 300_000;
const DEFAULT_TIMEOUT_GRACE_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export type ManagedAiHttpExecutionContextV1 = {
  idempotencyKey: string;
  correlationId: string;
};

export type ManagedAiHttpTransport = typeof fetch;

export type HttpManagedAiExecutionClientOptions = {
  baseUrl: string;
  internalServiceSecret: string;
  fetchImpl?: ManagedAiHttpTransport;
  maxResponseBytes?: number;
  timeoutGraceMs?: number;
};

export type ManagedAiHttpDeepSeekKnowledgeAdapterOptions = HttpManagedAiExecutionClientOptions;

type ManagedAiRouteErrorEnvelope = {
  code: string;
  message: string;
  correlationId?: string;
  retryable: boolean;
  details?: Readonly<Record<string, unknown>>;
};

type ExecutionAwareAiKnowledgeProviderRequest = AiKnowledgeProviderRequest & {
  executionKey?: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizedBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AiKnowledgeAcquisitionError(
      "AI_MANAGED_AI_BASE_URL_INVALID",
      "Managed AI Capability Engine base URL is invalid",
      false,
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AiKnowledgeAcquisitionError(
      "AI_MANAGED_AI_BASE_URL_INVALID",
      "Managed AI Capability Engine base URL must use http or https",
      false,
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new AiKnowledgeAcquisitionError(
      "AI_MANAGED_AI_BASE_URL_INVALID",
      "Managed AI Capability Engine base URL cannot contain credentials, query or fragment",
      false,
    );
  }
  return url.toString().replace(/\/$/, "");
}

function boundedPositiveInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new AiKnowledgeAcquisitionError(
      code,
      `Managed AI HTTP value must be an integer between ${minimum} and ${maximum}`,
      false,
    );
  }
  return resolved;
}

function boundedProviderTimeout(value: number | undefined): number {
  return boundedPositiveInteger(
    value,
    DEFAULT_TIMEOUT_MS,
    1_000,
    MAX_TIMEOUT_MS,
    "AI_TIMEOUT_INVALID",
  );
}

function requestInput(request: AiKnowledgeProviderRequest): ManagedAiKnowledgeExecutionInputV1 {
  assertAiKnowledgeAssignmentV1(request.assignment);
  if (request.model !== undefined) {
    throw new AiKnowledgeAcquisitionError(
      "AI_PROVIDER_MODEL_OVERRIDE_FORBIDDEN",
      "Knowledge callers cannot select the Managed AI provider model",
      false,
    );
  }
  const timeoutMs = boundedProviderTimeout(request.timeoutMs);
  return {
    schemaVersion: 1,
    processingClass: "SOURCE_ACQUISITION",
    dataClassification: "PUBLIC",
    taskInput: {
      schemaVersion: 1,
      kind: "TEXT_GENERATION",
      prompt: request.assignment.prompt,
      systemInstruction: SYSTEM_INSTRUCTION,
      outputFormat: "MARKDOWN",
    },
    requestedOutput: {
      schemaId: MANAGED_AI_KNOWLEDGE_OUTPUT_SCHEMA_ID,
      format: "MARKDOWN",
    },
    requirements: {
      capabilities: ["text-generation"],
      maxLatencyMs: timeoutMs,
      exactProviderOutputRequired: true,
      provenanceRequired: true,
    },
    promptPolicy: {
      policyId: MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_ID,
      policyVersion: MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_VERSION,
    },
    evidence: {
      exactOutput: "REQUIRED",
      providerRequestId: "REQUIRED_WHEN_AVAILABLE",
    },
  };
}

export function managedAiHttpExecutionContextV1(
  executionKey: string,
): ManagedAiHttpExecutionContextV1 {
  const normalized = executionKey.trim();
  if (!normalized || normalized.length > 512) {
    throw new AiKnowledgeAcquisitionError(
      "AI_MANAGED_AI_EXECUTION_IDENTITY_INVALID",
      "Managed AI executionKey must contain 1 to 512 characters",
      false,
    );
  }
  const identitySha256 = sha256(
    [
      "markorbit-knowledge-managed-ai-http-v1",
      MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_ID,
      MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_VERSION,
      normalized,
    ].join("\u001f"),
  );
  return {
    idempotencyKey: `knowledge-managed-ai:${identitySha256}`,
    correlationId: `knowledge-ai:${identitySha256.slice(0, 40)}`,
  };
}

function parseRouteError(value: unknown): ManagedAiRouteErrorEnvelope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !nonEmpty(record.code) ||
    !nonEmpty(record.message) ||
    typeof record.retryable !== "boolean"
  ) {
    return null;
  }
  return {
    code: record.code,
    message: record.message,
    retryable: record.retryable,
    ...(nonEmpty(record.correlationId) ? { correlationId: record.correlationId } : {}),
    ...(record.details && typeof record.details === "object" && !Array.isArray(record.details)
      ? { details: record.details as Readonly<Record<string, unknown>> }
      : {}),
  };
}

function knowledgeRouteErrorCode(code: string): string {
  return code.startsWith("MANAGED_AI_") ? `AI_${code}` : `AI_MANAGED_AI_${code}`;
}

function isReconciliationRequired(error: ManagedAiRouteErrorEnvelope): boolean {
  return (
    error.code.includes("RECONCILIATION_REQUIRED") ||
    (error.code === "MANAGED_AI_CLAIM_STORE_UNAVAILABLE" && error.retryable === false)
  );
}

async function readBoundedResponse(
  response: Response,
  maxResponseBytes: number,
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maxResponseBytes) {
      await reader.cancel();
      throw new AiKnowledgeAcquisitionError(
        "AI_MANAGED_AI_HTTP_RESPONSE_TOO_LARGE",
        "Managed AI Capability Engine response exceeded the configured byte limit",
        false,
      );
    }
    chunks.push(next.value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function parseJson(bytes: Uint8Array): unknown {
  if (bytes.byteLength === 0) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
}

export class HttpManagedAiExecutionClient {
  private readonly baseUrl: string;
  private readonly internalServiceSecret: string;
  private readonly fetchImpl: ManagedAiHttpTransport;
  private readonly maxResponseBytes: number;
  private readonly timeoutGraceMs: number;

  constructor(options: HttpManagedAiExecutionClientOptions) {
    this.baseUrl = normalizedBaseUrl(options.baseUrl);
    if (Buffer.byteLength(options.internalServiceSecret) < 32) {
      throw new AiKnowledgeAcquisitionError(
        "AI_MANAGED_AI_INTERNAL_SECRET_INVALID",
        "Managed AI internal service secret must contain at least 32 bytes",
        false,
      );
    }
    this.internalServiceSecret = options.internalServiceSecret;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxResponseBytes = boundedPositiveInteger(
      options.maxResponseBytes,
      DEFAULT_MAX_RESPONSE_BYTES,
      1_024,
      64 * 1024 * 1024,
      "AI_MANAGED_AI_MAX_RESPONSE_BYTES_INVALID",
    );
    this.timeoutGraceMs = boundedPositiveInteger(
      options.timeoutGraceMs,
      DEFAULT_TIMEOUT_GRACE_MS,
      1_000,
      60_000,
      "AI_MANAGED_AI_TIMEOUT_GRACE_INVALID",
    );
  }

  async execute(
    input: Readonly<ManagedAiKnowledgeExecutionInputV1>,
    context: Readonly<ManagedAiHttpExecutionContextV1>,
  ): Promise<ManagedAiKnowledgeExecutionOutcomeV1> {
    if (!nonEmpty(context.idempotencyKey) || context.idempotencyKey.length > 500) {
      throw new AiKnowledgeAcquisitionError(
        "AI_MANAGED_AI_IDEMPOTENCY_KEY_INVALID",
        "Managed AI idempotency key must contain 1 to 500 characters",
        false,
      );
    }
    if (!nonEmpty(context.correlationId) || context.correlationId.length > 300) {
      throw new AiKnowledgeAcquisitionError(
        "AI_MANAGED_AI_CORRELATION_ID_INVALID",
        "Managed AI correlation ID must contain 1 to 300 characters",
        false,
      );
    }

    const controller = new AbortController();
    const timeoutMs = Math.min(
      input.requirements.maxLatencyMs + this.timeoutGraceMs,
      MAX_TIMEOUT_MS + 60_000,
    );
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${MANAGED_AI_EXECUTION_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-markorbit-internal-authorization": this.internalServiceSecret,
          "idempotency-key": context.idempotencyKey,
          "x-correlation-id": context.correlationId,
        },
        body: JSON.stringify(input),
        signal: controller.signal,
        redirect: "error",
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      throw new AiKnowledgeAcquisitionError(
        "AI_MANAGED_AI_HTTP_TRANSPORT_UNCERTAIN",
        timedOut
          ? "Managed AI Capability Engine request timed out; retry must reuse the same idempotency key"
          : "Managed AI Capability Engine request failed; retry must reuse the same idempotency key",
        true,
      );
    } finally {
      clearTimeout(timer);
    }

    const bytes = await readBoundedResponse(response, this.maxResponseBytes);
    const parsed = parseJson(bytes);
    if (!response.ok) {
      const routeError = parseRouteError(parsed);
      if (!routeError) {
        throw new AiKnowledgeAcquisitionError(
          response.status >= 500
            ? "AI_MANAGED_AI_HTTP_TRANSPORT_UNCERTAIN"
            : "AI_MANAGED_AI_HTTP_ERROR_ENVELOPE_INVALID",
          `Managed AI Capability Engine returned HTTP ${response.status} without a valid error envelope`,
          response.status >= 500,
        );
      }
      if (isReconciliationRequired(routeError)) {
        throw new AiKnowledgeAcquisitionError(
          "AI_PROVIDER_NETWORK_ERROR",
          `${routeError.code}: ${routeError.message}`,
          false,
        );
      }
      throw new AiKnowledgeAcquisitionError(
        knowledgeRouteErrorCode(routeError.code),
        routeError.message,
        routeError.retryable,
      );
    }

    if (
      parsed === undefined ||
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new AiKnowledgeAcquisitionError(
        "AI_MANAGED_AI_HTTP_RESPONSE_INVALID",
        "Managed AI Capability Engine returned a non-object or invalid JSON success response",
        true,
      );
    }
    return parsed as ManagedAiKnowledgeExecutionOutcomeV1;
  }
}

export class ManagedAiHttpDeepSeekKnowledgeAdapter implements AiKnowledgeProviderAdapter {
  readonly provider = "DEEPSEEK" as const;
  private readonly client: HttpManagedAiExecutionClient;

  constructor(options: ManagedAiHttpDeepSeekKnowledgeAdapterOptions) {
    this.client = new HttpManagedAiExecutionClient(options);
  }

  async acquire(request: AiKnowledgeProviderRequest): Promise<AiKnowledgeAcquisition> {
    const executionKey = (request as ExecutionAwareAiKnowledgeProviderRequest).executionKey;
    if (!nonEmpty(executionKey)) {
      throw new AiKnowledgeAcquisitionError(
        "AI_MANAGED_AI_EXECUTION_IDENTITY_REQUIRED",
        "Managed AI HTTP acquisition requires the durable ADK job executionKey",
        false,
      );
    }
    const input = requestInput(request);
    const context = managedAiHttpExecutionContextV1(executionKey);
    const outcome = await this.client.execute(input, context);
    const delegate = new ManagedAiDeepSeekKnowledgeAdapter({
      execute: async () => outcome,
    });
    return delegate.acquire(request);
  }
}
