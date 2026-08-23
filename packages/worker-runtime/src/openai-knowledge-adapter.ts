import { createHash } from "node:crypto";
import {
  AI_DISTILLED_KNOWLEDGE_ARTIFACT_OBJECT_TYPE,
  AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
  AI_RESEARCH_SUBMISSION_OBJECT_TYPE,
  assertAiKnowledgeAssignmentV1,
  type AiDistilledKnowledgeArtifactV1,
  type AiResearchSubmissionV1,
} from "@markorbit/contracts";
import {
  AiKnowledgeAcquisitionError,
  type AiKnowledgeAcquisition,
  type AiKnowledgeProviderAdapter,
  type AiKnowledgeProviderRequest,
  type AiModelTransport,
  type AiModelTransportRequest,
  type AiModelTransportResponse,
} from "./ai-distilled-knowledge-acquirer";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const OPENAI_DEFAULT_MODEL = "gpt-5.6-luna";
const OPENAI_SECRET_ENV = "OPENAI_API_KEY";
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function deterministicId(prefix: "ars" | "adk", seed: string): string {
  return `${prefix}_${sha256(seed).slice(0, 32)}`;
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
    return { status: response.status, body };
  } catch (error) {
    if (error instanceof AiKnowledgeAcquisitionError) throw error;
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new AiKnowledgeAcquisitionError(
      aborted ? "AI_PROVIDER_TIMEOUT" : "AI_PROVIDER_NETWORK_ERROR",
      aborted ? "AI provider request timed out" : "AI provider request failed",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function parseOpenAiResponse(raw: Uint8Array): {
  markdown: string;
  model: string;
  providerRequestId?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new AiKnowledgeAcquisitionError(
      "AI_PROVIDER_RESPONSE_INVALID",
      "OpenAI returned invalid JSON",
      false,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AiKnowledgeAcquisitionError(
      "AI_PROVIDER_RESPONSE_INVALID",
      "OpenAI response must be an object",
      false,
    );
  }
  const response = parsed as Record<string, unknown>;
  const output = Array.isArray(response.output) ? response.output : [];
  const texts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object" || Array.isArray(part)) continue;
      const entry = part as Record<string, unknown>;
      if (entry.type === "output_text" && typeof entry.text === "string") {
        texts.push(entry.text);
      }
    }
  }
  const markdown = texts.join("\n").trim();
  if (!markdown) {
    throw new AiKnowledgeAcquisitionError(
      "AI_PROVIDER_CONTENT_MISSING",
      "OpenAI response did not contain non-empty output_text Markdown",
      false,
    );
  }
  const model =
    typeof response.model === "string" && response.model ? response.model : OPENAI_DEFAULT_MODEL;
  const providerRequestId =
    typeof response.id === "string" && response.id ? response.id : undefined;
  return providerRequestId ? { markdown, model, providerRequestId } : { markdown, model };
}

export type OpenAiKnowledgeAdapterOptions = {
  environment?: NodeJS.ProcessEnv;
  transport?: AiModelTransport;
  endpoint?: string;
  secretEnv?: string;
  maxResponseBytes?: number;
  now?: () => Date;
};

export class OpenAiKnowledgeAdapter implements AiKnowledgeProviderAdapter {
  readonly provider = "OPENAI" as const;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly transport: AiModelTransport;
  private readonly endpoint: string;
  private readonly secretEnv: string;
  private readonly maxResponseBytes: number;
  private readonly now: () => Date;

  constructor(options: OpenAiKnowledgeAdapterOptions = {}) {
    this.environment = options.environment ?? process.env;
    this.transport = options.transport ?? defaultTransport;
    this.endpoint = options.endpoint ?? OPENAI_ENDPOINT;
    this.secretEnv = options.secretEnv ?? OPENAI_SECRET_ENV;
    this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    this.now = options.now ?? (() => new Date());
    if (this.endpoint !== OPENAI_ENDPOINT) {
      throw new AiKnowledgeAcquisitionError(
        "AI_PROVIDER_ENDPOINT_INVALID",
        "OpenAI production adapter only permits the canonical HTTPS Responses endpoint",
        false,
      );
    }
  }

