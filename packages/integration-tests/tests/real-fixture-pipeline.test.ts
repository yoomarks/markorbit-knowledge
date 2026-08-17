import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONVERSION_RUNTIME_VERSION,
  type ConversionClaimRequest,
  type ConversionFailedReport,
  type ConversionOutputReadyReport,
  type ConversionProgressReport,
  type ConversionStartedReport,
  type ConversionWorkerCapability,
  type RuntimeReportBase,
} from "@markorbit/contracts";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { SqliteWorkerExecutionRepository } from "@markorbit/persistence/worker-execution";
import { SqliteConverterRegistryRepository } from "@markorbit/persistence/converters";
import { SqliteExecutionLedgerRepository } from "@markorbit/persistence/execution-ledger";
import { SqliteRawArtifactRepository } from "@markorbit/persistence/raw-artifacts";
import { SqliteSourceRepository } from "@markorbit/persistence";
import { SqliteWorkerRegistryRepository } from "@markorbit/persistence/workers";
import {
  ControlledFixturePipeline,
  type ControlledFixturePipelineControlPlane,
  type FixtureConversionContext,
  type FixtureConversionRuntimeClient,
  type FixtureUploadEvidence,
} from "@markorbit/worker-runtime";
import { LocalIntegrationHarness } from "../src/local-integration-harness";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

async function* oneChunk(value: Uint8Array) {
  yield value;
}

class RepositoryRuntimeClient implements FixtureConversionRuntimeClient {
  private progressOrdinal = 0;

  constructor(
    private readonly harness: LocalIntegrationHarness,
    private readonly credential: string,
    private readonly clock: () => Date,
  ) {}

  private base(
    context: FixtureConversionContext,
    id: string,
    idempotencyKey: string,
    expectedCurrentStatus: RuntimeReportBase["expectedCurrentStatus"],
  ): RuntimeReportBase {
    return {
      contractVersion: CONVERSION_RUNTIME_VERSION,
      objectType: "CONVERSION_PROGRESS_REPORT",
      id,
      workspaceId: context.workspaceId,
      workerId: context.workerId,
      workerCredentialId: "worker-credential-fixture",
      conversionRunId: context.conversionRunId,
      conversionAttemptId: context.conversionAttemptId,
      conversionLeaseId: context.lease.id,
      leaseGeneration: context.lease.generation,
      leaseTokenReference: context.lease.tokenReference,
      leaseTokenDigest: context.lease.tokenDigest,
      idempotencyKey,
      occurredAt: this.clock().toISOString(),
      expectedCurrentStatus,
    };
  }

  async started(context: FixtureConversionContext, idempotencyKey: string): Promise<void> {
    const report = {
      ...this.base(context, "csr_01ARZ3NDEKTSV4RRFFQ69G5FAV", idempotencyKey, "PENDING"),
      objectType: "CONVERSION_STARTED_REPORT",
      converter: context.converter,
    } as ConversionStartedReport;
    this.harness.transitions.submitStarted(report, this.credential);
  }

  async progress(
    context: FixtureConversionContext,
    progress: { percent: number; message: string },
    idempotencyKey: string,
  ): Promise<void> {
    const ids = ["cpr_01ARZ3NDEKTSV4RRFFQ69G5FAV", "cpr_01ARZ3NDEKTSV4RRFFQ69G5FAW"];
    const report = {
      ...this.base(context, ids[this.progressOrdinal++]!, idempotencyKey, "RUNNING"),
      objectType: "CONVERSION_PROGRESS_REPORT",
      progress,
    } as ConversionProgressReport;
    this.harness.transitions.submitProgress(report, this.credential);
  }

  async outputReady(
    context: FixtureConversionContext,
    evidence: FixtureUploadEvidence,
    idempotencyKey: string,
  ): Promise<void> {
    const report = {
      ...this.base(context, "cor_01ARZ3NDEKTSV4RRFFQ69G5FAV", idempotencyKey, "RUNNING"),
      objectType: "CONVERSION_OUTPUT_READY_REPORT",
      output: evidence,
    } as ConversionOutputReadyReport;
    this.harness.transitions.submitOutputReady(report, this.credential);
  }

