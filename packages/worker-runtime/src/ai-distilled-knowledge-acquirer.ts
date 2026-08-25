import { createHash } from "node:crypto";
import {
  AI_DISTILLED_KNOWLEDGE_ARTIFACT_OBJECT_TYPE,
  AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
  AI_RESEARCH_SUBMISSION_OBJECT_TYPE,
  assertAiKnowledgeAssignmentV1,
  type AiDistilledKnowledgeArtifactV1,
  type AiKnowledgeAssignmentV1,
  type AiKnowledgeProvider,
  type AiResearchSubmissionV1,
} from "@markorbit/contracts";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";
const DEEPSEEK_SECRET_ENV = "DEEPSEEK_API_KEY";
const BEIJING_UTC_OFFSET_MS = 8 * 60 * 60 * 1_000;
const MORNING_PEAK_START_MINUTE = 9 * 60;
const MORNING_PEAK_END_MINUTE = 12 * 60;
const AFTERNOON_PEAK_START_MINUTE = 14 * 60;
const AFTERNOON_PEAK_END_MINUTE = 18 * 60;

export type AiModelTransportRequest = {
  url: string;
  headers: Readonly<Record<string, string>>;
  body: string;
  timeoutMs: number;
  maxResponseBytes: number;
};

export type AiModelTransportResponse = {
  status: number;
  body: Uint8Array;
  headers?: Readonly<Record<string, string>>;
};

export type AiModelTransport = (
  request: AiModelTransportRequest,
) => Promise<AiModelTransportResponse>;

export type AiKnowledgeProviderRequest = {
  assignment: AiKnowledgeAssignmentV1;
  executionKey?: string;
  model?: string;
  timeoutMs?: number;
};

export type AiKnowledgeAcquisition = {
  assignment: AiKnowledgeAssignmentV1;
  submission: AiResearchSubmissionV1;
  artifact: AiDistilledKnowledgeArtifactV1;
  rawResponse: Uint8Array;
};

export interface AiKnowledgeProviderAdapter {
  readonly provider: AiKnowledgeProvider;
  acquire(request: AiKnowledgeProviderRequest): Promise<AiKnowledgeAcquisition>;
}

export class AiKnowledgeAcquisitionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AiKnowledgeAcquisitionError";
  }
}

export function isDeepSeekPeakPricingWindow(at: Date): boolean {
  if (Number.isNaN(at.getTime())) {
    throw new TypeError("DeepSeek execution-window timestamp must be valid");
  }
  const beijing = new Date(at.getTime() + BEIJING_UTC_OFFSET_MS);
  const weekday = beijing.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;

  const minuteOfDay = beijing.getUTCHours() * 60 + beijing.getUTCMinutes();
  return (
    (minuteOfDay >= MORNING_PEAK_START_MINUTE && minuteOfDay < MORNING_PEAK_END_MINUTE) ||
    (minuteOfDay >= AFTERNOON_PEAK_START_MINUTE && minuteOfDay < AFTERNOON_PEAK_END_MINUTE)
  );
}

export function assertDeepSeekOffPeakExecutionWindow(at: Date = new Date()): void {
  if (!isDeepSeekPeakPricingWindow(at)) return;
  throw new AiKnowledgeAcquisitionError(
    "AI_PROVIDER_PEAK_PRICING_WINDOW",
    "DeepSeek paid execution is deferred during Beijing-time weekday peak pricing windows (09:00-12:00 and 14:00-18:00)",
    true,
  );
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function boundedTimeout(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(value) || value < 1_000 || value > MAX_TIMEOUT_MS) {
    throw new AiKnowledgeAcquisitionError(
      "AI_TIMEOUT_INVALID",
      `AI provider timeout must be between 1000 and ${MAX_TIMEOUT_MS} milliseconds`,
      false,
    );
  }
  return value;
}

function deterministicId(prefix: "ars" | "adk", seed: string): string {
  return `${prefix}_${sha256(seed).slice(0, 32)}`;
}

async function defaultTransport(
  request: AiModelTransportRequest,
): Promise<AiModelTransportResponse> {
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
          throw new AiKnowledgeAcquisitionError(
            "AI_RESPONSE_TOO_LARGE",
            "AI provider response exceeded the configured byte limit",
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
    return {
      status: response.status,
      body,
      headers: Object.fromEntries(response.headers.entries()),
    };
  } catch (error) {
    if (error instanceof AiKnowledgeAcquisitionError) throw error;
    const timedOut = error instanceof Error && error.name === "AbortError";
    throw new AiKnowledgeAcquisitionError(
      timedOut ? "AI_PROVIDER_TIMEOUT" : "AI_PROVIDER_NETWORK_ERROR",
      timedOut ? "AI provider request timed out" : "AI provider request failed",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function parseProviderText(value: unknown): string {
  if (!value || typeof value !== "object") {
    throw new AiKnowledgeAcquisitionError(
      "AI_PROVIDER_RESPONSE_INVALID",
      "AI provider response is not an object",
      false,
    );
  }
  const record = value as Record<string, unknown>;
  const choices = record.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AiKnowledgeAcquisitionError(
      "AI_PROVIDER_RESPONSE_INVALID",
      "AI provider response does not contain choices",
      false,
    );
  }
  const first = choices[0];
  if (!first || typeof first !== "object") {
    throw new AiKnowledgeAcquisitionError(
      "AI_PROVIDER_RESPONSE_INVALID",
      "AI provider response contains an invalid choice",
      false,
    );
  }
  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== "object") {
    throw new AiKnowledgeAcquisitionError(
      "AI_PROVIDER_RESPONSE_INVALID",
      "AI provider response does not contain a message",
      false,
    );
  }
  const content = (message as Record<string, unknown>).content;
  if (typeof content !== "string" || !content.trim()) {
    throw new AiKnowledgeAcquisitionError(
      "AI_PROVIDER_RESPONSE_INVALID",
      "AI provider response does not contain text content",
      false,
    );
  }
  return content;
}

function parsedJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new AiKnowledgeAcquisitionError(
      "AI_PROVIDER_RESPONSE_INVALID",
      "AI provider returned invalid JSON",
      false,
    );
  }
}