  async acquire(request: AiKnowledgeProviderRequest): Promise<AiKnowledgeAcquisition> {
    assertAiKnowledgeAssignmentV1(request.assignment);
    const secret = this.environment[this.secretEnv];
    if (!secret) {
      throw new AiKnowledgeAcquisitionError(
        "AI_PROVIDER_CREDENTIAL_MISSING",
        `OpenAI credential environment variable ${this.secretEnv} is not configured`,
        false,
      );
    }
    const requestedAt = this.now().toISOString();
    const model = request.model ?? OPENAI_DEFAULT_MODEL;
    const providerBody = JSON.stringify({
      model,
      instructions:
        "You are an external research lawyer contributing a distilled knowledge artifact. Follow the assignment exactly. Return Markdown only. Do not claim that MarkOrbit verified the legal truth of your answer.",
      input: request.assignment.prompt,
    });
    const raw = await this.transport({
      url: this.endpoint,
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: providerBody,
      timeoutMs: boundedTimeout(request.timeoutMs),
      maxResponseBytes: this.maxResponseBytes,
    });
    if (raw.status === 429 || raw.status >= 500) {
      throw new AiKnowledgeAcquisitionError(
        "AI_PROVIDER_TEMPORARY_FAILURE",
        `OpenAI returned HTTP ${raw.status}`,
        true,
      );
    }
    if (raw.status < 200 || raw.status >= 300) {
      throw new AiKnowledgeAcquisitionError(
        "AI_PROVIDER_REJECTED",
        `OpenAI returned HTTP ${raw.status}`,
        false,
      );
    }
    const parsed = parseOpenAiResponse(raw.body);
    const completedAt = this.now().toISOString();
    const promptSha256 = sha256(request.assignment.prompt);
    const rawResponseSha256 = sha256(raw.body);
    const markdownBytes = Buffer.from(parsed.markdown, "utf8");
    const markdownSha256 = sha256(markdownBytes);
    const submissionId = deterministicId(
      "ars",
      `${request.assignment.assignmentId}:${this.provider}:${rawResponseSha256}`,
    );
    const submission: AiResearchSubmissionV1 = {
      protocolVersion: AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
      objectType: AI_RESEARCH_SUBMISSION_OBJECT_TYPE,
      submissionId,
      assignmentId: request.assignment.assignmentId,
      provider: this.provider,
      model: parsed.model,
      requestedAt,
      completedAt,
      promptSha256,
      rawResponseSha256,
      markdownSha256,
      markdownSizeBytes: markdownBytes.byteLength,
      ...(parsed.providerRequestId ? { providerRequestId: parsed.providerRequestId } : {}),
    };
    const artifactId = deterministicId("adk", `${submissionId}:${markdownSha256}`);
    const artifact: AiDistilledKnowledgeArtifactV1 = {
      protocolVersion: AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
      objectType: AI_DISTILLED_KNOWLEDGE_ARTIFACT_OBJECT_TYPE,
      artifactId,
      assignmentId: request.assignment.assignmentId,
      submissionId,
      provider: this.provider,
      model: parsed.model,
      instructionSetId: request.assignment.instructionSetId,
      instructionSetRevision: request.assignment.instructionSetRevision,
      provenance: {
        sourceKind: "SYNTHETIC_AI",
        legalTruthVerified: false,
        rawResponseSha256,
        promptSha256,
      },
      content: {
        mediaType: "text/markdown",
        encoding: "utf-8",
        sha256: markdownSha256,
        sizeBytes: markdownBytes.byteLength,
        contentAddressedRef: `cas:sha256:${markdownSha256}`,
        content: parsed.markdown,
      },
      createdAt: completedAt,
    };
    return { assignment: request.assignment, submission, artifact, rawResponse: raw.body };
  }
}
