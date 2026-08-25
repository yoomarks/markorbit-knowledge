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
} from "./ai-distilled-knowledge-acquirer";

export const MANAGED_AI_CAPABILITY_ID = "managed-ai-execution" as const;
export const MANAGED_AI_CONTRACT_VERSION = "1.0.0" as const;
export const MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_ID = "knowledge.ai-distillation" as const;
export const MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_VERSION = "1" as const;
export const MANAGED_AI_KNOWLEDGE_OUTPUT_SCHEMA_ID = "knowledge.ai-distilled-markdown.v1" as const;

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 300_000;
const SHA256 = /^[a-f0-9]{64}$/u;
const SYSTEM_INSTRUCTION =
  "You are an external research lawyer contributing a distilled knowledge artifact. Follow the assignment exactly. Return Markdown only. Do not claim that MarkOrbit verified the legal truth of your answer.";

export type ManagedAiKnowledgeExecutionInputV1 = {
  schemaVersion: 1;
  processingClass: "SOURCE_ACQUISITION";
  dataClassification: "PUBLIC";
  taskInput: {
    schemaVersion: 1;
    kind: "TEXT_GENERATION";
    prompt: string;
    systemInstruction: string;
    outputFormat: "MARKDOWN";
  };
  requestedOutput: {
    schemaId: typeof MANAGED_AI_KNOWLEDGE_OUTPUT_SCHEMA_ID;
    format: "MARKDOWN";
  };
  requirements: {
    capabilities: readonly ["text-generation"];
    maxLatencyMs: number;
    exactProviderOutputRequired: true;
    provenanceRequired: true;
  };
  promptPolicy: {
    policyId: typeof MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_ID;
    policyVersion: typeof MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_VERSION;
  };
  evidence: {
    exactOutput: "REQUIRED";
    providerRequestId: "REQUIRED_WHEN_AVAILABLE";
  };
};

export type ManagedAiKnowledgeAuthorityV1 = {
  canonicalTruthCreated: boolean;
  capabilityCanonMutated: boolean;
  knowledgeApproved: boolean;
  brainConclusionCreated: boolean;
  professionalDecisionCreated: boolean;
  paymentCreated: boolean;
  filingSubmitted: boolean;
  externalMessageSent: boolean;
  externalProfessionalActionExecuted: boolean;
};

export type ManagedAiKnowledgeExecutionOutcomeV1 = {
  schemaVersion: 1;
  capabilityId: typeof MANAGED_AI_CAPABILITY_ID;
  capabilityVersion: typeof MANAGED_AI_CONTRACT_VERSION;
  status: "COMPLETED" | "FAILED" | "BLOCKED" | "REQUIRES_RECONCILIATION";
  deliveryState:
    | "NOT_DELIVERED"
    | "DELIVERED_CONFIRMED"
    | "DELIVERY_UNCERTAIN"
    | "PROVIDER_REJECTED"
    | "PROVIDER_COMPLETED";
  retryDisposition: "RETRY_ALLOWED" | "RETRY_FORBIDDEN" | "RECONCILIATION_REQUIRED";
  provenance?: {
    implementationProfileId: string;
    implementationProfileVersion: number;
    implementationKey: string;
    provider: string;
    model: string;
    promptPolicyId: string;
    promptPolicyVersion: string;
    outputSchemaId: string;
    inputSha256: string;
    providerRequestId?: string;
    startedAt: string;
    completedAt: string;
  };
  exactOutput?:
    | {
        kind: "INLINE_BASE64";
        mediaType: string;
        sha256: string;
        sizeBytes: number;
        dataBase64: string;
      }
    | {
        kind: "DURABLE_REF";
        mediaType: string;
        sha256: string;
        sizeBytes: number;
        ref: string;
      };
  structuredOutput?: unknown;
  error?: {
    code: string;
    message: string;
  };
  authority: ManagedAiKnowledgeAuthorityV1;
};

export interface ManagedAiExecutionClient {
  execute(
    input: Readonly<ManagedAiKnowledgeExecutionInputV1>,
  ): Promise<ManagedAiKnowledgeExecutionOutcomeV1>;
}

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

function assertManagedContractIdentity(outcome: ManagedAiKnowledgeExecutionOutcomeV1): void {
  if (
    outcome.schemaVersion !== 1 ||
    outcome.capabilityId !== MANAGED_AI_CAPABILITY_ID ||
    outcome.capabilityVersion !== MANAGED_AI_CONTRACT_VERSION
  ) {
    throw new AiKnowledgeAcquisitionError(
      "AI_MANAGED_AI_CONTRACT_MISMATCH",
      "Managed AI execution outcome does not match the frozen contract identity",
      false,
    );
  }
}

