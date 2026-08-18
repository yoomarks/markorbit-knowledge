import { createHash, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ExecutionReceipt, SourceDiscoveryBatch } from "@markorbit/contracts";
import { openRegistryDatabase, SqliteSourceRepository } from "@markorbit/persistence";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { SqliteConnectorRepository } from "@markorbit/persistence/connectors";
import { SqliteConversionRunLedgerRepository } from "@markorbit/persistence/conversion-runs";
import { SqliteConverterRegistryRepository } from "@markorbit/persistence/converters";
import { SqliteExecutionLedgerRepository } from "@markorbit/persistence/execution-ledger";
import { SqliteRawArtifactRepository } from "@markorbit/persistence/raw-artifacts";
import { SqliteSourceDiscoveryRepository } from "@markorbit/persistence/source-discovery";
import { SqliteSourceGraphRepository } from "@markorbit/persistence/source-graph";
import { SqliteWorkerExecutionRepository } from "@markorbit/persistence/worker-execution";
import { SqliteWorkerRegistryRepository } from "@markorbit/persistence/workers";
import { CRAWL4AI_PRODUCTION_CONNECTOR } from "../crawl4ai-production-connector";
import { runDiscoveryImportBatch } from "../discovery-batch-import-service";
import { DiscoveryCollectionService } from "../discovery-collection-service";
import { parseDiscoveryImport } from "../discovery-import-parser";
import { reviewDiscoveryCandidatesBatch } from "../discovery-review-batch-service";
import { DiscoveryWorkflowService } from "../discovery-service";
import { dispatchAutomaticConversionForArtifactWithDependencies } from "../raw-artifact-auto-conversion";

const temporaryPaths: string[] = [];

const executor = {
  executorId: "bulk-source-e2e-runtime",
  version: "1.0.0",
  mode: "FIXTURE" as const,
};

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) rmSync(path, { recursive: true, force: true });
});

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function* oneChunk(value: Uint8Array): AsyncIterable<Uint8Array> {
  yield value;
}

function csvFixture(): Uint8Array {
  const header = "url,category,authority,jurisdiction,language,note,tags";
  const rows = Array.from({ length: 100 }, (_, index) => {
    const ordinal = String(index + 1).padStart(3, "0");
    const official = index % 2 === 0;
    return [
      `https://bulk-${ordinal}.example.com`,
      official ? "OFFICIAL_AUTHORITY" : "LAW_FIRM",
      official ? "PRIMARY_OFFICIAL" : "PROFESSIONAL",
      official ? "US" : "GB",
      official ? "en-US" : "en",
      official ? "bulk-official" : "bulk-professional",
      official ? "official|trademark" : "peer|trademark",
    ].join(",");
  });
  return new TextEncoder().encode([header, ...rows].join("\n"));
}