function optionalHeader(headers: Readonly<Record<string, string>> | undefined, name: string) {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

export class DeepSeekKnowledgeAdapter implements AiKnowledgeProviderAdapter {
  readonly provider = "DEEPSEEK" as const;
  private readonly transport: AiModelTransport;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly maxResponseBytes: number;

  constructor(options: {
    apiKey?: string;
    model?: string;
    endpoint?: string;
    maxResponseBytes?: number;
    transport?: AiModelTransport;
  } = {}) {
    this.apiKey = options.apiKey ?? process.env[DEEPSEEK_SECRET_ENV] ?? "";
    this.model = options.model?.trim() || DEEPSEEK_DEFAULT_MODEL;
    this.endpoint = options.endpoint?.trim() || DEEPSEEK_ENDPOINT;
    this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    this.transport = options.transport ?? defaultTransport;
  }

  async acquire(request: AiKnowledgeProviderRequest): Promise<AiKnowledgeAcquisition> {
    assertAiKnowledgeAssignmentV1(request.assignment);
    if (!this.apiKey) {
      throw new AiKnowledgeAcquisitionError(
        "AI_PROVIDER_CREDENTIAL_MISSING",
        `DeepSeek credential environment variable ${DEEPSEEK_SECRET_ENV} is not configured`,
        false,
      );
    }
    const timeoutMs = boundedTimeout(request.timeoutMs);
    assertDeepSeekOffPeakExecutionWindow();
    const model = request.model?.trim() || this.model;
    const rawRequestBody = JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an external research lawyer contributing a distilled knowledge artifact. Follow the assignment exactly. Return Markdown only. Do not claim that MarkOrbit verified the legal truth of your answer.",
        },
        { role: "user", content: request.assignment.prompt },
      ],
      stream: false,
    });
    const response = await this.transport({
      url: this.endpoint,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: rawRequestBody,
      timeoutMs,
      maxResponseBytes: this.maxResponseBytes,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new AiKnowledgeAcquisitionError(
        response.status === 429 || response.status >= 500
          ? "AI_PROVIDER_TEMPORARY_FAILURE"
          : "AI_PROVIDER_REJECTED",
        `DeepSeek returned HTTP ${response.status}`,
        response.status === 429 || response.status >= 500,
      );
    }

    const parsed = parsedJson(response.body);
    const markdown = parseProviderText(parsed);
    const providerRequestId =
      typeof (parsed as Record<string, unknown>).id === "string"
        ? ((parsed as Record<string, unknown>).id as string)
        : optionalHeader(response.headers, "x-request-id");
    const capturedAt = new Date().toISOString();
    const assignment = request.assignment;
    const seed = [
      assignment.assignmentId,
      this.provider,
      model,
      assignment.instructionSetId,
      String(assignment.instructionSetRevision),
      assignment.prompt,
      markdown,
    ].join("\u001f");

    const submission: AiResearchSubmissionV1 = {
      protocolVersion: AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
      objectType: AI_RESEARCH_SUBMISSION_OBJECT_TYPE,
      submissionId: deterministicId("ars", seed),
      assignmentId: assignment.assignmentId,
      provider: this.provider,
      model,
      instructionSetId: assignment.instructionSetId,
      instructionSetRevision: assignment.instructionSetRevision,
      contentFormat: "MARKDOWN",
      content: markdown,
      ...(providerRequestId ? { providerRequestId } : {}),
      submittedAt: capturedAt,
    };
    const artifact: AiDistilledKnowledgeArtifactV1 = {
      protocolVersion: AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
      objectType: AI_DISTILLED_KNOWLEDGE_ARTIFACT_OBJECT_TYPE,
      artifactId: deterministicId("adk", seed),
      assignmentId: assignment.assignmentId,
      submissionId: submission.submissionId,
      provider: submission.provider,
      model: submission.model,
      instructionSetId: submission.instructionSetId,
      instructionSetRevision: submission.instructionSetRevision,
      sourceClass: "AI_DISTILLED_KNOWLEDGE",
      contentFormat: "MARKDOWN",
      content: markdown,
      capturedAt,
    };

    return {
      assignment,
      submission,
      artifact,
      rawResponse: response.body,
    };
  }
}
