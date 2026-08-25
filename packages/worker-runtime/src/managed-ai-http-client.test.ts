import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AiKnowledgeAssignmentV1 } from "@markorbit/contracts";
import type { AiKnowledgeProviderRequest } from "./ai-distilled-knowledge-acquirer";
import {
  MANAGED_AI_CAPABILITY_ID,
  MANAGED_AI_CONTRACT_VERSION,
  MANAGED_AI_KNOWLEDGE_OUTPUT_SCHEMA_ID,
  MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_ID,
  MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_VERSION,
  ManagedAiDeepSeekKnowledgeAdapter,
  type ManagedAiKnowledgeAuthorityV1,
  type ManagedAiKnowledgeExecutionInputV1,
  type ManagedAiKnowledgeExecutionOutcomeV1,
} from "./managed-ai-knowledge-adapter";
import {
  HttpManagedAiExecutionClient,
  ManagedAiHttpDeepSeekKnowledgeAdapter,
  managedAiHttpExecutionContextV1,
} from "./managed-ai-http-client";

const SECRET = "internal-service-secret-0123456789abcdef";
const BASE_URL = "http://capability-engine.internal:4103";
const STARTED_AT = "2026-08-25T10:10:00.000Z";
const COMPLETED_AT = "2026-08-25T10:10:03.000Z";
const MARKDOWN = "# Managed AI\n\nGoverned Knowledge evidence.";

const assignment: AiKnowledgeAssignmentV1 = {
  protocolVersion: "1.0",
  objectType: "AI_KNOWLEDGE_ASSIGNMENT",
  assignmentId: "kas_managed_ai_http_01",
  jurisdiction: "US",
  domain: "TRADEMARK",
  topic: "DECLARATION_OF_USE",
  title: "Managed AI HTTP bridge",
  instructionSetId: "kis_trademark_procedure",
  instructionSetRevision: 1,
  language: "zh-CN",
  prompt: "Return a source-oriented Markdown memo about Section 8 declarations of use.",
  createdAt: "2026-08-25T10:00:00.000Z",
};

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

function completedOutcome(): ManagedAiKnowledgeExecutionOutcomeV1 {
  const raw = new TextEncoder().encode(
    JSON.stringify({
      id: "deepseek-managed-http-1",
      model: "deepseek-chat",
      choices: [{ message: { role: "assistant", content: MARKDOWN } }],
    }),
  );
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
      model: "deepseek-chat",
      promptPolicyId: MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_ID,
      promptPolicyVersion: MANAGED_AI_KNOWLEDGE_PROMPT_POLICY_VERSION,
      outputSchemaId: MANAGED_AI_KNOWLEDGE_OUTPUT_SCHEMA_ID,
      inputSha256: "a".repeat(64),
      providerRequestId: "deepseek-managed-http-1",
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
    structuredOutput: { outputFormat: "MARKDOWN", text: MARKDOWN },
    authority: noAuthority(),
  };
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function executionRequest(executionKey: string): AiKnowledgeProviderRequest {
  return {
    assignment,
    executionKey,
    timeoutMs: 45_000,
  } as AiKnowledgeProviderRequest & { executionKey: string };
}

