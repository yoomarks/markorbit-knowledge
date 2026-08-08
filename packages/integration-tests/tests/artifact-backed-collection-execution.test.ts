import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SqliteSourceRepository,
  openRegistryDatabase,
} from "@markorbit/persistence";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { SqliteExecutionLedgerRepository } from "@markorbit/persistence/execution-ledger";
import { SqliteRawArtifactRepository } from "@markorbit/persistence/raw-artifacts";
import { SqliteWorkerExecutionRepository } from "@markorbit/persistence/worker-execution";
import { SqliteWorkerRegistryRepository } from "@markorbit/persistence/workers";
import {
  ArtifactBackedCollectionExecutor,
  type ArtifactBackedExecutionClient,
  type ArtifactBackedExecutionContext,
  type CollectionArtifactAcquirer,
} from "@markorbit/worker-runtime";
import type {
  ArtifactIngestionSession,
  ArtifactUploadDescriptor,
  ExecutionExecutor,
  ExecutionReceipt,
} from "@markorbit/contracts";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const temporaryPaths: string[] = [];

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) rmSync(path, { recursive: true, force: true });
});

async function* oneChunk(value: Uint8Array): AsyncIterable<Uint8Array> {
  yield value;
}

describe("artifact-backed collection execution", () => {
  it("turns a pending CollectionRun into Worker-owned RawArtifact evidence", async () => {
    const database = openRegistryDatabase(":memory:");
    const storageRoot = join(tmpdir(), `markorbit-e2e-artifacts-${randomUUID()}`);
    temporaryPaths.push(storageRoot);
    const clock = () => new Date("2026-08-08T02:00:00.000Z");
    const sources = new SqliteSourceRepository(database, clock);
    const plans = new SqliteCollectionPlanRepository(database, clock);
    const runs = new SqliteExecutionLedgerRepository(database, clock);
    const workers = new SqliteWorkerRegistryRepository(database, clock);
    const executions = new SqliteWorkerExecutionRepository(database, clock);
    const artifacts = new SqliteRawArtifactRepository(database, storageRoot, clock);

    const source = sources.create({
      workspaceId,
      name: "Artifact-backed production boundary",
      slug: `artifact-backed-${randomUUID().slice(0, 8)}`,
      sourceType: "WEB",
      category: "OTHER",
      authorityLevel: "UNKNOWN",
      status: "ACTIVE",
      jurisdictions: ["GLOBAL"],
      languages: ["und"],
      connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
      canonicalUri: "https://example.com/trademarks",
      entrypoints: [{ uri: "https://example.com/trademarks" }],
    });
    const plan = plans.create({
      workspaceId,
      sourceId: source.id,
      name: "Artifact-backed manual collection",
      status: "ACTIVE",
      schedule: { mode: "MANUAL" },
      priority: "NORMAL",
      policy: {
        includePatterns: [],
        excludePatterns: [],
        maxDepth: 1,
        maxItems: 10,
        renderJavascript: false,
        fetchAttachments: false,
        respectRobots: true,
        rateLimitPerMinute: 10,
        timeoutSeconds: 30,
        retry: { maxAttempts: 1, backoffSeconds: 1 },
      },
      output: { artifactKinds: ["HTML"] },
    });
    const dispatched = runs.dispatchManual({
      planId: plan.plan.id,
      requestedBy: { actorType: "LOCAL_ADMIN", actorId: "integration-test" },
    }).record;

    const worker = workers.create({
      workspaceId,
      displayName: "Artifact-backed Worker",
      desiredState: "ACTIVE",
      runtime: { runtimeId: "artifact-backed-worker", version: "1.0.0" },
      supportedJobTypes: ["WEB_CRAWL"],
      connectorBindings: [
        {
          connectorId: "crawl4ai-web",
          version: "1.0.0",
          capabilities: ["COLLECT"],
        },
      ],
      maxConcurrency: 1,
      labels: ["integration"],
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
    const claim = workers.claim(worker.view.worker.id, worker.credential);
    expect(claim.job?.id).toBe(dispatched.jobs[0]?.id);
    expect(claim.lease).not.toBeNull();
    expect(claim.leaseToken).not.toBeNull();

    const context: ArtifactBackedExecutionContext = {
      workerId: worker.view.worker.id,
      job: claim.job!,
      lease: claim.lease!,
      leaseToken: claim.leaseToken!,
    };

    const client: ArtifactBackedExecutionClient = {
      async start(current, executor, idempotencyKey) {
        return executions.start(
          current.workerId,
          worker.credential,
          current.lease.id,
          current.leaseToken,
          { executor, idempotencyKey },
        ).attempt;
      },
      async uploading(current, idempotencyKey) {
        executions.markUploading(
          current.workerId,
          worker.credential,
          current.lease.id,
          current.leaseToken,
          { idempotencyKey },
        );
      },
      async createArtifactSession(current, descriptor: ArtifactUploadDescriptor, idempotencyKey) {
        return artifacts.createSession({
          workerId: current.workerId,
          credential: worker.credential,
          leaseId: current.lease.id,
          leaseToken: current.leaseToken,
          descriptor,
          idempotencyKey,
        }).record.session as ArtifactIngestionSession;
      },
      async uploadArtifactContent(current, sessionId, content) {
        await artifacts.uploadContent(
          current.workerId,
          worker.credential,
          current.lease.id,
          current.leaseToken,
          sessionId,
          oneChunk(content),
        );
      },
      async finalizeArtifact(current, sessionId) {
        return (
          await artifacts.finalize(
            current.workerId,
            worker.credential,
            current.lease.id,
            current.leaseToken,
            sessionId,
          )
        ).receipt;
      },
      async verifying(current, idempotencyKey) {
        executions.markVerifying(
          current.workerId,
          worker.credential,
          current.lease.id,
          current.leaseToken,
          { idempotencyKey },
        );
      },
      async complete(current, receipt: ExecutionReceipt, idempotencyKey) {
        executions.complete(
          current.workerId,
          worker.credential,
          current.lease.id,
          current.leaseToken,
          { receipt, idempotencyKey },
        );
      },
      async fail(current, failure, idempotencyKey) {
        executions.fail(
          current.workerId,
          worker.credential,
          current.lease.id,
          current.leaseToken,
          { ...failure, idempotencyKey },
        );
      },
    };

    const productionExecutor: ExecutionExecutor = {
      executorId: "integration-artifact-runtime",
      version: "1.0.0",
      mode: "PRODUCTION",
    };
    const acquirer: CollectionArtifactAcquirer = {
      executor: productionExecutor,
      async acquire(current) {
        const uri = current.job.sourceSnapshot.canonicalUri!;
        return [
          {
            artifactKind: "HTML",
            mimeType: "text/html",
            originalName: "trademarks.html",
            sourceUri: uri,
            canonicalUri: uri,
            content: new TextEncoder().encode("<html><body>controlled evidence</body></html>"),
          },
        ];
      },
    };

    const executor = new ArtifactBackedCollectionExecutor(acquirer, client);
    const receipt = await executor.execute(context);

    expect(receipt?.metadataOnly).toBe(false);
    expect(receipt?.artifactReceiptIds).toHaveLength(1);
    expect(receipt?.bytesPrepared).toBeGreaterThan(0);

    const completed = runs.getById(dispatched.run.id);
    expect(completed?.run.status).toBe("COMPLETED");
    expect(completed?.jobs[0]?.status).toBe("COMPLETED");

    const evidence = artifacts.list({ runId: dispatched.run.id });
    expect(evidence.total).toBe(1);
    expect(evidence.items[0]?.artifact.status).toBe("VERIFIED");
    expect(evidence.items[0]?.artifact.sourceId).toBe(source.id);
    expect(evidence.items[0]?.executionAttemptId).toBe(
      executions.getByLeaseId(claim.lease!.id)?.attempt.id,
    );

    database.close();
  });
});
