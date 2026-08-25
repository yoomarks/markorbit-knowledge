import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import type { AiKnowledgeAssignmentV1 } from "@markorbit/contracts";
import { ManagedAiHttpDeepSeekKnowledgeAdapter } from "./managed-ai-knowledge-http-adapter";

const coreCheckout = process.env.MARKORBIT_CORE_CHECKOUT;
const secret = "knowledge-managed-ai-core-e2e-secret-32-bytes";
const markdown = "# Managed AI Core E2E\n\nProvider-neutral HTTP acceptance.";

const assignment: AiKnowledgeAssignmentV1 = {
  protocolVersion: "1.0",
  objectType: "AI_KNOWLEDGE_ASSIGNMENT",
  assignmentId: "kas_managed_ai_core_http_e2e",
  jurisdiction: "US",
  domain: "TRADEMARK",
  topic: "DECLARATION_OF_USE",
  title: "Managed AI Core HTTP acceptance",
  instructionSetId: "kis_trademark_procedure",
  instructionSetRevision: 1,
  language: "zh-CN",
  prompt: "Return a source-oriented Markdown memo for non-live cross-repository acceptance.",
  createdAt: "2026-08-25T10:40:00.000Z",
};

type CoreRuntime = {
  readonly listeningPort: number | undefined;
  start(): Promise<void>;
  stop(): Promise<void>;
};

type CoreRuntimeCapabilityRegistry = {
  importAccepted(): Promise<never>;
  findCurrent(): Promise<never>;
  findVersion(): Promise<never>;
};

type CoreModule = {
  createRuntime(options: {
    port: number;
    internalServiceSecret: string;
    runtimeCapabilityRegistry: CoreRuntimeCapabilityRegistry;
    managedAiExecutor: {
      execute(
        input: unknown,
        context: Readonly<{ executionId: string; correlationId: string }>,
      ): Promise<unknown>;
    };
  }): CoreRuntime;
};

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function authority() {
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
  } as const;
}

function completedOutcome(
  sequence: number,
  context: { executionId: string; correlationId: string },
) {
  const providerRequestId = `deepseek-e2e-${sequence}`;
  const raw = new TextEncoder().encode(
    JSON.stringify({
      id: providerRequestId,
      model: "deepseek-v4-flash",
      choices: [{ message: { role: "assistant", content: markdown } }],
    }),
  );
  return {
    schemaVersion: 1,
    capabilityId: "managed-ai-execution",
    capabilityVersion: "1.0.0",
    status: "COMPLETED",
    deliveryState: "PROVIDER_COMPLETED",
    retryDisposition: "RETRY_FORBIDDEN",
    provenance: {
      implementationProfileId: "managed-ai:knowledge-deepseek:v1",
      implementationProfileVersion: 1,
      implementationKey: "ai:deepseek:chat-completions:v1",
      provider: "DEEPSEEK",
      model: "deepseek-v4-flash",
      promptPolicyId: "knowledge.ai-distillation",
      promptPolicyVersion: "1",
      outputSchemaId: "knowledge.ai-distilled-markdown.v1",
      inputSha256: "a".repeat(64),
      providerRequestId,
      startedAt: "2026-08-25T10:40:01.000Z",
      completedAt: "2026-08-25T10:40:02.000Z",
    },
    exactOutput: {
      kind: "INLINE_BASE64",
      mediaType: "application/json",
      sha256: sha256(raw),
      sizeBytes: raw.byteLength,
      dataBase64: Buffer.from(raw).toString("base64"),
    },
    structuredOutput: { text: markdown, outputFormat: "MARKDOWN" },
    authority: authority(),
    e2eContext: context,
  };
}

const crossRepoDescribe = coreCheckout ? describe : describe.skip;

crossRepoDescribe("Knowledge -> Core Managed AI HTTP", () => {
  it("replays one durable execution, separates scopes, and quarantines post-dispatch uncertainty", async () => {
    if (!coreCheckout) throw new Error("MARKORBIT_CORE_CHECKOUT is required for this E2E test");
    const coreModule = (await import(
      pathToFileURL(resolve(coreCheckout, "services/capability-engine/dist/index.js")).href
    )) as CoreModule;

    const unusedRuntimeCapabilityRegistry: CoreRuntimeCapabilityRegistry = {
      async importAccepted() {
        throw new Error("Managed AI E2E must not call the runtime capability import route");
      },
      async findCurrent() {
        throw new Error("Managed AI E2E must not call the runtime capability current route");
      },
      async findVersion() {
        throw new Error("Managed AI E2E must not call the runtime capability version route");
      },
    };
    let executorCalls = 0;
    let failNext = false;
    const executorInputs: unknown[] = [];
    const runtime = coreModule.createRuntime({
      port: 0,
      internalServiceSecret: secret,
      runtimeCapabilityRegistry: unusedRuntimeCapabilityRegistry,
      managedAiExecutor: {
        execute: (input, context) => {
          executorInputs.push(input);
          executorCalls += 1;
          if (failNext) {
            failNext = false;
            return Promise.reject(new Error("synthetic executor failure after dispatch mark"));
          }
          return Promise.resolve(completedOutcome(executorCalls, context));
        },
      },
    });

    await runtime.start();
    try {
      if (runtime.listeningPort === undefined) throw new Error("Core runtime did not bind a port");
      const adapter = new ManagedAiHttpDeepSeekKnowledgeAdapter({
        baseUrl: `http://127.0.0.1:${runtime.listeningPort}`,
        internalServiceSecret: secret,
      });

      const scopeA = `${assignment.assignmentId}:DEEPSEEK:pilot:crossrepo-a`;
      const first = await adapter.acquire({ assignment, executionKey: scopeA });
      const replay = await adapter.acquire({ assignment, executionKey: scopeA });
      expect(executorCalls).toBe(1);
      expect(replay.submission.submissionId).toBe(first.submission.submissionId);
      expect(replay.artifact.artifactId).toBe(first.artifact.artifactId);

      const scopeB = `${assignment.assignmentId}:DEEPSEEK:pilot:crossrepo-b`;
      const second = await adapter.acquire({ assignment, executionKey: scopeB });
      expect(executorCalls).toBe(2);
      expect(second.submission.providerRequestId).not.toBe(first.submission.providerRequestId);
      expect(JSON.stringify(executorInputs)).not.toContain("DEEPSEEK");
      expect(JSON.stringify(executorInputs)).not.toContain("deepseek-v4-flash");

      const reconcileScope = `${assignment.assignmentId}:DEEPSEEK:pilot:crossrepo-reconcile`;
      failNext = true;
      await expect(
        adapter.acquire({ assignment, executionKey: reconcileScope }),
      ).rejects.toMatchObject({
        code: "AI_PROVIDER_NETWORK_ERROR",
        retryable: false,
      });
      expect(executorCalls).toBe(3);

      await expect(
        adapter.acquire({ assignment, executionKey: reconcileScope }),
      ).rejects.toMatchObject({
        code: "AI_PROVIDER_NETWORK_ERROR",
        retryable: false,
      });
      expect(executorCalls).toBe(3);
    } finally {
      await runtime.stop();
    }
  });
});