describe("Managed AI Capability Engine HTTP bridge", () => {
  it("posts the exact existing governed Knowledge input with only internal execution headers", async () => {
    let expectedInput: ManagedAiKnowledgeExecutionInputV1 | undefined;
    const existing = new ManagedAiDeepSeekKnowledgeAdapter({
      execute: async (input) => {
        expectedInput = input;
        return completedOutcome();
      },
    });
    const expectedAcquisition = await existing.acquire({ assignment, timeoutMs: 45_000 });

    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return response(completedOutcome());
    }) as typeof fetch;
    const adapter = new ManagedAiHttpDeepSeekKnowledgeAdapter({
      baseUrl: `${BASE_URL}/`,
      internalServiceSecret: SECRET,
      fetchImpl,
    });

    const acquisition = await adapter.acquire(
      executionRequest("kas_managed_ai_http_01:DEEPSEEK:pilot:managed-http"),
    );

    expect(acquisition).toEqual(expectedAcquisition);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/internal/v1/managed-ai-executions`);
    expect(calls[0]?.init.method).toBe("POST");
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get("x-markorbit-internal-authorization")).toBe(SECRET);
    expect(headers.get("idempotency-key")).toMatch(/^knowledge-managed-ai:[a-f0-9]{64}$/u);
    expect(headers.get("x-correlation-id")).toMatch(/^knowledge-ai:[a-f0-9]{40}$/u);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual(expectedInput);
    const serialized = String(calls[0]?.init.body);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain("api.deepseek.com");
    expect(serialized).not.toContain("DEEPSEEK_API_KEY");
    expect(serialized).not.toContain("deepseek-chat");
  });

  it("derives stable replay identity from executionKey and separates different execution scopes", () => {
    const first = managedAiHttpExecutionContextV1(
      "kas_managed_ai_http_01:DEEPSEEK:pilot:managed-http-a",
    );
    const replay = managedAiHttpExecutionContextV1(
      "kas_managed_ai_http_01:DEEPSEEK:pilot:managed-http-a",
    );
    const nextScope = managedAiHttpExecutionContextV1(
      "kas_managed_ai_http_01:DEEPSEEK:pilot:managed-http-b",
    );

    expect(replay).toEqual(first);
    expect(nextScope.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(nextScope.correlationId).not.toBe(first.correlationId);
  });

  it("reuses the exact idempotency key after an uncertain network transport result", async () => {
    const capturedKeys: string[] = [];
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedKeys.push(new Headers(init?.headers).get("idempotency-key") ?? "");
      throw new TypeError("connection reset after request write");
    }) as typeof fetch;
    const client = new HttpManagedAiExecutionClient({
      baseUrl: BASE_URL,
      internalServiceSecret: SECRET,
      fetchImpl,
    });
    const context = managedAiHttpExecutionContextV1("job-execution-uncertain-01");
    const input = await captureManagedInput();

    await expect(client.execute(input, context)).rejects.toMatchObject({
      code: "AI_MANAGED_AI_HTTP_TRANSPORT_UNCERTAIN",
      retryable: true,
    });
    await expect(client.execute(input, context)).rejects.toMatchObject({
      code: "AI_MANAGED_AI_HTTP_TRANSPORT_UNCERTAIN",
      retryable: true,
    });
    expect(capturedKeys).toEqual([context.idempotencyKey, context.idempotencyKey]);
  });

  it("preserves Capability Engine idempotency conflicts as non-retryable", async () => {
    const fetchImpl = (async () =>
      response(
        {
          code: "IDEMPOTENCY_CONFLICT",
          message: "Idempotency key was already used with a different Managed AI request.",
          correlationId: "knowledge-ai-conflict",
          retryable: false,
        },
        409,
      )) as typeof fetch;
    const client = new HttpManagedAiExecutionClient({
      baseUrl: BASE_URL,
      internalServiceSecret: SECRET,
      fetchImpl,
    });

    await expect(
      client.execute(
        await captureManagedInput(),
        managedAiHttpExecutionContextV1("job-execution-conflict-01"),
      ),
    ).rejects.toMatchObject({
      code: "AI_MANAGED_AI_IDEMPOTENCY_CONFLICT",
      retryable: false,
    });
  });

  it("blocks automatic replay when Capability Engine requires reconciliation", async () => {
    const fetchImpl = (async () =>
      response(
        {
          code: "MANAGED_AI_EXECUTION_RECONCILIATION_REQUIRED",
          message: "Prior dispatch may have reached the provider.",
          correlationId: "knowledge-ai-reconcile",
          retryable: false,
        },
        409,
      )) as typeof fetch;
    const client = new HttpManagedAiExecutionClient({
      baseUrl: BASE_URL,
      internalServiceSecret: SECRET,
      fetchImpl,
    });

    await expect(
      client.execute(
        await captureManagedInput(),
        managedAiHttpExecutionContextV1("job-execution-reconcile-01"),
      ),
    ).rejects.toMatchObject({
      code: "AI_PROVIDER_NETWORK_ERROR",
      retryable: false,
      message: expect.stringContaining("MANAGED_AI_EXECUTION_RECONCILIATION_REQUIRED"),
    });
  });

  it("keeps a same-key execution already in progress retryable", async () => {
    const fetchImpl = (async () =>
      response(
        {
          code: "MANAGED_AI_EXECUTION_IN_PROGRESS",
          message: "The same execution is owned by another runtime.",
          retryable: true,
        },
        409,
      )) as typeof fetch;
    const client = new HttpManagedAiExecutionClient({
      baseUrl: BASE_URL,
      internalServiceSecret: SECRET,
      fetchImpl,
    });

    await expect(
      client.execute(
        await captureManagedInput(),
        managedAiHttpExecutionContextV1("job-execution-in-progress-01"),
      ),
    ).rejects.toMatchObject({
      code: "AI_MANAGED_AI_EXECUTION_IN_PROGRESS",
      retryable: true,
    });
  });

  it("treats non-retryable claim-store uncertainty after dispatch as reconciliation", async () => {
    const fetchImpl = (async () =>
      response(
        {
          code: "MANAGED_AI_CLAIM_STORE_UNAVAILABLE",
          message: "Provider result could not be durably committed.",
          retryable: false,
        },
        503,
      )) as typeof fetch;
    const client = new HttpManagedAiExecutionClient({
      baseUrl: BASE_URL,
      internalServiceSecret: SECRET,
      fetchImpl,
    });

    await expect(
      client.execute(
        await captureManagedInput(),
        managedAiHttpExecutionContextV1("job-execution-persist-uncertain-01"),
      ),
    ).rejects.toMatchObject({ code: "AI_PROVIDER_NETWORK_ERROR", retryable: false });
  });

  it("fails before network access when a durable ADK execution identity is missing", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return response(completedOutcome());
    }) as typeof fetch;
    const adapter = new ManagedAiHttpDeepSeekKnowledgeAdapter({
      baseUrl: BASE_URL,
      internalServiceSecret: SECRET,
      fetchImpl,
    });

    await expect(adapter.acquire({ assignment })).rejects.toMatchObject({
      code: "AI_MANAGED_AI_EXECUTION_IDENTITY_REQUIRED",
      retryable: false,
    });
    expect(calls).toBe(0);
  });

  it("rejects an invalid internal service secret before any request can be sent", () => {
    expect(
      () =>
        new HttpManagedAiExecutionClient({
          baseUrl: BASE_URL,
          internalServiceSecret: "too-short",
        }),
    ).toThrowError(expect.objectContaining({ code: "AI_MANAGED_AI_INTERNAL_SECRET_INVALID" }));
  });
});

async function captureManagedInput(): Promise<ManagedAiKnowledgeExecutionInputV1> {
  let captured: ManagedAiKnowledgeExecutionInputV1 | undefined;
  const adapter = new ManagedAiDeepSeekKnowledgeAdapter({
    execute: async (input) => {
      captured = input;
      return completedOutcome();
    },
  });
  await adapter.acquire({ assignment, timeoutMs: 45_000 });
  if (!captured) throw new Error("Managed AI governed input was not captured");
  return captured;
}
