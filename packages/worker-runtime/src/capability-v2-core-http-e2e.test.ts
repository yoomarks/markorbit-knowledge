import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import type { AiKnowledgeAssignmentV1 } from "@markorbit/contracts";
import { ManagedAiCapabilityHttpDeepSeekKnowledgeAdapter } from "./managed-ai-capability-http-adapter";
import { encodeCapabilityRuntimeWorkspacePrincipal } from "./capability-runtime-v2-http-client";

const coreCheckout = process.env.MARKORBIT_CORE_CHECKOUT;
const secret = "knowledge-capability-v2-core-e2e-secret-32-bytes";
const markdown = "# Capability V2 Core E2E\n\nGoverned cross-repository acceptance.";

const assignment: AiKnowledgeAssignmentV1 = {
  protocolVersion: "1.0",
  objectType: "AI_KNOWLEDGE_ASSIGNMENT",
  assignmentId: "kas_capability_v2_core_http_e2e",
  jurisdiction: "US",
  domain: "TRADEMARK",
  topic: "DECLARATION_OF_USE",
  title: "Capability V2 Core HTTP acceptance",
  instructionSetId: "kis_trademark_procedure",
  instructionSetRevision: 1,
  language: "zh-CN",
  prompt: "Return a source-oriented Markdown memo for governed cross-repository acceptance.",
  createdAt: "2026-08-26T16:00:00.000Z",
};

const principal = encodeCapabilityRuntimeWorkspacePrincipal({
  kind: "WORKSPACE",
  sessionId: "session_capability_v2_crossrepo",
  userId: "user_capability_v2_crossrepo",
  workspaceId: "workspace_capability_v2_crossrepo",
  membershipId: "membership_capability_v2_crossrepo",
  role: "WORKSPACE_ADMIN",
  permissions: ["workspace:read"],
  sessionExpiresAt: "2030-01-01T00:00:00.000Z",
});

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function managedAuthority() {
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

function completedOutcome(sequence: number) {
  const providerRequestId = `deepseek-capability-v2-e2e-${sequence}`;
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
      implementationProfileId: "implementation-profile_capability-v2-e2e",
      implementationProfileVersion: 1,
      implementationKey: "ai:deepseek:chat-completions:v1",
      provider: "DEEPSEEK",
      model: "deepseek-v4-flash",
      promptPolicyId: "knowledge.ai-distillation",
      promptPolicyVersion: "1",
      outputSchemaId: "knowledge.ai-distilled-markdown.v1",
      inputSha256: "a".repeat(64),
      providerRequestId,
      startedAt: "2026-08-26T16:00:01.000Z",
      completedAt: "2026-08-26T16:00:02.000Z",
    },
    exactOutput: {
      kind: "INLINE_BASE64",
      mediaType: "application/json",
      sha256: sha256(raw),
      sizeBytes: raw.byteLength,
      dataBase64: Buffer.from(raw).toString("base64"),
    },
    structuredOutput: { text: markdown, outputFormat: "MARKDOWN" },
    authority: managedAuthority(),
  };
}

function reconciliationOutcome() {
  return {
    schemaVersion: 1,
    capabilityId: "managed-ai-execution",
    capabilityVersion: "1.0.0",
    status: "REQUIRES_RECONCILIATION",
    deliveryState: "DELIVERY_UNCERTAIN",
    retryDisposition: "RECONCILIATION_REQUIRED",
    error: { code: "DELIVERY_UNCERTAIN", message: "Delivery requires reconciliation." },
    authority: managedAuthority(),
  };
}

type CoreRuntime = {
  readonly listeningPort: number | undefined;
  start(): Promise<void>;
  stop(): Promise<void>;
};

type CoreIndexModule = {
  createRuntime(options: {
    port: number;
    internalServiceSecret: string;
    governedCapabilityRuntime: { invoke(request: unknown): Promise<unknown> };
    managedAiExecutor: { execute(input: unknown): Promise<unknown> };
    managedAiClaimStore: unknown;
    managedAiExactOutputStore: unknown;
  }): CoreRuntime;
  InMemoryManagedAiExecutionClaimStoreV1: new () => unknown;
  InMemoryManagedAiExactOutputStoreV1: new () => unknown;
};

type CoreBootstrapModule = {
  createGovernedProductionRuntimeV1(options: {
    definitions: { findCurrent(capabilityId: string): Promise<unknown> };
    implementationProfiles: {
      register(value: unknown): Promise<unknown>;
      findCurrent(id: string): Promise<unknown>;
      findVersion(id: string, version: number): Promise<unknown>;
      listCurrent(capabilityId?: string): Promise<readonly unknown[]>;
    };
    managedAiRuntime: {
      managedAiExecutor: { execute(input: unknown): Promise<unknown> };
      managedAiClaimStore: unknown;
      managedAiExactOutputStore: unknown;
    };
    internalServiceSecret: string;
  }): { invoke(request: unknown): Promise<unknown> } | null;
};

const definition = {
  schemaVersion: 1,
  runtimeCapabilityDefinitionId: "runtime-capability_capability-v2-e2e",
  version: 1,
  capabilityId: "managed-ai-execution",
  capabilityVersion: "1.0.0",
  title: "Managed AI Execution",
  description: "Governed provider-neutral AI execution.",
  lineage: { capabilityId: "managed-ai-execution" },
  canonReference: {
    canonId: "capability-foundation",
    canonVersion: "2026-08-26",
    sourceFingerprintSha256: "a".repeat(64),
  },
  acceptedCanonProjection: true,
  createdFromWorkEvidence: false,
  createdFromAiOutput: false,
  createdAt: "2026-08-26T16:00:00.000Z",
};

