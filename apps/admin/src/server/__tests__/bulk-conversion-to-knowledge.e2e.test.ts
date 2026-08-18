import { createHash, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONVERSION_RUNTIME_VERSION,
  type ConversionOutputReadyReport,
  type ConversionStartedReport,
  type ConversionWorkerCapability,
  type ExecutionReceipt,
} from "@markorbit/contracts";
import { openRegistryDatabase, SqliteSourceRepository } from "@markorbit/persistence";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { SqliteConversionRunLedgerRepository } from "@markorbit/persistence/conversion-runs";
import { SqliteConversionRuntimePersistenceRepository } from "@markorbit/persistence/conversion-runtime";
import { SqliteConversionRuntimeTransitionRepository } from "@markorbit/persistence/conversion-runtime-transitions";
import { SqliteConverterRegistryRepository } from "@markorbit/persistence/converters";
import { SqliteExecutionLedgerRepository } from "@markorbit/persistence/execution-ledger";
import { SqliteRawArtifactRepository } from "@markorbit/persistence/raw-artifacts";
import { SqliteReadyPackageRegistryRepository } from "@markorbit/persistence/ready-packages";
import { SqliteRetrievalIndexRepository } from "@markorbit/persistence/retrieval-index";
import { SqliteStagingContentRegistryRepository } from "@markorbit/persistence/staging-content";
import { SqliteStagingVerificationRepository } from "@markorbit/persistence/staging-verification";
import { ControlPlaneVerifiedStagingFinalizer } from "@markorbit/persistence/verified-staging-finalization";
import { SqliteWorkerExecutionRepository } from "@markorbit/persistence/worker-execution";
import { SqliteWorkerRegistryRepository } from "@markorbit/persistence/workers";
import { canonicalMarkdownFrontmatter } from "@markorbit/worker-runtime";
import { canonicalDocumentMetadata } from "../canonical-document-metadata";
import {
  commitProductionStagingWithDependencies,
  type ProductionStagingCommitInput,
} from "../production-conversion-worker-service";
import { dispatchAutomaticConversionForArtifactWithDependencies } from "../raw-artifact-auto-conversion";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const paths: string[] = [];
const encoder = new TextEncoder();
const executor = { executorId: "bulk-knowledge-e2e", version: "1.0.0", mode: "FIXTURE" as const };

