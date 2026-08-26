import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import type { AiKnowledgeAssignmentV1 } from "@markorbit/contracts";
import {
  CAPABILITY_RUNTIME_V2_ROUTE,
  type CapabilityRuntimeWorkspacePrincipal,
} from "./capability-runtime-managed-ai-http-client";
import { ManagedAiCapabilityHttpDeepSeekKnowledgeAdapter } from "./managed-ai-capability-http-adapter";

const coreCheckout = process.env.MARKORBIT_CORE_CHECKOUT;
const secret = "knowledge-managed-ai-core-e2e-secret-32-bytes";
const markdown = "# Managed AI Capability V2 E2E\n\nGoverned cross-repository acceptance.";
const principal: CapabilityRuntimeWorkspacePrincipal = {
  workspaceId: "workspace_knowledge_capability_e2e",
  principalId: "principal_knowledge_capability_worker",
  membershipId: "membership_knowledge_capability_worker",
};
const implementationKey = "ai:deepseek:chat-completions:v1";

const assignment: AiKnowledgeAssignmentV1 = {
  protocolVersion: "1.0",
  objectType: "AI_KNOWLEDGE_ASSIGNMENT",
  assignmentId: "kas_managed_ai_capability_v2_e2e",
  jurisdiction: "US",
  domain: "TRADEMARK",
  topic: "DECLARATION_OF_USE",
  title: "Managed AI Capability V2 acceptance",
  instructionSetId: "kis_trademark_procedure",
  instructionSetRevision: 1,
  language: "zh-CN",
  prompt: "Return a source-oriented Markdown memo for cross-repository Capability V2 acceptance.",
  createdAt: "2026-08-27T00:00:00.000Z",
};

type CoreRuntime = {
  readonly listeningPort: number | undefined;
  start(): Promise<void>;
  stop(): Promise<void>;
};

type GovernedRuntime = { invoke(value: unknown): Promise<unknown> };
type ReplayStore = object;
type ClaimStore = object;
type ExactOutputStore = object;
type RuntimeDefinition = Record<string, unknown>;
type ImplementationProfile = Record<string, unknown>;

type CoreIndexModule = {
  createRuntime(options: {
    port: number;
    internalServiceSecret: string;
    governedCapabilityRuntime: GovernedRuntime;
    managedAiExecutor: ManagedAiExecutor;
    managedAiClaimStore: ClaimStore;
    managedAiExactOutputStore: ExactOutputStore;
  }): CoreRuntime;
};

type ManagedAiExecutor = {
  execute(
    input: unknown,
    context: Readonly<{ executionId: string; correlationId: string }>,
  ): Promise<unknown>;
};

type ProductionBootstrapModule = {
  createGovernedProductionRuntimeV1(options: {
    definitions: { findCurrent(capabilityId: string): Promise<RuntimeDefinition | undefined> };
    implementationProfiles: {
      register(value: unknown): Promise<Readonly<ImplementationProfile>>;
      findCurrent(id: string): Promise<Readonly<ImplementationProfile> | undefined>;
      findVersion(
        id: string,
        version: number,
      ): Promise<Readonly<ImplementationProfile> | undefined>;
      listCurrent(capabilityId?: string): Promise<readonly Readonly<ImplementationProfile>[]>;
    };
    managedAiRuntime: {
      managedAiExecutor: ManagedAiExecutor;
      managedAiClaimStore: ClaimStore;
      managedAiExactOutputStore: ExactOutputStore;
    };
    internalServiceSecret: string;
  }): GovernedRuntime | null;
};

type DurableRuntimeModule = {
  DurableGovernedCapabilityRuntimeV1: new (options: {
    runtime: GovernedRuntime;
    replayStore: ReplayStore;
  }) => GovernedRuntime;
};

type ReplayStoreModule = {
  InMemoryCapabilityRuntimeReplayStoreV1: new () => ReplayStore;
};

type ClaimStoreModule = {
  InMemoryManagedAiExecutionClaimStoreV1: new () => ClaimStore;
};

type ExactOutputStoreModule = {
  InMemoryManagedAiExactOutputStoreV1: new () => ExactOutputStore;
};