const profile = {
  schemaVersion: 1,
  implementationProfileId: "implementation-profile_capability-v2-e2e",
  version: 1,
  capabilityId: "managed-ai-execution",
  capabilityVersion: "1.0.0",
  kind: "AI_ASSISTED_SERVICE",
  status: "APPROVED",
  implementationKey: "ai:deepseek:chat-completions:v1",
  inputSchemaId: "managed-ai-input.v1",
  outputSchemaId: "managed-ai-output.v1",
  allowedCallerProducts: ["KNOWLEDGE"],
  maximumRiskClass: "MODERATE",
  timeoutMs: 45_000,
  maxAttempts: 1,
  approvalPolicyVersion: "implementation-admission.v1",
  createdAt: "2026-08-26T16:00:00.000Z",
};

const crossRepoDescribe = coreCheckout ? describe : describe.skip;

crossRepoDescribe("Knowledge -> Core Capability Runtime V2 -> Managed AI", () => {
  it("uses governed implementation selection, replays without redispatch, isolates scopes, hides implementation control, and preserves reconciliation", async () => {
    if (!coreCheckout) throw new Error("MARKORBIT_CORE_CHECKOUT is required for this E2E test");

    const coreIndex = (await import(
      pathToFileURL(resolve(coreCheckout, "services/capability-engine/dist/index.js")).href
    )) as CoreIndexModule;
    const coreBootstrap = (await import(
      pathToFileURL(
        resolve(coreCheckout, "services/capability-engine/dist/governed-runtime-bootstrap.js"),
      ).href
    )) as CoreBootstrapModule;

    let executorCalls = 0;
    let reconciliationNext = false;
    const executorInputs: unknown[] = [];
    const profiles = {
      async register(value: unknown) {
        return value;
      },
      async findCurrent() {
        return profile;
      },
      async findVersion() {
        return profile;
      },
      async listCurrent(capabilityId?: string) {
        return capabilityId === undefined || capabilityId === profile.capabilityId ? [profile] : [];
      },
    };
    const managedAiExecutor = {
      async execute(input: unknown) {
        executorInputs.push(input);
        executorCalls += 1;
        if (reconciliationNext) {
          reconciliationNext = false;
          return reconciliationOutcome();
        }
        return completedOutcome(executorCalls);
      },
    };
    const managedAiClaimStore = new coreIndex.InMemoryManagedAiExecutionClaimStoreV1();
    const managedAiExactOutputStore = new coreIndex.InMemoryManagedAiExactOutputStoreV1();
    const governed = coreBootstrap.createGovernedProductionRuntimeV1({
      definitions: {
        async findCurrent(capabilityId: string) {
          return capabilityId === definition.capabilityId ? definition : undefined;
        },
      },
      implementationProfiles: profiles,
      managedAiRuntime: {
        managedAiExecutor,
        managedAiClaimStore,
        managedAiExactOutputStore,
      },
      internalServiceSecret: secret,
    });
    if (!governed) throw new Error("Expected governed Capability runtime");

    const runtime = coreIndex.createRuntime({
      port: 0,
      internalServiceSecret: secret,
      governedCapabilityRuntime: governed,
      managedAiExecutor,
      managedAiClaimStore,
      managedAiExactOutputStore,
    });

    await runtime.start();
    try {
      if (runtime.listeningPort === undefined) throw new Error("Core runtime did not bind a port");
      const adapter = new ManagedAiCapabilityHttpDeepSeekKnowledgeAdapter({
        baseUrl: `http://127.0.0.1:${runtime.listeningPort}`,
        internalServiceSecret: secret,
        workspacePrincipal: principal,
      });

      const scopeA = `${assignment.assignmentId}:DEEPSEEK:pilot:v2-a`;
      const first = await adapter.acquire({ assignment, executionKey: scopeA });
      const replay = await adapter.acquire({ assignment, executionKey: scopeA });
      expect(executorCalls).toBe(1);
      expect(replay.submission.submissionId).toBe(first.submission.submissionId);
      expect(replay.artifact.artifactId).toBe(first.artifact.artifactId);

      const scopeB = `${assignment.assignmentId}:DEEPSEEK:pilot:v2-b`;
      const second = await adapter.acquire({ assignment, executionKey: scopeB });
      expect(executorCalls).toBe(2);
      expect(second.submission.providerRequestId).not.toBe(first.submission.providerRequestId);

      const serializedInputs = JSON.stringify(executorInputs);
      expect(serializedInputs).not.toContain("DEEPSEEK");
      expect(serializedInputs).not.toContain("deepseek-v4-flash");
      expect(serializedInputs).not.toContain("implementation-profile_capability-v2-e2e");

      const reconcileScope = `${assignment.assignmentId}:DEEPSEEK:pilot:v2-reconcile`;
      reconciliationNext = true;
      await expect(
        adapter.acquire({ assignment, executionKey: reconcileScope }),
      ).rejects.toMatchObject({
        code: "AI_PROVIDER_NETWORK_ERROR",
        retryable: true,
      });
      expect(executorCalls).toBe(3);

      await expect(
        adapter.acquire({ assignment, executionKey: reconcileScope }),
      ).rejects.toMatchObject({
        code: "AI_PROVIDER_NETWORK_ERROR",
        retryable: true,
      });
      expect(executorCalls).toBe(3);
    } finally {
      await runtime.stop();
    }
  });
});
