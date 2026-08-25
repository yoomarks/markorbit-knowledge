import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AiKnowledgeAssignmentV1 } from "@markorbit/contracts";
import { DeepSeekKnowledgeAdapter, type AiModelTransport } from "./ai-distilled-knowledge-acquirer";
import {
  MANAGED_AI_CAPABILITY_ID,
  MANAGED_AI_CONTRACT_VERSION,
  MANAGED_AI_KNOWLEDGE_OUTPUT_SCHEMA_ID,
  MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_ID,
  MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_VERSION,
  ManagedAiDeepSeekKnowledgeAdapter,
  type ManagedAiExecutionClient,
  type ManagedAiKnowledgeAuthorityV1,
  type ManagedAiKnowledgeExecutionInputV1,
  type ManagedAiKnowledgeExecutionOutcomeV1,
} from "./managed-ai-knowledge-adapter";

const assignment: AiKnowledgeAssignmentV1 = {
  protocolVersion: "1.0",
  objectType: "AI_KNOWLEDGE_ASSIGNMENT",
  assignmentId: "kas_us_trademark_section8",
  jurisdiction: "US",
  domain: "TRADEMARK",
  topic: "DECLARATION_OF_USE",
  title: "United States Trademark Declaration of Use",
  instructionSetId: "kis_trademark_procedure",
  instructionSetRevision: 1,
  language: "zh-CN",
  prompt: "Write a comprehensive Markdown research memo about U.S. trademark declarations of use.",
  createdAt: "2026-08-23T03:00:00.000Z",
};

const STARTED_AT = "2026-08-23T03:00:01.000Z";
const COMPLETED_AT = "2026-08-23T03:00:03.000Z";
const MARKDOWN = "# Section 8\n\nDistilled research content.";

function rawResponse(): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      id: "deepseek-request-1",
      model: "deepseek-v4-flash",
      choices: [{ message: { role: "assistant", content: MARKDOWN } }],
    }),
  );
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function noAuthority(): ManagedAiKnowledgeAuthorityV1 {
  return {
    canonicalTruthCreated: false,
    capabilityCanonMutated: false,
    knowledgeApproved: false,
    brainConclusionCreated: false,
    professionalDecisionCreated: false,
    paymentCreated: false,
    filingSubmitted: false,
    externalMessageSent: false,
    externalProfessionalActionExecuted: false,
  };
}

function completedOutcome(
  overrides: Partial<ManagedAiKnowledgeExecutionOutcomeV1> = {},
): ManagedAiKnowledgeExecutionOutcomeV1 {
  const raw = rawResponse();
  return {
    schemaVersion: 1,
    capabilityId: MANAGED_AI_CAPABILITY_ID,
    capabilityVersion: MANAGED_AI_CONTRACT_VERSION,
    status: "COMPLETED",
    deliveryState: "PROVIDER_COMPLETED",
    retryDisposition: "RETRY_FORBIDDEN",
    provenance: {
      implementationProfileId: "imp_knowledge_deepseek",
      implementationProfileVersion: 1,
      implementationKey: "ai:deepseek:chat-completions:v1",
      provider: "DEEPSEEK",
      model: "deepseek-v4-flash",
      promptPolicyId: MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_ID,
      promptPolicyVersion: MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_VERSION,
      outputSchemaId: MANAGED_AI_KNOWLEDGE_OUTPUT_SCHEMA_ID,
      inputSha256: "a".repeat(64),
      providerRequestId: "deepseek-request-1",
      startedAt: STARTED_AT,
      completedAt: COMPLETED_AT,
    },
    exactOutput: {
      kind: "INLINE_BASE64",
      mediaType: "application/json",
      sha256: sha256(raw),
      sizeBytes: raw.byteLength,
      dataBase64: Buffer.from(raw).toString("base64"),
    },
    structuredOutput: { text: MARKDOWN, outputFormat: "MARKDOWN" },
    authority: noAuthority(),
    ...overrides,
  };
}

function clientReturning(
  outcome: ManagedAiKnowledgeExecutionOutcomeV1,
  captured: ManagedAiKnowledgeExecutionInputV1[] = [],
): ManagedAiExecutionClient {
  return {
    execute: async (input) => {
      captured.push(input);
      return outcome;
    },
  };
}

