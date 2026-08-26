import { describe, expect, it, vi } from "vitest";
import {
  CapabilityRuntimeV2ManagedAiExecutionClient,
  CAPABILITY_RUNTIME_V2_ROUTE,
  encodeCapabilityRuntimeWorkspacePrincipal,
} from "./capability-runtime-v2-http-client";
import { ManagedAiHttpTransportError } from "./managed-ai-execution-http-client";
import type { ManagedAiKnowledgeExecutionInputV1 } from "./managed-ai-knowledge-adapter";

const secret = "knowledge-capability-v2-internal-secret-123456";
const principalValue = {
  kind: "WORKSPACE" as const,
  sessionId: "session_capability_v2",
  userId: "user_capability_v2",
  workspaceId: "workspace_capability_v2",
  membershipId: "membership_capability_v2",
  role: "WORKSPACE_ADMIN",
  permissions: ["workspace:read"],
  sessionExpiresAt: "2030-01-01T00:00:00.000Z",
};
const principal = encodeCapabilityRuntimeWorkspacePrincipal(principalValue);
const idempotencyKey = "knowledge-adk:" + "a".repeat(64);
const correlationId = "knowledge-adk:" + "b".repeat(32);

const input: ManagedAiKnowledgeExecutionInputV1 = {
  schemaVersion: 1,
  processingClass: "SOURCE_ACQUISITION",
  dataClassification: "PUBLIC",
  taskInput: {
    schemaVersion: 1,
    kind: "TEXT_GENERATION",
    prompt: "Return one governed Markdown artifact.",
    systemInstruction: "Return governed Markdown without claiming verified legal truth.",
    outputFormat: "MARKDOWN",
  },
  requestedOutput: {
    schemaId: "knowledge.ai-distilled-markdown.v1",
    format: "MARKDOWN",
  },
  requirements: {
    capabilities: ["text-generation"],
    maxLatencyMs: 300_000,
    exactProviderOutputRequired: true,
    provenanceRequired: true,
  },
  promptPolicy: {
    policyId: "knowledge.ai-distillation",
    policyVersion: "1",
  },
  evidence: {
    exactOutput: "REQUIRED",
    providerRequestId: "REQUIRED_WHEN_AVAILABLE",
  },
};

const managedOutcome = {
  schemaVersion: 1,
  capabilityId: "managed-ai-execution",
  capabilityVersion: "1.0.0",
  status: "FAILED",
  deliveryState: "NOT_DELIVERED",
  retryDisposition: "RETRY_ALLOWED",
  error: { code: "RATE_LIMITED", message: "Provider rate limited the request." },
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

const outerAuthority = {
  canonicalTruthCreated: false,
  capabilityCanonMutated: false,
  professionalDecisionCreated: false,
  providerSelectionAuthorityGrantedToCaller: false,
  paymentCreated: false,
  filingSubmitted: false,
  externalMessageSent: false,
  externalProfessionalActionExecuted: false,
} as const;

function execution(overrides: Record<string, unknown> = {}) {
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
      capabilityRequestId: "capreq_test",
      receivedAt: "2026-08-26T15:00:00.000Z",
    },
    binding: {
      runtimeCapability: {
        id: "runtime-capability_test",
        version: 1,
        capabilityId: "managed-ai-execution",
        capabilityVersion: "1.0.0",
      },
      implementation: {
        id: "implementation-profile_test",
        version: 1,
        implementationKey: "ai:deepseek:chat-completions:v1",
        kind: "AI_ASSISTED_SERVICE",
      },
    },
    outcome: {
      status: "FAILED",
      outputSchemaId: "managed-ai-output.v1",
      output: managedOutcome,
      authority: outerAuthority,
    },
    returnValue: {
      status: "FAILED",
      outputSchemaId: "managed-ai-output.v1",
      output: managedOutcome,
      authority: outerAuthority,
    },
    receipt: {
      correlationId,
      workspaceId: principalValue.workspaceId,
      principalId: principalValue.userId,
      callerProduct: "KNOWLEDGE",
      authority: outerAuthority,
    },
    replayed: false,
    ...overrides,
  };
}

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