function assertNoAuthorityEscalation(authority: ManagedAiKnowledgeAuthorityV1): void {
  const escalated = Object.entries(authority).filter(([, value]) => value !== false);
  if (escalated.length > 0) {
    throw new AiKnowledgeAcquisitionError(
      "AI_MANAGED_AI_AUTHORITY_ESCALATION",
      `Managed AI execution attempted authority consequences: ${escalated
        .map(([key]) => key)
        .join(", ")}`,
      false,
    );
  }
}

function mapManagedFailure(outcome: ManagedAiKnowledgeExecutionOutcomeV1): never {
  const providerMessage = outcome.error?.message ?? "Managed AI execution did not complete";
  if (
    outcome.status === "REQUIRES_RECONCILIATION" ||
    outcome.deliveryState === "DELIVERY_UNCERTAIN" ||
    outcome.retryDisposition === "RECONCILIATION_REQUIRED"
  ) {
    const code =
      outcome.error?.code === "TIMEOUT" ? "AI_PROVIDER_TIMEOUT" : "AI_PROVIDER_NETWORK_ERROR";
    throw new AiKnowledgeAcquisitionError(code, providerMessage, true);
  }

  if (outcome.error?.code === "AUTHENTICATION_FAILED") {
    throw new AiKnowledgeAcquisitionError("AI_PROVIDER_CREDENTIAL_MISSING", providerMessage, false);
  }

  if (outcome.deliveryState === "NOT_DELIVERED" && outcome.retryDisposition === "RETRY_ALLOWED") {
    throw new AiKnowledgeAcquisitionError(
      `AI_MANAGED_AI_${outcome.error?.code ?? "NOT_DELIVERED"}`,
      providerMessage,
      true,
    );
  }

  if (
    outcome.deliveryState === "DELIVERED_CONFIRMED" &&
    outcome.retryDisposition === "RETRY_ALLOWED"
  ) {
    throw new AiKnowledgeAcquisitionError("AI_PROVIDER_TEMPORARY_FAILURE", providerMessage, true);
  }

  throw new AiKnowledgeAcquisitionError(
    `AI_MANAGED_AI_${outcome.error?.code ?? "EXECUTION_FAILED"}`,
    providerMessage,
    false,
  );
}

function decodeExactOutput(outcome: ManagedAiKnowledgeExecutionOutcomeV1): Uint8Array {
  const exact = outcome.exactOutput;
  if (!exact) {
    throw new AiKnowledgeAcquisitionError(
      "AI_MANAGED_AI_EXACT_OUTPUT_MISSING",
      "Managed AI completed without required exact provider output",
      false,
    );
  }
  if (exact.kind !== "INLINE_BASE64") {
    throw new AiKnowledgeAcquisitionError(
      "AI_MANAGED_AI_DURABLE_OUTPUT_UNRESOLVED",
      "Knowledge bridge does not resolve durable Managed AI output references yet",
      false,
    );
  }
  if (!SHA256.test(exact.sha256) || !Number.isSafeInteger(exact.sizeBytes) || exact.sizeBytes < 0) {
    throw new AiKnowledgeAcquisitionError(
      "AI_MANAGED_AI_EXACT_OUTPUT_INVALID",
      "Managed AI exact provider output metadata is invalid",
      false,
    );
  }
  const raw = new Uint8Array(Buffer.from(exact.dataBase64, "base64"));
  if (raw.byteLength !== exact.sizeBytes || sha256(raw) !== exact.sha256) {
    throw new AiKnowledgeAcquisitionError(
      "AI_MANAGED_AI_EXACT_OUTPUT_MISMATCH",
      "Managed AI exact provider output failed size/hash verification",
      false,
    );
  }
  return raw;
}

function parseStructuredMarkdown(outcome: ManagedAiKnowledgeExecutionOutcomeV1): string {
  const structured = outcome.structuredOutput;
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) {
    throw new AiKnowledgeAcquisitionError(
      "AI_MANAGED_AI_STRUCTURED_OUTPUT_INVALID",
      "Managed AI structured output must be an object",
      false,
    );
  }
  const record = structured as Record<string, unknown>;
  if (
    record.outputFormat !== "MARKDOWN" ||
    typeof record.text !== "string" ||
    !record.text.trim()
  ) {
    throw new AiKnowledgeAcquisitionError(
      "AI_MANAGED_AI_STRUCTURED_OUTPUT_INVALID",
      "Managed AI structured output must contain non-empty Markdown text",
      false,
    );
  }
  return record.text;
}

