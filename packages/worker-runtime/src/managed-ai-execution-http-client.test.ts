import { describe, expect, it } from "vitest";
import type {
  ManagedAiKnowledgeAuthorityV1,
  ManagedAiKnowledgeExecutionInputV1,
  ManagedAiKnowledgeExecutionOutcomeV1,
} from "./managed-ai-knowledge-adapter";
import {
  MANAGED_AI_EXECUTION_ROUTE,
  ManagedAiExecutionHttpClient,
  ManagedAiExecutionHttpClientError,
  ManagedAiHttpTransportError,
  type ManagedAiHttpTransportRequest,
} from "./managed-ai-execution-http-client";

const secret = "knowledge-core-internal-secret-1234567890";

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
    promptPolicy: {
      policyId: "knowledge.ai-distillation",
      policyVersion: "1",
    },
    evidence: {
      exactOutput: "REQUIRED",
      providerRequestId: "REQUIRED_WHEN_AVAILABLE",
    },
  };
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

function outcome(): ManagedAiKnowledgeExecutionOutcomeV1 {
  return {
    schemaVersion: 1,
    capabilityId: "managed-ai-execution",
    capabilityVersion: "1.0.0",
    status: "BLOCKED",
    deliveryState: "NOT_DELIVERED",
    retryDisposition: "RETRY_FORBIDDEN",
    error: { code: "POLICY_BLOCKED", message: "fixture" },
    authority: noAuthority(),
  };
}

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

describe("ManagedAiExecutionHttpClient", () => {
  it("sends the governed input to the authenticated Core internal route without provider controls", async () => {
    let captured: ManagedAiHttpTransportRequest | undefined;
    const client = new ManagedAiExecutionHttpClient({
      baseUrl: "http://127.0.0.1:4105/base",
      internalServiceSecret: secret,
      idempotencyKey: "knowledge-adk:stable-key",
      correlationId: "knowledge-adk:correlation",
      transport: (request) => {
        captured = request;
        return Promise.resolve({ status: 200, body: bytes(outcome()) });
      },
    });

    await expect(client.execute(input())).resolves.toEqual(outcome());
    expect(captured).toBeDefined();
    expect(captured?.url).toBe(`http://127.0.0.1:4105${MANAGED_AI_EXECUTION_ROUTE}`);
    expect(captured?.headers).toMatchObject({
      "content-type": "application/json",
      "x-markorbit-internal-authorization": secret,
      "idempotency-key": "knowledge-adk:stable-key",
      "x-correlation-id": "knowledge-adk:correlation",
    });
    const serialized = captured?.body ?? "";
    expect(JSON.parse(serialized)).toEqual(input());
    expect(serialized).not.toContain("DEEPSEEK");
    expect(serialized).not.toContain("deepseek-v4-flash");
    expect(serialized).not.toContain("api.deepseek.com");
    expect(serialized).not.toContain(secret);
  });

  it("preserves Core retryability without retrying inside the client", async () => {
    let calls = 0;
    const client = new ManagedAiExecutionHttpClient({
      baseUrl: "http://capability-engine.internal:4105",
      internalServiceSecret: secret,
      idempotencyKey: "knowledge-adk:retry",
      correlationId: "knowledge-adk:retry",
      transport: () => {
        calls += 1;
        return Promise.resolve({
          status: 409,
          body: bytes({
            code: "MANAGED_AI_EXECUTION_IN_PROGRESS",
            message: "Execution is owned by another runtime",
            correlationId: "knowledge-adk:retry",
            retryable: true,
          }),
        });
      },
    });

    await expect(client.execute(input())).rejects.toMatchObject({
      code: "AI_MANAGED_AI_HTTP_MANAGED_AI_EXECUTION_IN_PROGRESS",
      retryable: true,
    });
    expect(calls).toBe(1);
  });

  it("keeps reconciliation-required Core responses non-retryable", async () => {
    const client = new ManagedAiExecutionHttpClient({
      baseUrl: "http://capability-engine.internal:4105",
      internalServiceSecret: secret,
      idempotencyKey: "knowledge-adk:reconcile",
      correlationId: "knowledge-adk:reconcile",
      transport: () =>
        Promise.resolve({
          status: 409,
          body: bytes({
            code: "MANAGED_AI_EXECUTION_RECONCILIATION_REQUIRED",
            message: "Prior dispatch must be reconciled",
            correlationId: "knowledge-adk:reconcile",
            retryable: false,
          }),
        }),
    });

    await expect(client.execute(input())).rejects.toMatchObject({
      code: "AI_MANAGED_AI_HTTP_MANAGED_AI_EXECUTION_RECONCILIATION_REQUIRED",
      retryable: false,
    });
  });

  it("surfaces transport uncertainty once and relies on the same idempotency key for caller-driven retry", async () => {
    let calls = 0;
    const client = new ManagedAiExecutionHttpClient({
      baseUrl: "http://capability-engine.internal:4105",
      internalServiceSecret: secret,
      idempotencyKey: "knowledge-adk:network",
      correlationId: "knowledge-adk:network",
      transport: () => {
        calls += 1;
        return Promise.reject(
          new ManagedAiHttpTransportError(
            "MANAGED_AI_HTTP_NETWORK_ERROR",
            "socket outcome uncertain",
            true,
          ),
        );
      },
    });

    await expect(client.execute(input())).rejects.toBeInstanceOf(ManagedAiExecutionHttpClientError);
    await expect(client.execute(input())).rejects.toMatchObject({
      code: "MANAGED_AI_HTTP_NETWORK_ERROR",
      retryable: true,
    });
    expect(calls).toBe(2);
  });

  it("fails closed on malformed non-success error bodies", async () => {
    const client = new ManagedAiExecutionHttpClient({
      baseUrl: "http://capability-engine.internal:4105",
      internalServiceSecret: secret,
      idempotencyKey: "knowledge-adk:bad-error",
      correlationId: "knowledge-adk:bad-error",
      transport: () => Promise.resolve({ status: 503, body: bytes({ message: "missing code" }) }),
    });

    await expect(client.execute(input())).rejects.toMatchObject({
      code: "AI_MANAGED_AI_HTTP_ERROR_RESPONSE_INVALID",
      retryable: false,
    });
  });
});
