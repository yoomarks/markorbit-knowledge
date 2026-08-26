import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  ManagedAiKnowledgeAuthorityV1,
  ManagedAiKnowledgeExecutionInputV1,
  ManagedAiKnowledgeExecutionOutcomeV1,
} from "./managed-ai-knowledge-adapter";
import {
  CAPABILITY_RUNTIME_CALLER_PRODUCT,
  CAPABILITY_RUNTIME_V2_ROUTE,
  MANAGED_AI_EXACT_OUTPUT_RESOLUTION_ROUTE,
  CapabilityRuntimeManagedAiHttpClient,
} from "./capability-runtime-managed-ai-http-client";
import {
  ManagedAiHttpTransportError,
  type ManagedAiHttpTransportRequest,
  type ManagedAiHttpTransportResponse,
} from "./managed-ai-execution-http-client";

const secret = "knowledge-core-internal-secret-1234567890";
const principal = {
  workspaceId: "workspace_knowledge_acceptance",
  principalId: "principal_knowledge_worker",
  membershipId: "membership_knowledge_worker",
} as const;
const implementationKey = "ai:deepseek:chat-completions:v1";

function input(): ManagedAiKnowledgeExecutionInputV1 {
  return {
    schemaVersion: 1,
    processingClass: "SOURCE_ACQUISITION",
    dataClassification: "PUBLIC",
    taskInput: {
      schemaVersion: 1,
      kind: "TEXT_GENERATION",
      prompt: "Research Section 8 requirements",
      systemInstruction: "Return Markdown only",
      outputFormat: "MARKDOWN",
    },
    requestedOutput: {
      schemaId: "knowledge.ai-distilled-markdown.v1",
      format: "MARKDOWN",
    },
    requirements: {
      capabilities: ["text-generation"],
      maxLatencyMs: 45_000,
      exactProviderOutputRequired: true,
      provenanceRequired: true,
    },
    promptPolicy: { policyId: "knowledge.ai-distillation", policyVersion: "1" },
    evidence: { exactOutput: "REQUIRED", providerRequestId: "REQUIRED_WHEN_AVAILABLE" },
  };
}