type CoreModules = {
  core: CoreIndexModule;
  production: ProductionBootstrapModule;
  durable: DurableRuntimeModule;
  replay: ReplayStoreModule;
  claims: ClaimStoreModule;
  exactOutputs: ExactOutputStoreModule;
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

function completedOutcome(sequence: number) {
  const providerRequestId = `deepseek-capability-e2e-${sequence}`;
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
      implementationKey,
      provider: "DEEPSEEK",
      model: "deepseek-v4-flash",
      promptPolicyId: "knowledge.ai-distillation",
      promptPolicyVersion: "1",
      outputSchemaId: "knowledge.ai-distilled-markdown.v1",
      inputSha256: "a".repeat(64),
      providerRequestId,
      startedAt: "2026-08-27T00:00:01.000Z",
      completedAt: "2026-08-27T00:00:02.000Z",
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
    provenance: {
      implementationProfileId: "managed-ai:knowledge-deepseek:v1",
      implementationProfileVersion: 1,
      implementationKey,
      provider: "DEEPSEEK",
      model: "deepseek-v4-flash",
      promptPolicyId: "knowledge.ai-distillation",
      promptPolicyVersion: "1",
      outputSchemaId: "knowledge.ai-distilled-markdown.v1",
      inputSha256: "b".repeat(64),
      startedAt: "2026-08-27T00:00:03.000Z",
      completedAt: "2026-08-27T00:00:04.000Z",
    },
    error: { code: "DELIVERY_UNCERTAIN", message: "synthetic delivery uncertainty" },
    authority: authority(),
  };
}

function definition(): RuntimeDefinition {
  return {
    schemaVersion: 1,
    runtimeCapabilityDefinitionId: "runtime-capability_managed-ai-knowledge",
    version: 1,
    capabilityId: "managed-ai-execution",
    capabilityVersion: "1.0.0",
    title: "Governed Managed AI execution",
    description: "Server-selected Managed AI execution for Knowledge workloads.",
    lineage: { capabilityId: "managed-ai-execution" },
    canonReference: {
      canonId: "managed-ai-execution",
      canonVersion: "1.0.0",
      sourceFingerprintSha256: "c".repeat(64),
    },
    acceptedCanonProjection: true,
    createdFromWorkEvidence: false,
    createdFromAiOutput: false,
    createdAt: "2026-08-27T00:00:00.000Z",
  };
}

function profile(): ImplementationProfile {
  return {
    schemaVersion: 1,
    implementationProfileId: "implementation-profile_knowledge-managed-ai-v1",
    version: 1,
    capabilityId: "managed-ai-execution",
    capabilityVersion: "1.0.0",
    kind: "AI_ASSISTED_SERVICE",
    status: "APPROVED",
    implementationKey,
    inputSchemaId: "managed-ai-input.v1",
    outputSchemaId: "managed-ai-output.v1",
    allowedCallerProducts: ["KNOWLEDGE"],
    maximumRiskClass: "MODERATE",
    timeoutMs: 300_000,
    maxAttempts: 1,
    approvalPolicyVersion: "knowledge-managed-ai-v2-e2e",
    createdAt: "2026-08-27T00:00:00.000Z",
  };
}

function implementationRegistry() {
  const governed = profile();
  return {
    register: () => Promise.resolve(structuredClone(governed)),
    findCurrent: (id: string) =>
      Promise.resolve(
        id === governed.implementationProfileId ? structuredClone(governed) : undefined,
      ),
    findVersion: (id: string, version: number) =>
      Promise.resolve(
        id === governed.implementationProfileId && version === governed.version
          ? structuredClone(governed)
          : undefined,
      ),
    listCurrent: (capabilityId?: string) =>
      Promise.resolve(
        capabilityId === undefined || capabilityId === governed.capabilityId
          ? [structuredClone(governed)]
          : [],
      ),
  };
}

function encodedPrincipal(value: CapabilityRuntimeWorkspacePrincipal): string {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      principal: {
        kind: "WORKSPACE",
        sessionId: `knowledge-worker:${value.principalId}`,
        userId: value.principalId,
        workspaceId: value.workspaceId,
        membershipId: value.membershipId,
        role: "REVIEWER",
        permissions: ["workspace:read"],
        sessionExpiresAt: "9999-12-31T23:59:59.999Z",
      },
    }),
    "utf8",
  ).toString("base64url");
}

function managedInput() {
  return {
    schemaVersion: 1,
    processingClass: "SOURCE_ACQUISITION",
    dataClassification: "PUBLIC",
    taskInput: {
      schemaVersion: 1,
      kind: "TEXT_GENERATION",
      prompt: assignment.prompt,
      systemInstruction: "Return Markdown only",
      outputFormat: "MARKDOWN",
    },
    requestedOutput: { schemaId: "knowledge.ai-distilled-markdown.v1", format: "MARKDOWN" },
    requirements: {
      capabilities: ["text-generation"],
      maxLatencyMs: 120_000,
      exactProviderOutputRequired: true,
      provenanceRequired: true,
    },
    promptPolicy: { policyId: "knowledge.ai-distillation", policyVersion: "1" },
    evidence: { exactOutput: "REQUIRED", providerRequestId: "REQUIRED_WHEN_AVAILABLE" },
  };
}