  async failed(
    context: FixtureConversionContext,
    failure: { code: string; message: string; retryable: false },
    idempotencyKey: string,
  ): Promise<void> {
    const report = {
      ...this.base(context, "cfr_01ARZ3NDEKTSV4RRFFQ69G5FAV", idempotencyKey, "RUNNING"),
      objectType: "CONVERSION_FAILED_REPORT",
      failure,
    } as ConversionFailedReport;
    this.harness.transitions.submitFailed(report, this.credential);
  }
}

async function scenario(harness: LocalIntegrationHarness, suffix: string) {
  const clock = () => new Date("2026-07-19T03:00:00Z");
  const sources = new SqliteSourceRepository(harness.database, clock);
  const plans = new SqliteCollectionPlanRepository(harness.database, clock);
  const executionRuns = new SqliteExecutionLedgerRepository(harness.database, clock);
  const workers = new SqliteWorkerRegistryRepository(harness.database, clock);
  const executions = new SqliteWorkerExecutionRepository(harness.database, clock);
  const artifacts = new SqliteRawArtifactRepository(
    harness.database,
    join(harness.rootDirectory, "raw-artifacts"),
    clock,
  );
  const converters = new SqliteConverterRegistryRepository(harness.database, clock);

  const source = sources.create({
    workspaceId,
    name: `Fixture pipeline ${suffix}`,
    slug: `fixture-pipeline-${suffix}-${randomUUID()}`,
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en-US"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    connectorConfig: {},
    canonicalUri: `https://example.com/${suffix}`,
    entrypoints: [{ uri: `https://example.com/${suffix}` }],
  });
  const plan = plans.create({
    workspaceId,
    sourceId: source.id,
    name: `Fixture plan ${suffix}`,
    status: "ACTIVE",
    schedule: { mode: "MANUAL" },
    priority: "NORMAL",
    policy: {
      includePatterns: [],
      excludePatterns: [],
      maxDepth: 1,
      maxItems: 1,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: true,
      rateLimitPerMinute: 1,
      timeoutSeconds: 30,
      retry: { maxAttempts: 1, backoffSeconds: 1 },
    },
    output: { artifactKinds: ["HTML"] },
  });
  executionRuns.dispatchManual({ planId: plan.plan.id });

  const worker = workers.create({
    workspaceId,
    displayName: `Fixture conversion worker ${suffix}`,
    desiredState: "ACTIVE",
    runtime: { runtimeId: "fixture-worker", version: "1.0.0" },
    supportedJobTypes: ["WEB_CRAWL"],
    connectorBindings: [
      { connectorId: "crawl4ai-web", version: "1.0.0", capabilities: ["COLLECT"] },
    ],
    maxConcurrency: 1,
    labels: ["conversion"],
  });
  workers.heartbeat(
    {
      workerId: worker.view.worker.id,
      observedAt: clock().toISOString(),
      runtimeVersion: "1.0.0",
      health: "HEALTHY",
      activeLeaseIds: [],
    },
    worker.credential,
  );
  const collectionClaim = workers.claim(worker.view.worker.id, worker.credential);
  executions.start(
    worker.view.worker.id,
    worker.credential,
    collectionClaim.lease!.id,
    collectionClaim.leaseToken!,
    {
      executor: { executorId: "fixture", version: "1.0.0", mode: "FIXTURE" },
      idempotencyKey: `start-${suffix}`,
    },
  );
  executions.markUploading(
    worker.view.worker.id,
    worker.credential,
    collectionClaim.lease!.id,
    collectionClaim.leaseToken!,
    { idempotencyKey: `uploading-${suffix}` },
  );

  const bytes = new TextEncoder().encode(`Real fixture pipeline ${suffix}.\n`);
  const session = artifacts.createSession({
    workerId: worker.view.worker.id,
    credential: worker.credential,
    leaseId: collectionClaim.lease!.id,
    leaseToken: collectionClaim.leaseToken!,
    idempotencyKey: `artifact-${suffix}`,
    descriptor: {
      artifactKind: "TEXT",
      mimeType: "text/plain",
      originalName: `${suffix}.txt`,
      expectedSizeBytes: bytes.length,
      expectedSha256: sha256(bytes),
      sourceUri: `https://example.com/${suffix}.txt`,
      canonicalUri: `https://example.com/${suffix}.txt`,
    },
  });
  await artifacts.uploadContent(
    worker.view.worker.id,
    worker.credential,
    collectionClaim.lease!.id,
    collectionClaim.leaseToken!,
    session.record.session.id,
    oneChunk(bytes),
  );
  const finalized = (
    await artifacts.finalize(
      worker.view.worker.id,
      worker.credential,
      collectionClaim.lease!.id,
      collectionClaim.leaseToken!,
      session.record.session.id,
    )
  ).artifact.artifact;
  const artifact = { ...finalized, status: "READY_FOR_CONVERSION" as const };
  harness.database
    .prepare("UPDATE raw_artifacts SET status = ?, document_json = ? WHERE id = ?")
    .run(artifact.status, JSON.stringify(artifact), artifact.id);

  const profile = converters.createProfile({
    workspaceId,
    sourceId: source.id,
    name: `Text profile ${suffix}`,
    converter: { converterId: "builtin-text-markdown", version: "1.0.0" },
    input: { artifactKinds: ["TEXT"], mimePatterns: ["text/plain"] },
    outputFormat: "MARKDOWN",
    targetPathTemplate: "00_Inbox/{artifactId}.md",
    configuration: {},
    precedence: 1,
    autoConvert: false,
  });
  const activeProfile = converters.updateProfileStatus(profile.id, "ACTIVE", profile.updatedAt);
  const dispatched = harness.runs.dispatchManual({
    workspaceId,
    rawArtifactId: artifact.id,
    conversionProfileId: activeProfile.id,
    requestedOutput: {
      format: "MARKDOWN",
      targetPathTemplate: activeProfile.targetPathTemplate,
    },
    trigger: "MANUAL",
    actor: { type: "ADMIN", id: "integration-test" },
    idempotencyKey: `dispatch-${suffix}`,
  });

  const capability: ConversionWorkerCapability = {
    contractVersion: CONVERSION_RUNTIME_VERSION,
    objectType: "CONVERSION_WORKER_CAPABILITY",
    id: suffix === "pass" ? "cwc_01ARZ3NDEKTSV4RRFFQ69G5FAV" : "cwc_01ARZ3NDEKTSV4RRFFQ69G5FAW",
    workerId: worker.view.worker.id,
    capabilityRevision: 1,
    supportedConverters: [{ converterId: "builtin-text-markdown", versions: ["1.0.0"] }],
    acceptedArtifactKinds: ["TEXT"],
    acceptedMimePatterns: ["text/plain"],
    supportedOutputFormats: ["MARKDOWN"],
    runtime: { runtimeId: "builtin-conversion-fixture", version: "1.0.0" },
    createdAt: clock().toISOString(),
  };
  harness.claims.registerCapability(capability);
  const request: ConversionClaimRequest = {
    contractVersion: CONVERSION_RUNTIME_VERSION,
    objectType: "CONVERSION_CLAIM_REQUEST",
    id: suffix === "pass" ? "ccr_01ARZ3NDEKTSV4RRFFQ69G5FAV" : "ccr_01ARZ3NDEKTSV4RRFFQ69G5FAW",
    workspaceId,
    workerId: worker.view.worker.id,
    workerCredentialId: "worker-credential-fixture",
    capabilityRevision: 1,
    supportedConverters: capability.supportedConverters,
    maxAcceptedWork: 1,
    idempotencyKey: `claim-${suffix}`,
    requestedLeaseDurationSeconds: 120,
  };
  harness.reader.register(artifact.id, bytes);

  return {
    runId: dispatched.record.run.id,
    bytes,
    request,
    runtimeClient: new RepositoryRuntimeClient(harness, worker.credential, clock),
  };
}