describe("ManagedAiDeepSeekKnowledgeAdapter", () => {
  it("matches the legacy DeepSeek Knowledge acquisition for the same provider evidence", async () => {
    const raw = rawResponse();
    const transport: AiModelTransport = async () => ({ status: 200, body: raw });
    const moments = [new Date(STARTED_AT), new Date(COMPLETED_AT)];
    const legacy = new DeepSeekKnowledgeAdapter({
      environment: { DEEPSEEK_API_KEY: "runtime-secret" },
      transport,
      now: () => moments.shift()!,
    });
    const managed = new ManagedAiDeepSeekKnowledgeAdapter(clientReturning(completedOutcome()));

    const legacyAcquisition = await legacy.acquire({ assignment });
    const managedAcquisition = await managed.acquire({ assignment });

    expect(managedAcquisition).toEqual(legacyAcquisition);
  });

  it("sends a provider-neutral governed request without model, endpoint or credentials", async () => {
    const captured: ManagedAiKnowledgeExecutionInputV1[] = [];
    const adapter = new ManagedAiDeepSeekKnowledgeAdapter(
      clientReturning(completedOutcome(), captured),
    );

    await adapter.acquire({ assignment, timeoutMs: 45_000 });

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      schemaVersion: 1,
      processingClass: "SOURCE_ACQUISITION",
      dataClassification: "PUBLIC",
      taskInput: {
        schemaVersion: 1,
        kind: "TEXT_GENERATION",
        prompt: assignment.prompt,
        outputFormat: "MARKDOWN",
      },
      requestedOutput: {
        schemaId: MANAGED_AI_KNOWLEDGE_OUTPUT_SCHEMA_ID,
        format: "MARKDOWN",
      },
      requirements: {
        capabilities: ["text-generation"],
        maxLatencyMs: 45_000,
        exactProviderOutputRequired: true,
        provenanceRequired: true,
      },
    });
    const serialized = JSON.stringify(captured[0]);
    expect(serialized).not.toContain("DEEPSEEK");
    expect(serialized).not.toContain("deepseek-v4-flash");
    expect(serialized).not.toContain("api.deepseek.com");
    expect(serialized).not.toContain("runtime-secret");
  });

  it("maps delivery uncertainty into the existing worker reconciliation classification", async () => {
    const adapter = new ManagedAiDeepSeekKnowledgeAdapter(
      clientReturning({
        ...completedOutcome(),
        status: "REQUIRES_RECONCILIATION",
        deliveryState: "DELIVERY_UNCERTAIN",
        retryDisposition: "RECONCILIATION_REQUIRED",
        provenance: undefined,
        exactOutput: undefined,
        structuredOutput: undefined,
        error: { code: "TIMEOUT", message: "Provider delivery could not be proven" },
      }),
    );

    await expect(adapter.acquire({ assignment })).rejects.toMatchObject({
      code: "AI_PROVIDER_TIMEOUT",
      retryable: true,
    });
  });

  it("allows retry only when the managed result proves non-delivery", async () => {
    const adapter = new ManagedAiDeepSeekKnowledgeAdapter(
      clientReturning({
        ...completedOutcome(),
        status: "FAILED",
        deliveryState: "NOT_DELIVERED",
        retryDisposition: "RETRY_ALLOWED",
        provenance: undefined,
        exactOutput: undefined,
        structuredOutput: undefined,
        error: {
          code: "NETWORK_FAILURE_BEFORE_DELIVERY",
          message: "Connection failed before request delivery",
        },
      }),
    );

    await expect(adapter.acquire({ assignment })).rejects.toMatchObject({
      code: "AI_MANAGED_AI_NETWORK_FAILURE_BEFORE_DELIVERY",
      retryable: true,
    });
  });

  it("fails closed if managed execution claims Knowledge or other authority", async () => {
    const adapter = new ManagedAiDeepSeekKnowledgeAdapter(
      clientReturning(
        completedOutcome({
          authority: { ...noAuthority(), knowledgeApproved: true },
        }),
      ),
    );

    await expect(adapter.acquire({ assignment })).rejects.toMatchObject({
      code: "AI_MANAGED_AI_AUTHORITY_ESCALATION",
      retryable: false,
    });
  });

  it("fails closed when exact provider evidence is not directly resolvable", async () => {
    const adapter = new ManagedAiDeepSeekKnowledgeAdapter(
      clientReturning(
        completedOutcome({
          exactOutput: {
            kind: "DURABLE_REF",
            mediaType: "application/json",
            sha256: "b".repeat(64),
            sizeBytes: 128,
            ref: "managed-ai-output://out_1",
          },
        }),
      ),
    );

    await expect(adapter.acquire({ assignment })).rejects.toMatchObject({
      code: "AI_MANAGED_AI_DURABLE_OUTPUT_UNRESOLVED",
      retryable: false,
    });
  });

  it("rejects caller model overrides because implementation selection belongs to Managed AI", async () => {
    const captured: ManagedAiKnowledgeExecutionInputV1[] = [];
    const adapter = new ManagedAiDeepSeekKnowledgeAdapter(
      clientReturning(completedOutcome(), captured),
    );

    await expect(
      adapter.acquire({ assignment, model: "caller-selected-model" }),
    ).rejects.toMatchObject({
      code: "AI_PROVIDER_MODEL_OVERRIDE_FORBIDDEN",
      retryable: false,
    });
    expect(captured).toHaveLength(0);
  });
});