function validIsoTimestamp(value: string): boolean {
  return value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

function buildKnowledgeAcquisition(input: {
  request: AiKnowledgeProviderRequest;
  rawResponse: Uint8Array;
  markdown: string;
  model: string;
  providerRequestId?: string;
  requestedAt: string;
  completedAt: string;
}): AiKnowledgeAcquisition {
  const { request, rawResponse, markdown, model, providerRequestId, requestedAt, completedAt } =
    input;
  const promptSha256 = sha256(request.assignment.prompt);
  const rawResponseSha256 = sha256(rawResponse);
  const markdownBytes = Buffer.from(markdown, "utf8");
  const markdownSha256 = sha256(markdownBytes);
  const submissionId = deterministicId(
    "ars",
    `${request.assignment.assignmentId}:DEEPSEEK:${rawResponseSha256}`,
  );
  const submission: AiResearchSubmissionV1 = {
    protocolVersion: AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
    objectType: AI_RESEARCH_SUBMISSION_OBJECT_TYPE,
    submissionId,
    assignmentId: request.assignment.assignmentId,
    provider: "DEEPSEEK",
    model,
    requestedAt,
    completedAt,
    promptSha256,
    rawResponseSha256,
    markdownSha256,
    markdownSizeBytes: markdownBytes.byteLength,
    ...(providerRequestId ? { providerRequestId } : {}),
  };
  const artifactId = deterministicId("adk", `${submissionId}:${markdownSha256}`);
  const artifact: AiDistilledKnowledgeArtifactV1 = {
    protocolVersion: AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
    objectType: AI_DISTILLED_KNOWLEDGE_ARTIFACT_OBJECT_TYPE,
    artifactId,
    assignmentId: request.assignment.assignmentId,
    submissionId,
    provider: "DEEPSEEK",
    model,
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
      content: markdown,
    },
    createdAt: completedAt,
  };
  return { assignment: request.assignment, submission, artifact, rawResponse };
}

export class ManagedAiDeepSeekKnowledgeAdapter implements AiKnowledgeProviderAdapter {
  readonly provider = "DEEPSEEK" as const;

  constructor(private readonly client: ManagedAiExecutionClient) {}

  async acquire(request: AiKnowledgeProviderRequest): Promise<AiKnowledgeAcquisition> {
    assertAiKnowledgeAssignmentV1(request.assignment);
    if (request.model !== undefined) {
      throw new AiKnowledgeAcquisitionError(
        "AI_PROVIDER_MODEL_OVERRIDE_FORBIDDEN",
        "Knowledge callers cannot select the Managed AI provider model",
        false,
      );
    }
    const timeoutMs = boundedTimeout(request.timeoutMs);
    const input: ManagedAiKnowledgeExecutionInputV1 = {
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

    let outcome: ManagedAiKnowledgeExecutionOutcomeV1;
    try {
      outcome = await this.client.execute(input);
    } catch (error) {
      throw new AiKnowledgeAcquisitionError(
        "AI_PROVIDER_NETWORK_ERROR",
        error instanceof Error ? error.message : "Managed AI execution client failed",
        true,
      );
    }

    assertManagedContractIdentity(outcome);
    assertNoAuthorityEscalation(outcome.authority);
    if (outcome.status !== "COMPLETED") mapManagedFailure(outcome);
    if (
      outcome.deliveryState !== "PROVIDER_COMPLETED" ||
      outcome.retryDisposition !== "RETRY_FORBIDDEN"
    ) {
      throw new AiKnowledgeAcquisitionError(
        "AI_MANAGED_AI_COMPLETION_STATE_INVALID",
        "Managed AI completed outcome has invalid delivery/retry semantics",
        false,
      );
    }

    const provenance = outcome.provenance;
    if (
      !provenance ||
      provenance.provider !== "DEEPSEEK" ||
      !provenance.model.trim() ||
      provenance.promptPolicyId !== MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_ID ||
      provenance.promptPolicyVersion !== MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_VERSION ||
      provenance.outputSchemaId !== MANAGED_AI_KNOWLEDGE_OUTPUT_SCHEMA_ID ||
      !validIsoTimestamp(provenance.startedAt) ||
      !validIsoTimestamp(provenance.completedAt)
    ) {
      throw new AiKnowledgeAcquisitionError(
        "AI_MANAGED_AI_PROVENANCE_INVALID",
        "Managed AI provenance does not satisfy the Knowledge bridge contract",
        false,
      );
    }

    const rawResponse = decodeExactOutput(outcome);
    const markdown = parseStructuredMarkdown(outcome);
    return buildKnowledgeAcquisition({
      request,
      rawResponse,
      markdown,
      model: provenance.model,
      ...(provenance.providerRequestId ? { providerRequestId: provenance.providerRequestId } : {}),
      requestedAt: provenance.startedAt,
      completedAt: provenance.completedAt,
    });
  }
}