function faultInjectedControlPlane(
  harness: LocalIntegrationHarness,
  runId: string,
): ControlledFixturePipelineControlPlane {
  return {
    claim: (request) => harness.controlPlane.claim(request),
    sourceIdForRun: (workspace, conversionRunId) =>
      harness.controlPlane.sourceIdForRun(workspace, conversionRunId),
    ingestGenerated: (input) => harness.controlPlane.ingestGenerated(input),
    verifyGenerated: async (input) => {
      const row = harness.database
        .prepare("SELECT document_json FROM conversion_runs WHERE id = ?")
        .get(runId) as { document_json: string };
      const run = JSON.parse(row.document_json) as { input: { sha256: string }; id: string };
      run.input.sha256 = "f".repeat(64);
      harness.database
        .prepare("UPDATE conversion_runs SET document_json = ? WHERE id = ?")
        .run(JSON.stringify(run), run.id);
      return harness.controlPlane.verifyGenerated(input);
    },
    finalizeVerified: (input) => harness.controlPlane.finalizeVerified(input),
  };
}

describe("real fixture pipeline integration", () => {
  it("persists PASS → READY → COMPLETED through all real boundaries", async () => {
    const harness = new LocalIntegrationHarness({
      clock: () => new Date("2026-07-19T03:00:00Z"),
    });
    try {
      const env = await scenario(harness, "pass");
      const pipeline = new ControlledFixturePipeline(
        harness.controlPlane,
        harness.reader,
        harness.uploader,
        env.runtimeClient,
      );
      const result = await pipeline.execute({
        claimRequest: env.request,
        executionKey: "e2e-pass",
      });
      expect(result.status).toBe("COMPLETED");
      if (result.status !== "COMPLETED") throw new Error("Expected completed pipeline result");

      const inspection = harness.inspection.getByRun(workspaceId, env.runId);
      expect(inspection?.conversionRun.status).toBe("COMPLETED");
      expect(inspection?.latestAttempt?.status).toBe("OUTPUT_REPORTED");
      expect(inspection?.latestLease?.status).toBe("RELEASED");
      expect(inspection?.stagingDocument?.status).toBe("READY");
      expect(inspection?.verification?.outcome).toBe("PASS");
      expect(inspection?.observedPhase).toBe("COMPLETED");

      const markdown = harness.staging.readContent(result.stagingDocumentId, workspaceId);
      expect(new TextDecoder().decode(markdown)).toContain("Real fixture pipeline pass.");
      expect(sha256(markdown)).toBe(inspection?.stagingDocument?.contentHash.value);
    } finally {
      harness.close();
    }
  }, 15_000);

  it("persists binding failure as BLOCKED → FAILED through the real verifier and finalizer", async () => {
    const harness = new LocalIntegrationHarness({
      clock: () => new Date("2026-07-19T03:00:00Z"),
    });
    try {
      const env = await scenario(harness, "blocked");
      const pipeline = new ControlledFixturePipeline(
        faultInjectedControlPlane(harness, env.runId),
        harness.reader,
        harness.uploader,
        env.runtimeClient,
      );
      const result = await pipeline.execute({
        claimRequest: env.request,
        executionKey: "e2e-blocked",
      });
      expect(result.status).toBe("FAILED");
      if (result.status !== "FAILED") throw new Error("Expected failed pipeline result");
      expect(result.verificationOutcome).toBe("FAIL");

      const inspection = harness.inspection.getByRun(workspaceId, env.runId);
      expect(inspection?.conversionRun.status).toBe("FAILED");
      expect(inspection?.latestAttempt?.status).toBe("OUTPUT_REPORTED");
      expect(inspection?.latestLease?.status).toBe("RELEASED");
      expect(inspection?.stagingDocument?.status).toBe("BLOCKED");
      expect(inspection?.verification?.outcome).toBe("FAIL");
      expect(inspection?.verification?.checks.some((check) => check.status === "FAIL")).toBe(true);
      expect(inspection?.observedPhase).toBe("FAILED");
    } finally {
      harness.close();
    }
  });
});