async function loadCoreModules(checkout: string): Promise<CoreModules> {
  const imported = async <T>(relative: string): Promise<T> =>
    (await import(pathToFileURL(resolve(checkout, relative)).href)) as T;
  return {
    core: await imported<CoreIndexModule>("services/capability-engine/dist/index.js"),
    production: await imported<ProductionBootstrapModule>(
      "services/capability-engine/.e2e-dist/governed-runtime-bootstrap.mjs",
    ),
    durable: await imported<DurableRuntimeModule>(
      "services/capability-engine/.e2e-dist/durable-governed-capability-runtime.mjs",
    ),
    replay: await imported<ReplayStoreModule>(
      "services/capability-engine/.e2e-dist/capability-runtime-replay-store.mjs",
    ),
    claims: await imported<ClaimStoreModule>(
      "services/capability-engine/.e2e-dist/managed-ai-execution-claim.mjs",
    ),
    exactOutputs: await imported<ExactOutputStoreModule>(
      "services/capability-engine/.e2e-dist/managed-ai-exact-output.mjs",
    ),
  };
}

function makeServer(
  modules: CoreModules,
  replayStore: ReplayStore,
  exactOutputStore: ExactOutputStore,
  executor: ManagedAiExecutor,
): CoreRuntime {
  const claimStore = new modules.claims.InMemoryManagedAiExecutionClaimStoreV1();
  const base = modules.production.createGovernedProductionRuntimeV1({
    definitions: {
      findCurrent: (capabilityId) =>
        Promise.resolve(capabilityId === "managed-ai-execution" ? definition() : undefined),
    },
    implementationProfiles: implementationRegistry(),
    managedAiRuntime: {
      managedAiExecutor: executor,
      managedAiClaimStore: claimStore,
      managedAiExactOutputStore: exactOutputStore,
    },
    internalServiceSecret: secret,
  });
  if (!base) throw new Error("Core governed production runtime was not created");
  const durable = new modules.durable.DurableGovernedCapabilityRuntimeV1({
    runtime: base,
    replayStore,
  });
  return modules.core.createRuntime({
    port: 0,
    internalServiceSecret: secret,
    governedCapabilityRuntime: durable,
    managedAiExecutor: executor,
    managedAiClaimStore: claimStore,
    managedAiExactOutputStore: exactOutputStore,
  });
}