afterEach(() => paths.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

function hash(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function* chunk(value: Uint8Array) {
  yield value;
}

function fixtureId(prefix: string, ordinal: number): string {
  return `${prefix}_01ARZ3NDEKTSV4RRFFQ${String(ordinal).padStart(8, "0")}`;
}

describe("Bulk conversion to Knowledge E2E", () => {
  it("commits 100 auto conversion runs into READY Staging, ReadyPackages, and Retrieval", async () => {
    const database = openRegistryDatabase(":memory:");
    const rawRoot = join(tmpdir(), `markorbit-bulk-raw-${randomUUID()}`);
    const stagingRoot = join(tmpdir(), `markorbit-bulk-staging-${randomUUID()}`);
    paths.push(rawRoot, stagingRoot);
    const clock = () => new Date("2026-08-18T04:00:00.000Z");

    const sources = new SqliteSourceRepository(database, clock);
    const plans = new SqliteCollectionPlanRepository(database, clock);
    const collectionRuns = new SqliteExecutionLedgerRepository(database, clock);
    const workers = new SqliteWorkerRegistryRepository(database, clock);
    const executions = new SqliteWorkerExecutionRepository(database, clock);
    const artifacts = new SqliteRawArtifactRepository(database, rawRoot, clock);
    const converters = new SqliteConverterRegistryRepository(database, clock);
    const conversionRuns = new SqliteConversionRunLedgerRepository(database, clock);
    const runtime = new SqliteConversionRuntimePersistenceRepository(database, clock);
    const transitions = new SqliteConversionRuntimeTransitionRepository(database, clock);
    const staging = new SqliteStagingContentRegistryRepository(database, stagingRoot, clock);
    const stagingVerification = new SqliteStagingVerificationRepository(database, staging, clock);
    const stagingFinalizer = new ControlPlaneVerifiedStagingFinalizer(
      staging,
      stagingVerification,
      transitions,
    );
    const readyPackages = new SqliteReadyPackageRegistryRepository(database, clock);
    const retrieval = new SqliteRetrievalIndexRepository(database, clock);

    const source = sources.create({
      workspaceId,
      name: "Bulk Knowledge fixture",
      slug: `bulk-knowledge-${randomUUID()}`,
      sourceType: "WEB",
      category: "OFFICIAL_AUTHORITY",
      authorityLevel: "PRIMARY_OFFICIAL",
      status: "ACTIVE",
      jurisdictions: ["US"],
      languages: ["en-US"],
      connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
      connectorConfig: {},
      canonicalUri: "https://bulk-knowledge.example.com",
      entrypoints: [{ uri: "https://bulk-knowledge.example.com" }],
    });
    const plan = plans.create({
      workspaceId,
      sourceId: source.id,
      name: "Bulk Knowledge plan",
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
        rateLimitPerMinute: 60,
        timeoutSeconds: 30,
        retry: { maxAttempts: 1, backoffSeconds: 1 },
      },
      output: { artifactKinds: ["HTML"] },
    });
    for (let index = 0; index < 100; index += 1) {
      collectionRuns.dispatchManual({
        planId: plan.plan.id,
        idempotencyKey: `bulk-collection-${index + 1}`,
      });
    }

    const worker = workers.create({
      workspaceId,
      displayName: "Bulk Knowledge Worker",
      desiredState: "ACTIVE",
      runtime: { runtimeId: "bulk-knowledge-runtime", version: "1.0.0" },
      supportedJobTypes: ["WEB_CRAWL"],
      connectorBindings: [
        { connectorId: "crawl4ai-web", version: "1.0.0", capabilities: ["COLLECT"] },
      ],
      maxConcurrency: 1,
      labels: ["bulk-knowledge-e2e"],
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

    for (let index = 0; index < 100; index += 1) {
      const claim = workers.claim(worker.view.worker.id, worker.credential);
      const job = claim.job!;
      const lease = claim.lease!;
      const token = claim.leaseToken!;
      const started = executions.start(worker.view.worker.id, worker.credential, lease.id, token, {
        executor,
        idempotencyKey: `bulk-start-${index + 1}`,
      });
      executions.markUploading(worker.view.worker.id, worker.credential, lease.id, token, {
        idempotencyKey: `bulk-uploading-${index + 1}`,
      });
      const sourceUri = `https://bulk-knowledge.example.com/doc/${index + 1}`;
      const bytes = encoder.encode(`<html><body>bulk document ${index + 1}</body></html>`);
      const session = artifacts.createSession({
        workerId: worker.view.worker.id,
        credential: worker.credential,
        leaseId: lease.id,
        leaseToken: token,
        idempotencyKey: `bulk-artifact-${index + 1}`,
        descriptor: {
          artifactKind: "HTML",
          mimeType: "text/html",
          originalName: `document-${index + 1}.html`,
          expectedSizeBytes: bytes.length,
          expectedSha256: hash(bytes),
          sourceUri,
          canonicalUri: sourceUri,
        },
      });
      await artifacts.uploadContent(
        worker.view.worker.id,
        worker.credential,
        lease.id,
        token,
        session.record.session.id,
        chunk(bytes),
      );
      const finalized = await artifacts.finalize(
        worker.view.worker.id,
        worker.credential,
        lease.id,
        token,
        session.record.session.id,
      );
      executions.markVerifying(worker.view.worker.id, worker.credential, lease.id, token, {
        idempotencyKey: `bulk-verifying-${index + 1}`,
      });
      const receipt: ExecutionReceipt = {
        executor,
        outputKinds: ["HTML"],
        itemsObserved: 1,
        bytesPrepared: bytes.length,
        metadataOnly: false,
        artifactReceiptIds: [finalized.receipt.id],
        summary: "Bulk Knowledge E2E finalized RawArtifact evidence.",
      };
      executions.complete(worker.view.worker.id, worker.credential, lease.id, token, {
        idempotencyKey: `bulk-complete-${index + 1}`,
        receipt,
      });
      const handoff = dispatchAutomaticConversionForArtifactWithDependencies(
        { database, artifacts, converters, conversionRuns, clock },
        finalized.artifact.artifact.id,
        workspaceId,
      );
      expect(handoff.status).toBe("ENQUEUED");
      expect(started.attempt.status).toBe("RUNNING");
      expect(job.runId).toBeTruthy();
    }

    expect(artifacts.list({ workspaceId, limit: 100 }).total).toBe(100);
    expect(conversionRuns.list({ workspaceId, limit: 100 }).total).toBe(100);

    const capability: ConversionWorkerCapability = {
      contractVersion: CONVERSION_RUNTIME_VERSION,
      objectType: "CONVERSION_WORKER_CAPABILITY",
      id: "cwc_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      workerId: worker.view.worker.id,
      capabilityRevision: 1,
      supportedConverters: [{ converterId: "builtin-html-markdown", versions: ["1.0.0"] }],
      acceptedArtifactKinds: ["HTML"],
      acceptedMimePatterns: ["text/html"],
      supportedOutputFormats: ["MARKDOWN"],
      runtime: { runtimeId: "bulk-conversion-runtime", version: "1.0.0" },
      createdAt: clock().toISOString(),
    };
    runtime.registerCapability(capability);

    const dependencies = {
      workers,
      conversionRuns,
      artifacts,
      sources,
      staging,
      stagingVerification,
      stagingFinalizer,
      readyPackages,
      retrieval,
    };
    let replayInput: ProductionStagingCommitInput | null = null;
    let replayPackageId: string | undefined;

    for (let index = 0; index < 100; index += 1) {
      const claimed = runtime.claim({
        contractVersion: CONVERSION_RUNTIME_VERSION,
        objectType: "CONVERSION_CLAIM_REQUEST",
        id: fixtureId("ccr", index + 1),
        workspaceId,
        workerId: worker.view.worker.id,
        workerCredentialId: `bulk-worker-credential-${index + 1}`,
        capabilityRevision: 1,
        supportedConverters: capability.supportedConverters,
        maxAcceptedWork: 1,
        idempotencyKey: `bulk-conversion-claim-${index + 1}`,
        requestedLeaseDurationSeconds: 120,
      }).result;
      expect(claimed.result).toBe("CLAIMED");
      const lease = claimed.lease!;
      const grant = claimed.stagingOutputUploadGrant!;
      const run = conversionRuns.getById(lease.conversionRunId, workspaceId)!.run;
      const reportBase = {
        contractVersion: CONVERSION_RUNTIME_VERSION,
        workspaceId,
        workerId: worker.view.worker.id,
        workerCredentialId: `bulk-worker-credential-${index + 1}`,
        conversionRunId: run.id,
        conversionAttemptId: lease.conversionAttemptId,
        conversionLeaseId: lease.id,
        leaseGeneration: lease.generation,
        leaseTokenReference: lease.tokenReference,
        leaseTokenDigest: lease.tokenDigest,
        occurredAt: clock().toISOString(),
      } as const;
      const startedReport: ConversionStartedReport = {
        ...reportBase,
        objectType: "CONVERSION_STARTED_REPORT",
        id: fixtureId("csr", index + 1),
        idempotencyKey: `bulk-conversion-start-${index + 1}`,
        expectedCurrentStatus: "PENDING",
        converter: run.converter,
      };
      expect(transitions.submitStarted(startedReport, worker.credential).run.status).toBe("RUNNING");

      const artifact = artifacts.getArtifact(run.rawArtifactId)!.artifact;
      const metadata = canonicalDocumentMetadata(run, artifact, source);
      const markdown = encoder.encode(
        `${canonicalMarkdownFrontmatter(metadata)}\n# Document ${index + 1}\n\nBulk Knowledge content ${index + 1}.\n`,
      );
      const outputReport: ConversionOutputReadyReport = {
        ...reportBase,
        objectType: "CONVERSION_OUTPUT_READY_REPORT",
        id: fixtureId("cor", index + 1),
        idempotencyKey: `bulk-conversion-output-${index + 1}`,
        expectedCurrentStatus: "RUNNING",
        output: {
          uploadGrantId: grant.id,
          targetPath: grant.normalizedTargetPath,
          sha256: hash(markdown),
          sizeBytes: markdown.byteLength,
          mediaType: "text/markdown",
        },
      };
      expect(transitions.submitOutputReady(outputReport, worker.credential).run.status).toBe(
        "VERIFYING",
      );

      const stagingInput: ProductionStagingCommitInput = {
        workspaceId,
        workerId: worker.view.worker.id,
        conversionRunId: run.id,
        conversionAttemptId: lease.conversionAttemptId,
        uploadGrantId: grant.id,
        idempotencyKey: `bulk-staging-${index + 1}`,
        content: markdown,
      };
      const committed = commitProductionStagingWithDependencies(
        dependencies,
        stagingInput,
        worker.credential,
      );
      expect(committed.finalizationDecision).toBe("COMPLETED");
      expect(committed.stagingStatus).toBe("READY");
      expect(committed.readyPackageId).toBeTruthy();
      expect(committed.coreIntakeRequestPreview).toBeTruthy();
      if (index === 0) {
        replayInput = stagingInput;
        replayPackageId = committed.readyPackageId;
      }
    }

    expect(conversionRuns.list({ workspaceId, limit: 100 }).items.every((run) => run.status === "COMPLETED")).toBe(true);
    const knowledge = staging.listDocuments({ workspaceId, limit: 100 });
    expect(knowledge.total).toBe(100);
    expect(knowledge.items.every((record) => record.descriptor.status === "READY")).toBe(true);
    expect(new Set(knowledge.items.map((record) => record.descriptor.rawArtifactId)).size).toBe(100);
    expect(readyPackages.list(workspaceId)).toHaveLength(100);
    expect(
      database.prepare("SELECT COUNT(*) AS total FROM retrieval_documents").get(),
    ).toEqual({ total: 100 });

    const replay = commitProductionStagingWithDependencies(
      dependencies,
      replayInput!,
      worker.credential,
    );
    expect(replay.readyPackageId).toBe(replayPackageId);
    expect(staging.listDocuments({ workspaceId, limit: 100 }).total).toBe(100);
    expect(readyPackages.list(workspaceId)).toHaveLength(100);

    database.close();
  }, 30_000);
});