function managedAuthority(): ManagedAiKnowledgeAuthorityV1 {
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

function capabilityAuthority() {
  return {
    canonicalTruthCreated: false,
    capabilityCanonMutated: false,
    professionalDecisionCreated: false,
    providerSelectionAuthorityGrantedToCaller: false,
    paymentCreated: false,
    filingSubmitted: false,
    externalMessageSent: false,
    externalProfessionalActionExecuted: false,
  } as const;
}

function managedOutcome(status: "COMPLETED" | "REQUIRES_RECONCILIATION" = "COMPLETED") {
  return {
    schemaVersion: 1,
    capabilityId: "managed-ai-execution",
    capabilityVersion: "1.0.0",
    status,
    deliveryState: status === "COMPLETED" ? "PROVIDER_COMPLETED" : "DELIVERY_UNCERTAIN",
    retryDisposition: status === "COMPLETED" ? "RETRY_FORBIDDEN" : "RECONCILIATION_REQUIRED",
    provenance: {
      implementationProfileId: "managed-ai:knowledge-deepseek:v1",
      implementationProfileVersion: 1,
      implementationKey,
      provider: "DEEPSEEK",
      model: "deepseek-v4-flash",
      promptPolicyId: "knowledge.ai-distillation",
      promptPolicyVersion: "1",
      outputSchemaId: "knowledge.ai-distilled-markdown.v1",
      inputSha256: "a".repeat(64),
      startedAt: "2026-08-27T00:00:00.000Z",
      completedAt: "2026-08-27T00:00:01.000Z",
    },
    authority: managedAuthority(),
  } as ManagedAiKnowledgeExecutionOutcomeV1;
}

function envelope(
  outcome: ManagedAiKnowledgeExecutionOutcomeV1 = managedOutcome(),
  status: "SUCCEEDED" | "REQUIRES_REVIEW" | "FAILED" = "SUCCEEDED",
) {
  return {
    replayed: false,
    binding: {
      runtimeCapability: {
        id: "runtime-capability-definition_test",
        version: 1,
        capabilityId: "managed-ai-execution",
        capabilityVersion: "1.0.0",
      },
      implementation: {
        id: "implementation-profile_test",
        version: 1,
        implementationKey,
        kind: "AI_ASSISTED_SERVICE",
      },
    },
    outcome: { status, output: outcome, authority: capabilityAuthority() },
    returnValue: {
      status:
        status === "REQUIRES_REVIEW"
          ? "REVIEW_REQUIRED"
          : status === "FAILED"
            ? "FAILED"
            : "COMPLETED",
      output: outcome,
      authority: capabilityAuthority(),
    },
    receipt: { implementation: { implementationKey }, authority: capabilityAuthority() },
  };
}

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function client(
  transport: (
    request: Readonly<ManagedAiHttpTransportRequest>,
  ) => Promise<ManagedAiHttpTransportResponse>,
) {
  return new CapabilityRuntimeManagedAiHttpClient({
    baseUrl: "http://127.0.0.1:4105/base",
    internalServiceSecret: secret,
    idempotencyKey: "knowledge-capability:stable-key",
    correlationId: "knowledge-capability:correlation",
    principal,
    transport,
  });
}

describe("CapabilityRuntimeManagedAiHttpClient", () => {
  it("sends only governed capability intent plus trusted Workspace Principal context", async () => {
    let captured: ManagedAiHttpTransportRequest | undefined;
    await expect(
      client((request) => {
        captured = request;
        return Promise.resolve({ status: 201, body: bytes(envelope()) });
      }).execute(input()),
    ).resolves.toMatchObject({ status: "COMPLETED" });

    expect(captured?.url).toBe(`http://127.0.0.1:4105${CAPABILITY_RUNTIME_V2_ROUTE}`);
    expect(captured?.headers).toMatchObject({
      "x-markorbit-internal-authorization": secret,
      "x-markorbit-workspace-id": principal.workspaceId,
      "x-markorbit-caller-product": CAPABILITY_RUNTIME_CALLER_PRODUCT,
      "idempotency-key": "knowledge-capability:stable-key",
      "x-correlation-id": "knowledge-capability:correlation",
    });
    const encodedPrincipal = captured?.headers["x-markorbit-principal"];
    expect(encodedPrincipal).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(encodedPrincipal!, "base64url").toString("utf8"));
    expect(decoded).toEqual({
      schemaVersion: 1,
      principal: {
        kind: "WORKSPACE",
        sessionId: `knowledge-worker:${principal.principalId}`,
        userId: principal.principalId,
        workspaceId: principal.workspaceId,
        membershipId: principal.membershipId,
        role: "REVIEWER",
        permissions: ["workspace:read"],
        sessionExpiresAt: "9999-12-31T23:59:59.999Z",
      },
    });

    const command = JSON.parse(captured?.body ?? "{}") as Record<string, unknown>;
    expect(command).toMatchObject({
      schemaVersion: 2,
      capabilityId: "managed-ai-execution",
      capabilityVersion: "1.0.0",
      caller: {
        workspaceId: principal.workspaceId,
        principalId: principal.principalId,
        callerProduct: "KNOWLEDGE",
        permissionContextRef: `core-workspace-membership:${principal.membershipId}`,
      },
      inputSchemaId: "managed-ai-input.v1",
      outputSchemaId: "managed-ai-output.v1",
      riskClass: "MODERATE",
    });
    for (const forbidden of [
      "provider",
      "model",
      "credential",
      "implementationKey",
      "implementationProfileId",
    ]) {
      expect(command).not.toHaveProperty(forbidden);
    }
    expect(JSON.stringify(command.input)).not.toContain("DEEPSEEK");
    expect(JSON.stringify(command.input)).not.toContain("deepseek-v4-flash");
    expect(JSON.stringify(command)).not.toContain(secret);
  });

  it("resolves a durable exact-output ref through the authenticated Core evidence route", async () => {
    const exact = new TextEncoder().encode('{"provider":"exact"}');
    const durableRef = "managed-ai-output:v1:maiexec_11111111111111111111111111111111";
    const durableOutcome: ManagedAiKnowledgeExecutionOutcomeV1 = {
      ...managedOutcome(),
      exactOutput: {
        kind: "DURABLE_REF",
        mediaType: "application/json",
        sha256: sha256(exact),
        sizeBytes: exact.byteLength,
        ref: durableRef,
      },
    };
    const calls: ManagedAiHttpTransportRequest[] = [];
    const outcome = await client((request) => {
      calls.push(request);
      if (request.url.endsWith(CAPABILITY_RUNTIME_V2_ROUTE)) {
        return Promise.resolve({ status: 201, body: bytes(envelope(durableOutcome)) });
      }
      expect(request.url).toBe(`http://127.0.0.1:4105${MANAGED_AI_EXACT_OUTPUT_RESOLUTION_ROUTE}`);
      expect(request.headers).toMatchObject({
        "x-markorbit-internal-authorization": secret,
      });
      expect(JSON.parse(request.body)).toEqual({ ref: durableRef });
      return Promise.resolve({
        status: 200,
        body: bytes({
          kind: "INLINE_BASE64",
          mediaType: "application/json",
          sha256: sha256(exact),
          sizeBytes: exact.byteLength,
          dataBase64: Buffer.from(exact).toString("base64"),
        }),
      });
    }).execute(input());

    expect(calls).toHaveLength(2);
    expect(outcome.exactOutput).toMatchObject({
      kind: "INLINE_BASE64",
      sha256: sha256(exact),
      sizeBytes: exact.byteLength,
    });
  });

  it("accepts durable replay and preserves the embedded Managed AI outcome", async () => {
    const replay = envelope();
    replay.replayed = true;
    await expect(
      client(() => Promise.resolve({ status: 200, body: bytes(replay) })).execute(input()),
    ).resolves.toMatchObject({ status: "COMPLETED", provenance: { implementationKey } });
  });

  it("preserves reconciliation state behind Capability REVIEW_REQUIRED", async () => {
    await expect(
      client(() =>
        Promise.resolve({
          status: 201,
          body: bytes(envelope(managedOutcome("REQUIRES_RECONCILIATION"), "REQUIRES_REVIEW")),
        }),
      ).execute(input()),
    ).resolves.toMatchObject({ status: "REQUIRES_RECONCILIATION" });
  });

  it.each(["FAILED", "BLOCKED"] as const)(
    "preserves a governed Managed AI %s outcome behind Capability FAILED",
    async (managedStatus) => {
      const failure = {
        ...managedOutcome(),
        status: managedStatus,
        deliveryState: "NOT_DELIVERED",
        retryDisposition: managedStatus === "FAILED" ? "RETRY_ALLOWED" : "RETRY_FORBIDDEN",
        error: {
          code: managedStatus === "FAILED" ? "RATE_LIMITED" : "AUTHENTICATION_FAILED",
          message: `synthetic ${managedStatus.toLowerCase()} outcome`,
        },
      } as ManagedAiKnowledgeExecutionOutcomeV1;
      await expect(
        client(() =>
          Promise.resolve({ status: 201, body: bytes(envelope(failure, "FAILED")) }),
        ).execute(input()),
      ).resolves.toMatchObject({
        status: managedStatus,
        error: { code: failure.error?.code },
      });
    },
  );

  it("fails closed if Capability binding and Managed AI provenance drift", async () => {
    const drift = envelope();
    (drift.binding.implementation as { implementationKey: string }).implementationKey =
      "ai:other:v1";
    await expect(
      client(() => Promise.resolve({ status: 201, body: bytes(drift) })).execute(input()),
    ).rejects.toMatchObject({ code: "AI_CAPABILITY_V2_BINDING_DRIFT", retryable: false });
  });

  it("maps transport delivery uncertainty into the worker reconciliation boundary", async () => {
    await expect(
      client(() =>
        Promise.reject(
          new ManagedAiHttpTransportError(
            "MANAGED_AI_HTTP_NETWORK_ERROR",
            "socket closed after dispatch",
            true,
          ),
        ),
      ).execute(input()),
    ).rejects.toMatchObject({ code: "AI_PROVIDER_NETWORK_ERROR", retryable: false });
  });

  it("fails closed on Capability authority promotion", async () => {
    const promoted = envelope();
    (promoted.outcome.authority as Record<string, boolean>).paymentCreated = true;
    await expect(
      client(() => Promise.resolve({ status: 201, body: bytes(promoted) })).execute(input()),
    ).rejects.toMatchObject({ code: "AI_CAPABILITY_V2_AUTHORITY_ESCALATION" });
  });
});