describe("Bulk Source Pipeline E2E", () => {
  it("takes 100 spreadsheet websites through discovery, approval, first collection, and automatic conversion handoff", async () => {
    const preview = parseDiscoveryImport({
      fileName: "bulk-source-intake.csv",
      content: csvFixture(),
    });
    expect(preview.summary).toEqual({
      parsed: 100,
      valid: 100,
      invalid: 0,
      duplicate: 0,
      truncated: false,
    });

    const database = openRegistryDatabase(":memory:");
    const storageRoot = join(tmpdir(), `markorbit-bulk-source-e2e-${randomUUID()}`);
    temporaryPaths.push(storageRoot);
    const clock = () => new Date("2026-08-17T04:00:00.000Z");
    const sources = new SqliteSourceRepository(database, clock);
    const plans = new SqliteCollectionPlanRepository(database, clock);
    const connectors = new SqliteConnectorRepository(database);
    const discovery = new SqliteSourceDiscoveryRepository(database);
    const graph = new SqliteSourceGraphRepository(database);
    const runs = new SqliteExecutionLedgerRepository(database, clock);
    const workers = new SqliteWorkerRegistryRepository(database, clock);
    const executions = new SqliteWorkerExecutionRepository(database, clock);
    const artifacts = new SqliteRawArtifactRepository(database, storageRoot, clock);
    const converters = new SqliteConverterRegistryRepository(database, clock);
    const conversionRuns = new SqliteConversionRunLedgerRepository(database, clock);
    const candidateIds: string[] = [];

    const workflow = new DiscoveryWorkflowService({
      discovery,
      graph,
      sources,
      plans,
      connectors,
      provider: {
        async discover(batch: SourceDiscoveryBatch) {
          const seed = batch.seeds[0]!.locator;
          const candidateId = `cand_${String(candidateIds.length + 1).padStart(24, "0")}`;
          candidateIds.push(candidateId);
          return [
            {
              candidateId,
              locator: new URL("/trademarks", seed).toString(),
              title: `Trademark source ${candidateIds.length}`,
              discoveredAt: "2026-08-17T04:00:00.000Z",
              status: "DISCOVERED" as const,
              discoveredFrom: seed,
              discoveryMethod: "HTML_LINK" as const,
              depth: 1,
              metadata: { kind: "PAGE" },
            },
          ];
        },
      },
      transaction(operation) {
        database.exec("BEGIN IMMEDIATE;");
        try {
          const result = operation();
          database.exec("COMMIT;");
          return result;
        } catch (error) {
          database.exec("ROLLBACK;");
          throw error;
        }
      },
    });
    const collection = new DiscoveryCollectionService({ discovery, sources, plans, runs });

    const entries = preview.rows
      .filter((row) => row.status === "VALID")
      .map((row) => ({ locator: row.locator, intake: row.intake }));
    const imported = await runDiscoveryImportBatch(
      {
        entries,
        maxDepth: 1,
        maxCandidates: 1,
        maxFetches: 1,
      },
      { workflow },
    );
    expect(imported.summary).toEqual({
      submitted: 100,
      uniqueOrigins: 100,
      started: 100,
      skippedDuplicateInput: 0,
      skippedExistingSource: 0,
      failed: 0,
      candidateCount: 100,
    });
    expect(candidateIds).toHaveLength(100);

    const reviewed = reviewDiscoveryCandidatesBatch(
      {
        candidateIds,
        decision: "ACCEPTED",
        reviewer: "bulk-source-e2e",
        startCollection: true,
      },
      { workflow, collection },
    );
    expect(reviewed.summary).toEqual({
      requested: 100,
      succeeded: 100,
      failed: 0,
      collectionStarted: 100,
      collectionDeferred: 0,
    });

    const sourceList = sources.list({ sourceType: "WEB", limit: 100 });
    expect(sourceList.total).toBe(100);
    expect(
      sourceList.items.filter((source) => source.category === "OFFICIAL_AUTHORITY"),
    ).toHaveLength(50);
    expect(sourceList.items.filter((source) => source.category === "LAW_FIRM")).toHaveLength(50);
    expect(
      sourceList.items.filter((source) => source.authorityLevel === "PRIMARY_OFFICIAL"),
    ).toHaveLength(50);
    expect(
      sourceList.items.filter((source) => source.authorityLevel === "PROFESSIONAL"),
    ).toHaveLength(50);
    expect(sourceList.items.every((source) => Boolean(source.defaultCollectionPlanId))).toBe(true);

    const dispatched = runs.list({ limit: 100 });
    expect(dispatched.total).toBe(100);
    expect(dispatched.items.every((record) => record.run.status === "PENDING")).toBe(true);
    expect(dispatched.items.every((record) => record.jobs.length === 1)).toBe(true);

    const workspaceId = sourceList.items[0]!.workspaceId;
    const worker = workers.create({
      workspaceId,
      displayName: "Bulk Source E2E Worker",
      desiredState: "ACTIVE",
      runtime: { runtimeId: "bulk-source-e2e-worker", version: "1.0.0" },
      supportedJobTypes: ["WEB_CRAWL"],
      connectorBindings: [
        {
          connectorId: CRAWL4AI_PRODUCTION_CONNECTOR.connectorId,
          version: CRAWL4AI_PRODUCTION_CONNECTOR.version,
          capabilities: ["COLLECT"],
        },
      ],
      maxConcurrency: 1,
      labels: ["bulk-source-e2e"],
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

    const completedRunIds = new Set<string>();
    const conversionRunIds = new Set<string>();
    let firstArtifactId: string | null = null;
    let firstConversionRunId: string | null = null;
    for (let index = 0; index < 100; index += 1) {
      const claim = workers.claim(worker.view.worker.id, worker.credential);
      expect(claim.job).not.toBeNull();
      expect(claim.lease).not.toBeNull();
      expect(claim.leaseToken).toBeTruthy();
      const job = claim.job!;
      const lease = claim.lease!;
      const leaseToken = claim.leaseToken!;
      const started = executions.start(
        worker.view.worker.id,
        worker.credential,
        lease.id,
        leaseToken,
        {
          executor,
          idempotencyKey: `start-${index}`,
        },
      );
      executions.markUploading(worker.view.worker.id, worker.credential, lease.id, leaseToken, {
        idempotencyKey: `uploading-${index}`,
      });

      const sourceUri =
        job.sourceSnapshot.entrypoints[0]?.uri ??
        job.sourceSnapshot.canonicalUri ??
        `https://bulk-${String(index + 1).padStart(3, "0")}.example.com/`;
      const bytes = new TextEncoder().encode(
        `<html><body data-source="${job.sourceId}">bulk source captured</body></html>`,
      );
      const session = artifacts.createSession({
        workerId: worker.view.worker.id,
        credential: worker.credential,
        leaseId: lease.id,
        leaseToken,
        idempotencyKey: `artifact-${index}`,
        descriptor: {
          artifactKind: "HTML",
          mimeType: "text/html",
          originalName: `bulk-source-${index + 1}.html`,
          expectedSizeBytes: bytes.length,
          expectedSha256: sha256(bytes),
          sourceUri,
          canonicalUri: sourceUri,
        },
      });
      await artifacts.uploadContent(
        worker.view.worker.id,
        worker.credential,
        lease.id,
        leaseToken,
        session.record.session.id,
        oneChunk(bytes),
      );
      const finalized = await artifacts.finalize(
        worker.view.worker.id,
        worker.credential,
        lease.id,
        leaseToken,
        session.record.session.id,
      );
      expect(finalized.artifact.executionAttemptId).toBe(started.attempt.id);

      executions.markVerifying(worker.view.worker.id, worker.credential, lease.id, leaseToken, {
        idempotencyKey: `verifying-${index}`,
      });
      const receipt: ExecutionReceipt = {
        executor,
        outputKinds: ["HTML"],
        itemsObserved: 1,
        bytesPrepared: bytes.length,
        metadataOnly: false,
        artifactReceiptIds: [finalized.receipt.id],
        summary: "Bulk Source E2E finalized RawArtifact evidence.",
      };
      const completed = executions.complete(
        worker.view.worker.id,
        worker.credential,
        lease.id,
        leaseToken,
        { idempotencyKey: `complete-${index}`, receipt },
      );
      expect(completed.attempt.status).toBe("COMPLETED");
      completedRunIds.add(job.runId);

      const artifactId = finalized.artifact.artifact.id;
      const conversion = dispatchAutomaticConversionForArtifactWithDependencies(
        { database, artifacts, converters, conversionRuns, clock },
        artifactId,
        workspaceId,
      );
      expect(conversion.status).toBe("ENQUEUED");
      if (conversion.status === "ENQUEUED" || conversion.status === "REPLAYED") {
        conversionRunIds.add(conversion.conversionRunId);
        if (index === 0) {
          firstArtifactId = artifactId;
          firstConversionRunId = conversion.conversionRunId;
        }
      }
    }

    expect(completedRunIds.size).toBe(100);
    expect(conversionRunIds.size).toBe(100);
    expect(firstArtifactId).not.toBeNull();
    expect(firstConversionRunId).not.toBeNull();
    // A finalize/recovery replay must converge on the original AUTO_PROFILE run, not enqueue #101.
    const replay = dispatchAutomaticConversionForArtifactWithDependencies(
      { database, artifacts, converters, conversionRuns, clock },
      firstArtifactId!,
      workspaceId,
    );
    expect(replay.status).toBe("REPLAYED");
    if (replay.status === "REPLAYED") {
      expect(replay.conversionRunId).toBe(firstConversionRunId);
    }
    expect(artifacts.list({ limit: 100 }).total).toBe(100);
    expect(
      artifacts
        .list({ limit: 100 })
        .items.every((record) => record.artifact.status === "READY_FOR_CONVERSION"),
    ).toBe(true);
    const completedRuns = runs.list({ limit: 100 });
    expect(completedRuns.total).toBe(100);
    expect(completedRuns.items.every((record) => record.run.status === "COMPLETED")).toBe(true);
    const pendingConversions = conversionRuns.list({ workspaceId, limit: 100 });
    expect(pendingConversions.total).toBe(100);
    expect(pendingConversions.items.every((run) => run.trigger === "AUTO_PROFILE")).toBe(true);
    expect(pendingConversions.items.every((run) => run.status === "PENDING")).toBe(true);
    expect(workers.claim(worker.view.worker.id, worker.credential).job).toBeNull();

    database.close();
  }, 15_000);
});
