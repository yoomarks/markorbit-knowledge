import { describe, expect, it } from "vitest";
import {
  CapabilityRuntimeV2ManagedAiExecutionClient,
  encodeCapabilityRuntimeWorkspacePrincipal,
} from "./capability-runtime-v2-http-client";
import type { ManagedAiKnowledgeExecutionInputV1 } from "./managed-ai-knowledge-adapter";

const principalValue = {
  kind: "WORKSPACE" as const,
  sessionId: "session_authority_test",
  userId: "user_authority_test",
  workspaceId: "workspace_authority_test",
  membershipId: "membership_authority_test",
  role: "WORKSPACE_ADMIN",
  permissions: ["workspace:read"],
  sessionExpiresAt: "2030-01-01T00:00:00.000Z",
};
const principal = encodeCapabilityRuntimeWorkspacePrincipal(principalValue);
const idempotencyKey = `knowledge-adk:${"c".repeat(64)}`;
const correlationId = `knowledge-adk:${"d".repeat(32)}`;
const secret = "knowledge-authority-test-secret-123456789";

const input: ManagedAiKnowledgeExecutionInputV1 = {
  schemaVersion: 1,
  processingClass: "SOURCE_ACQUISITION",
  dataClassification: "PUBLIC",
  taskInput: {
    schemaVersion: 1,
    kind: "TEXT_GENERATION",
    prompt: "test",
    systemInstruction: "Return governed Markdown without claiming verified legal truth.",
    outputFormat: "MARKDOWN",
  },
  requestedOutput: { schemaId: "knowledge.ai-distilled-markdown.v1", format: "MARKDOWN" },
  requirements: {
    capabilities: ["text-generation"],
    maxLatencyMs: 300_000,
    exactProviderOutputRequired: true,
    provenanceRequired: true,
  },
  promptPolicy: { policyId: "knowledge.ai-distillation", policyVersion: "1" },
  evidence: { exactOutput: "REQUIRED", providerRequestId: "REQUIRED_WHEN_AVAILABLE" },
};

const managedOutcome = {
  schemaVersion: 1,
  capabilityId: "managed-ai-execution",
  capabilityVersion: "1.0.0",
  status: "FAILED",
  deliveryState: "NOT_DELIVERED",
  retryDisposition: "RETRY_ALLOWED",
  error: { code: "RATE_LIMITED", message: "rate limited" },
  authority: {
    canonicalTruthCreated: false,
    capabilityCanonMutated: false,
    knowledgeApproved: false,
    brainConclusionCreated: false,
    professionalDecisionCreated: false,
    paymentCreated: false,
    filingSubmitted: false,
    externalMessageSent: false,
    externalProfessionalActionExecuted: false,
  },
} as const;

const exactOuterAuthority = {
  canonicalTruthCreated: false,
  capabilityCanonMutated: false,
  professionalDecisionCreated: false,
  providerSelectionAuthorityGrantedToCaller: false,
  paymentCreated: false,
  filingSubmitted: false,
  externalMessageSent: false,
  externalProfessionalActionExecuted: false,
} as const;

function responseWithAuthority(authority: unknown) {
  return {
    request: {
      schemaVersion: 2,
      capabilityId: "managed-ai-execution",
      capabilityVersion: "1.0.0",
      caller: {
        workspaceId: principalValue.workspaceId,
        principalId: principalValue.userId,
        callerProduct: "KNOWLEDGE",
        permissionContextRef: `core-workspace-membership:${principalValue.membershipId}`,
      },
      purpose: "Acquire a sourced Knowledge artifact through governed Managed AI execution.",
      input,
      inputSchemaId: "managed-ai-input.v1",
      outputSchemaId: "managed-ai-output.v1",
      riskClass: "MODERATE",
      idempotencyKey,
      correlationId,
    },
    binding: {
      runtimeCapability: {
        capabilityId: "managed-ai-execution",
        capabilityVersion: "1.0.0",
      },
      implementation: { kind: "AI_ASSISTED_SERVICE" },
    },
    outcome: {
      status: "FAILED",
      outputSchemaId: "managed-ai-output.v1",
      output: managedOutcome,
      authority,
    },
    returnValue: {
      status: "FAILED",
      outputSchemaId: "managed-ai-output.v1",
      output: managedOutcome,
      authority: exactOuterAuthority,
    },
    receipt: {
      correlationId,
      workspaceId: principalValue.workspaceId,
      principalId: principalValue.userId,
      callerProduct: "KNOWLEDGE",
      authority: exactOuterAuthority,
    },
    replayed: false,
  };
}

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

describe("Capability Runtime V2 outer authority envelope", () => {
  it.each([
    ["missing authority consequences", {}],
    ["extra authority consequence", { ...exactOuterAuthority, knowledgeApproved: false }],
    ["promoted authority consequence", { ...exactOuterAuthority, externalMessageSent: true }],
  ])("rejects %s", async (_, authority) => {
    const client = new CapabilityRuntimeV2ManagedAiExecutionClient({
      baseUrl: "http://core.internal/",
      internalServiceSecret: secret,
      workspacePrincipal: principal,
      idempotencyKey,
      correlationId,
      now: () => new Date("2026-08-26T15:00:00.000Z"),
      transport: async () => ({ status: 201, body: bytes(responseWithAuthority(authority)) }),
    });

    await expect(client.execute(input)).rejects.toMatchObject({
      code: "AI_MANAGED_AI_CAPABILITY_ENVELOPE_MISMATCH",
      retryable: false,
    });
  });
});