async function capabilityPost(
  port: number,
  body: unknown,
  headers: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`http://127.0.0.1:${port}${CAPABILITY_RUNTIME_V2_ROUTE}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

const crossRepoDescribe = coreCheckout ? describe : describe.skip;

crossRepoDescribe("Knowledge -> Core Capability Runtime V2 -> Managed AI", () => {
  it("selects the governed profile, resolves durable evidence, and survives Capability restart replay", async () => {
    if (!coreCheckout) throw new Error("MARKORBIT_CORE_CHECKOUT is required for this E2E test");
    const modules = await loadCoreModules(coreCheckout);
    const replayStore = new modules.replay.InMemoryCapabilityRuntimeReplayStoreV1();
    const exactOutputStore = new modules.exactOutputs.InMemoryManagedAiExactOutputStoreV1();
    let providerDispatches = 0;
    const firstExecutor: ManagedAiExecutor = {
      execute: (input) => {
        providerDispatches += 1;
        expect(JSON.stringify(input)).not.toContain("DEEPSEEK");
        expect(JSON.stringify(input)).not.toContain("deepseek-v4-flash");
        return Promise.resolve(completedOutcome(providerDispatches));
      },
    };

    const executionKey = `${assignment.assignmentId}:capability-v2:durable-replay`;
    const firstRuntime = makeServer(modules, replayStore, exactOutputStore, firstExecutor);
    let firstArtifactId: string;
    await firstRuntime.start();
    try {
      if (firstRuntime.listeningPort === undefined)
        throw new Error("Core runtime did not bind a port");
      const adapter = new ManagedAiCapabilityHttpDeepSeekKnowledgeAdapter({
        baseUrl: `http://127.0.0.1:${firstRuntime.listeningPort}`,
        internalServiceSecret: secret,
        principal,
      });
      const acquired = await adapter.acquire({ assignment, executionKey });
      firstArtifactId = acquired.artifact.artifactId;
      expect(acquired.artifact.content.content).toBe(markdown);
      expect(providerDispatches).toBe(1);
    } finally {
      await firstRuntime.stop();
    }

    let replayExecutorCalls = 0;
    const replayRuntime = makeServer(modules, replayStore, exactOutputStore, {
      execute: () => {
        replayExecutorCalls += 1;
        return Promise.reject(new Error("Capability durable replay must not re-enter Managed AI"));
      },
    });
    await replayRuntime.start();
    try {
      if (replayRuntime.listeningPort === undefined)
        throw new Error("Core replay runtime did not bind");
      const replayAdapter = new ManagedAiCapabilityHttpDeepSeekKnowledgeAdapter({
        baseUrl: `http://127.0.0.1:${replayRuntime.listeningPort}`,
        internalServiceSecret: secret,
        principal,
      });
      const replayed = await replayAdapter.acquire({ assignment, executionKey });
      expect(replayed.artifact.artifactId).toBe(firstArtifactId!);
      expect(providerDispatches).toBe(1);
      expect(replayExecutorCalls).toBe(0);
    } finally {
      await replayRuntime.stop();
    }
  });

  it("rejects principal spoofing and implementation controls at the real Core V2 boundary", async () => {
    if (!coreCheckout) throw new Error("MARKORBIT_CORE_CHECKOUT is required for this E2E test");
    const modules = await loadCoreModules(coreCheckout);
    const runtime = makeServer(
      modules,
      new modules.replay.InMemoryCapabilityRuntimeReplayStoreV1(),
      new modules.exactOutputs.InMemoryManagedAiExactOutputStoreV1(),
      { execute: () => Promise.resolve(completedOutcome(1)) },
    );
    await runtime.start();
    try {
      if (runtime.listeningPort === undefined) throw new Error("Core runtime did not bind a port");
      const baseHeaders = {
        "x-markorbit-internal-authorization": secret,
        "x-markorbit-principal": encodedPrincipal(principal),
        "x-markorbit-workspace-id": principal.workspaceId,
        "x-markorbit-caller-product": "KNOWLEDGE",
      };
      const command = {
        schemaVersion: 2,
        capabilityId: "managed-ai-execution",
        capabilityVersion: "1.0.0",
        caller: {
          workspaceId: principal.workspaceId,
          principalId: "spoofed-principal",
          callerProduct: "KNOWLEDGE",
          permissionContextRef: `core-workspace-membership:${principal.membershipId}`,
        },
        purpose: "Negative acceptance",
        input: managedInput(),
        inputSchemaId: "managed-ai-input.v1",
        outputSchemaId: "managed-ai-output.v1",
        riskClass: "MODERATE",
        idempotencyKey: "knowledge-capability:negative-spoof",
        correlationId: "knowledge-capability:negative-spoof",
      };
      const spoof = await capabilityPost(runtime.listeningPort, command, {
        ...baseHeaders,
        "idempotency-key": command.idempotencyKey,
        "x-correlation-id": command.correlationId,
      });
      expect(spoof.status).toBe(400);
      expect(spoof.body).toMatchObject({ code: "SUBJECT_SPOOF_REJECTED" });

      const controlled = {
        ...command,
        caller: {
          workspaceId: principal.workspaceId,
          principalId: principal.principalId,
          callerProduct: "KNOWLEDGE",
          permissionContextRef: `core-workspace-membership:${principal.membershipId}`,
        },
        idempotencyKey: "knowledge-capability:negative-control",
        correlationId: "knowledge-capability:negative-control",
        provider: "DEEPSEEK",
        model: "deepseek-v4-flash",
        implementationProfileId: "implementation-profile_forbidden",
      };
      const control = await capabilityPost(runtime.listeningPort, controlled, {
        ...baseHeaders,
        "idempotency-key": controlled.idempotencyKey,
        "x-correlation-id": controlled.correlationId,
      });
      expect(control.status).toBe(400);
      expect(control.body).toMatchObject({ code: "INVALID_REQUEST" });
    } finally {
      await runtime.stop();
    }
  });

  it("preserves Managed AI delivery-uncertain reconciliation through Capability REVIEW_REQUIRED", async () => {
    if (!coreCheckout) throw new Error("MARKORBIT_CORE_CHECKOUT is required for this E2E test");
    const modules = await loadCoreModules(coreCheckout);
    let calls = 0;
    const runtime = makeServer(
      modules,
      new modules.replay.InMemoryCapabilityRuntimeReplayStoreV1(),
      new modules.exactOutputs.InMemoryManagedAiExactOutputStoreV1(),
      {
        execute: () => {
          calls += 1;
          return Promise.resolve(reconciliationOutcome());
        },
      },
    );
    await runtime.start();
    try {
      if (runtime.listeningPort === undefined) throw new Error("Core runtime did not bind a port");
      const adapter = new ManagedAiCapabilityHttpDeepSeekKnowledgeAdapter({
        baseUrl: `http://127.0.0.1:${runtime.listeningPort}`,
        internalServiceSecret: secret,
        principal,
      });
      const executionKey = `${assignment.assignmentId}:capability-v2:reconciliation`;
      await expect(adapter.acquire({ assignment, executionKey })).rejects.toMatchObject({
        code: "AI_PROVIDER_NETWORK_ERROR",
      });
      expect(calls).toBe(1);
    } finally {
      await runtime.stop();
    }
  });
});