describe("CapabilityRuntimeV2ManagedAiExecutionClient", () => {
  it("sends trusted Knowledge caller context without provider/model/profile controls and unwraps preserved output", async () => {
    const transport = vi.fn(async (request) => {
      const body = JSON.parse(request.body) as Record<string, unknown>;
      expect(request.url).toBe(`http://core.internal${CAPABILITY_RUNTIME_V2_ROUTE}`);
      expect(request.headers["x-markorbit-principal"]).toBe(principal);
      expect(request.headers["x-markorbit-workspace-id"]).toBe(principalValue.workspaceId);
      expect(request.headers["x-markorbit-caller-product"]).toBe("KNOWLEDGE");
      expect(request.headers["idempotency-key"]).toBe(idempotencyKey);
      expect(request.headers["x-correlation-id"]).toBe(correlationId);
      expect(body).toMatchObject({
        schemaVersion: 2,
        capabilityId: "managed-ai-execution",
        capabilityVersion: "1.0.0",
        caller: {
          workspaceId: principalValue.workspaceId,
          principalId: principalValue.userId,
          callerProduct: "KNOWLEDGE",
          permissionContextRef: `core-workspace-membership:${principalValue.membershipId}`,
        },
        inputSchemaId: "managed-ai-input.v1",
        outputSchemaId: "managed-ai-output.v1",
        riskClass: "MODERATE",
        idempotencyKey,
        correlationId,
      });
      expect(request.body).not.toContain("DEEPSEEK");
      expect(request.body).not.toContain("deepseek-chat");
      expect(request.body).not.toContain("implementation-profile");
      return { status: 201, body: bytes(execution()) };
    });
    const client = new CapabilityRuntimeV2ManagedAiExecutionClient({
      baseUrl: "http://core.internal/",
      internalServiceSecret: secret,
      workspacePrincipal: principal,
      idempotencyKey,
      correlationId,
      transport,
      now: () => new Date("2026-08-26T15:00:00.000Z"),
    });

    await expect(client.execute(input)).resolves.toEqual(managedOutcome);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("rejects pre-repair FAILED -> REVIEW_REQUIRED Capability semantics", async () => {
    const client = new CapabilityRuntimeV2ManagedAiExecutionClient({
      baseUrl: "http://core.internal/",
      internalServiceSecret: secret,
      workspacePrincipal: principal,
      idempotencyKey,
      correlationId,
      now: () => new Date("2026-08-26T15:00:00.000Z"),
      transport: async () => ({
        status: 201,
        body: bytes(
          execution({
            outcome: {
              status: "REQUIRES_REVIEW",
              outputSchemaId: "managed-ai-output.v1",
              output: managedOutcome,
              authority: outerAuthority,
            },
            returnValue: {
              status: "REVIEW_REQUIRED",
              outputSchemaId: "managed-ai-output.v1",
              output: managedOutcome,
              authority: outerAuthority,
            },
          }),
        ),
      }),
    });

    await expect(client.execute(input)).rejects.toMatchObject({
      code: "AI_MANAGED_AI_CAPABILITY_STATUS_MISMATCH",
      retryable: false,
    });
  });

  it("accepts REQUIRES_RECONCILIATION only as Capability REQUIRES_REVIEW", async () => {
    const reconciliationOutcome = {
      ...managedOutcome,
      status: "REQUIRES_RECONCILIATION",
      deliveryState: "DELIVERY_UNCERTAIN",
      retryDisposition: "RECONCILIATION_REQUIRED",
      error: { code: "DELIVERY_UNCERTAIN", message: "Delivery must be reconciled." },
    } as const;
    const client = new CapabilityRuntimeV2ManagedAiExecutionClient({
      baseUrl: "http://core.internal/",
      internalServiceSecret: secret,
      workspacePrincipal: principal,
      idempotencyKey,
      correlationId,
      now: () => new Date("2026-08-26T15:00:00.000Z"),
      transport: async () => ({
        status: 200,
        body: bytes(
          execution({
            outcome: {
              status: "REQUIRES_REVIEW",
              outputSchemaId: "managed-ai-output.v1",
              output: reconciliationOutcome,
              authority: outerAuthority,
            },
            returnValue: {
              status: "REVIEW_REQUIRED",
              outputSchemaId: "managed-ai-output.v1",
              output: reconciliationOutcome,
              authority: outerAuthority,
            },
            replayed: true,
          }),
        ),
      }),
    });

    await expect(client.execute(input)).resolves.toEqual(reconciliationOutcome);
  });

  it("rejects an expired or insufficient Workspace Principal before transport", () => {
    const expired = encodeCapabilityRuntimeWorkspacePrincipal({
      ...principalValue,
      sessionExpiresAt: "2026-08-26T14:59:59.000Z",
    });
    expect(
      () =>
        new CapabilityRuntimeV2ManagedAiExecutionClient({
          baseUrl: "http://core.internal/",
          internalServiceSecret: secret,
          workspacePrincipal: expired,
          idempotencyKey,
          correlationId,
          now: () => new Date("2026-08-26T15:00:00.000Z"),
        }),
    ).toThrow("workspacePrincipal must contain an unexpired sessionExpiresAt");

    const insufficient = encodeCapabilityRuntimeWorkspacePrincipal({
      ...principalValue,
      permissions: ["matter:read"],
    });
    expect(
      () =>
        new CapabilityRuntimeV2ManagedAiExecutionClient({
          baseUrl: "http://core.internal/",
          internalServiceSecret: secret,
          workspacePrincipal: insufficient,
          idempotencyKey,
          correlationId,
          now: () => new Date("2026-08-26T15:00:00.000Z"),
        }),
    ).toThrow("workspacePrincipal must be a Workspace Principal with workspace:read");
  });

  it("rejects response caller spoofing and maps transport uncertainty to fail-closed provider-network semantics", async () => {
    const spoofed = new CapabilityRuntimeV2ManagedAiExecutionClient({
      baseUrl: "http://core.internal/",
      internalServiceSecret: secret,
      workspacePrincipal: principal,
      idempotencyKey,
      correlationId,
      now: () => new Date("2026-08-26T15:00:00.000Z"),
      transport: async () => ({
        status: 200,
        body: bytes(
          execution({
            receipt: {
              correlationId,
              workspaceId: "workspace_other",
              principalId: principalValue.userId,
              callerProduct: "KNOWLEDGE",
              authority: outerAuthority,
            },
          }),
        ),
      }),
    });
    await expect(spoofed.execute(input)).rejects.toMatchObject({
      code: "AI_MANAGED_AI_CAPABILITY_ENVELOPE_MISMATCH",
      retryable: false,
    });

    const uncertain = new CapabilityRuntimeV2ManagedAiExecutionClient({
      baseUrl: "http://core.internal/",
      internalServiceSecret: secret,
      workspacePrincipal: principal,
      idempotencyKey,
      correlationId,
      now: () => new Date("2026-08-26T15:00:00.000Z"),
      transport: async () => {
        throw new ManagedAiHttpTransportError(
          "MANAGED_AI_HTTP_NETWORK_ERROR",
          "synthetic network uncertainty",
          true,
        );
      },
    });
    await expect(uncertain.execute(input)).rejects.toMatchObject({
      code: "AI_PROVIDER_NETWORK_ERROR",
      retryable: false,
    });
  });
});
