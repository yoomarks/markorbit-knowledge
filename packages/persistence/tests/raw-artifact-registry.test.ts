import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { ExecutionReceipt } from "@markorbit/contracts";
import { SqliteSourceRepository, listAppliedMigrations, openRegistryDatabase } from "../src/index";
import { SqliteCollectionPlanRepository } from "../src/collection-plan-registry";
import { SqliteExecutionLedgerRepository } from "../src/execution-ledger";
import { SqliteWorkerExecutionRepository } from "../src/controlled-worker-execution";
import { SqliteWorkerRegistryRepository } from "../src/safe-worker-registry";
import {
  LocalContentAddressedStore,
  SqliteRawArtifactRepository,
  ensureRawArtifactRegistry,
} from "../src/raw-artifact-registry";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const executor = {
  executorId: "fixture-connector-runtime",
  version: "1.0.0",
  mode: "FIXTURE" as const,
};
const temporaryPaths: string[] = [];

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) rmSync(path, { recursive: true, force: true });
});

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function* oneChunk(value: Uint8Array): AsyncIterable<Uint8Array> {
  yield value;
}

function createEnvironment(databasePath = ":memory:") {
  const database = openRegistryDatabase(databasePath);
  const storageRoot = join(tmpdir(), `markorbit-artifacts-${randomUUID()}`);
  temporaryPaths.push(storageRoot);
  const clock = () => new Date("2026-07-16T19:00:00Z");
  const sources = new SqliteSourceRepository(database, clock);
  const plans = new SqliteCollectionPlanRepository(database, clock);
  const runs = new SqliteExecutionLedgerRepository(database, clock);
  const workers = new SqliteWorkerRegistryRepository(database, clock);
  const executions = new SqliteWorkerExecutionRepository(database, clock);
  const artifacts = new SqliteRawArtifactRepository(database, storageRoot, clock);
  const source = sources.create({
    workspaceId,
    name: "Artifact fixture source",
    slug: `artifact-fixture-${Math.random().toString(36).slice(2)}`,
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en-US"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    connectorConfig: {},
    canonicalUri: "https://example.com/news",
    entrypoints: [{ uri: "https://example.com/news" }],
  });
  const plan = plans.create({
    workspaceId,
    sourceId: source.id,
    name: "Artifact fixture plan",
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
  const run = runs.dispatchManual({ planId: plan.plan.id }).record;
  const worker = workers.create({
    workspaceId,
    displayName: "Artifact fixture Worker",
    desiredState: "ACTIVE",
    runtime: { runtimeId: "fixture-worker", version: "1.0.0" },
    supportedJobTypes: ["WEB_CRAWL"],
    connectorBindings: [
      { connectorId: "crawl4ai-web", version: "1.0.0", capabilities: ["COLLECT"] },
    ],
    maxConcurrency: 1,
    labels: ["fixture"],
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
  const started = executions.start(
    worker.view.worker.id,
    worker.credential,
    claim.lease!.id,
    claim.leaseToken!,
    { executor, idempotencyKey: "start" },
  );
  executions.markUploading(
    worker.view.worker.id,
    worker.credential,
    claim.lease!.id,
    claim.leaseToken!,
    { idempotencyKey: "uploading" },
  );
  return {
    database,
    storageRoot,
    source,
    plan,
    run,
    worker,
    claim,
    executions,
    artifacts,
    started,
  };
}

async function ingest(env: ReturnType<typeof createEnvironment>, bytes: Uint8Array, key: string) {
  const created = env.artifacts.createSession({
    workerId: env.worker.view.worker.id,
    credential: env.worker.credential,
    leaseId: env.claim.lease!.id,
    leaseToken: env.claim.leaseToken!,
    idempotencyKey: key,
    descriptor: {
      artifactKind: "HTML",
      mimeType: "text/html",
      originalName: "../unsafe\u0000-page.html",
      expectedSizeBytes: bytes.length,
      expectedSha256: sha256(bytes),
      sourceUri: `https://example.com/${key}`,
      canonicalUri: `https://example.com/${key}`,
    },
  });
  await env.artifacts.uploadContent(
    env.worker.view.worker.id,
    env.worker.credential,
    env.claim.lease!.id,
    env.claim.leaseToken!,
    created.record.session.id,
    oneChunk(bytes),
  );
  return env.artifacts.finalize(
    env.worker.view.worker.id,
    env.worker.credential,
    env.claim.lease!.id,
    env.claim.leaseToken!,
    created.record.session.id,
  );
}

describe("RawArtifact ingestion registry", () => {
  it("applies migration 0007 idempotently", () => {
    const database = new DatabaseSync(":memory:");
    ensureRawArtifactRegistry(database);
    ensureRawArtifactRegistry(database);
    expect(listAppliedMigrations(database)).toContain("0007_raw_artifact_ingestion");
    expect(
      database
        .prepare("SELECT id FROM schema_migrations WHERE id = '0007_raw_artifact_ingestion'")
        .all(),
    ).toHaveLength(1);
    database.close();
  });

  it("streams, verifies, finalizes and persists immutable provenance", async () => {
    const env = createEnvironment();
    const bytes = new TextEncoder().encode("<html>verified</html>");
    const result = await ingest(env, bytes, "verified-page");
    expect(result.artifact.artifact.binaryHash.value).toBe(sha256(bytes));
    expect(result.artifact.artifact.originalName).toBe("unsafe-page.html");
    expect(result.artifact.executionAttemptId).toBe(env.started.attempt.id);
    expect(result.artifact.contentObject.storageUri).toBe(
      `artifact+local://sha256/${sha256(bytes)}`,
    );
    const content = env.artifacts.contentPath(result.artifact.artifact.id);
    expect(readFileSync(content.path)).toEqual(Buffer.from(bytes));
    expect(content.path.startsWith(env.storageRoot)).toBe(true);
    env.database.close();
  });

  it("stores identical bytes once while retaining separate provenance records", async () => {
    const env = createEnvironment();
    const bytes = new TextEncoder().encode("same bytes");
    const first = await ingest(env, bytes, "one");
    const second = await ingest(env, bytes, "two");
    expect(first.artifact.artifact.id).not.toBe(second.artifact.artifact.id);
    expect(second.artifact.contentObject.referenceCount).toBe(2);
    expect(env.database.prepare("SELECT COUNT(*) AS count FROM content_objects").get()).toEqual({
      count: 1,
    });
    env.database.close();
  });

  it("rejects size or digest mismatches without registering RawArtifact", async () => {
    const env = createEnvironment();
    const bytes = new TextEncoder().encode("observed");
    const created = env.artifacts.createSession({
      workerId: env.worker.view.worker.id,
      credential: env.worker.credential,
      leaseId: env.claim.lease!.id,
      leaseToken: env.claim.leaseToken!,
      idempotencyKey: "mismatch",
      descriptor: {
        artifactKind: "HTML",
        mimeType: "text/html",
        originalName: "page.html",
        expectedSizeBytes: bytes.length + 1,
        expectedSha256: sha256(bytes),
        sourceUri: "https://example.com/mismatch",
      },
    });
    await expect(
      env.artifacts.uploadContent(
        env.worker.view.worker.id,
        env.worker.credential,
        env.claim.lease!.id,
        env.claim.leaseToken!,
        created.record.session.id,
        oneChunk(bytes),
      ),
    ).rejects.toThrow();
    expect(env.artifacts.list().total).toBe(0);
    expect(env.artifacts.getSession(created.record.session.id)?.session.status).toBe("QUARANTINED");
    env.database.close();
  });

  it("gates artifact-backed completion on finalized receipts", async () => {
    const env = createEnvironment();
    const bytes = new TextEncoder().encode("content evidence");
    const finalized = await ingest(env, bytes, "completion");
    env.executions.markVerifying(
      env.worker.view.worker.id,
      env.worker.credential,
      env.claim.lease!.id,
      env.claim.leaseToken!,
      { idempotencyKey: "verifying" },
    );
    const receipt: ExecutionReceipt = {
      executor,
      outputKinds: ["HTML"],
      itemsObserved: 1,
      bytesPrepared: bytes.length,
      metadataOnly: false,
      artifactReceiptIds: [finalized.receipt.id],
      summary: "Finalized content evidence.",
    };
    const completed = env.executions.complete(
      env.worker.view.worker.id,
      env.worker.credential,
      env.claim.lease!.id,
      env.claim.leaseToken!,
      { idempotencyKey: "complete", receipt },
    );
    expect(completed.attempt.status).toBe("COMPLETED");
    env.database.close();
  });

  it("rejects path escapes and cleans abandoned temporary sessions", async () => {
    const root = join(tmpdir(), `markorbit-store-${randomUUID()}`);
    temporaryPaths.push(root);
    const store = new LocalContentAddressedStore(root, 8);
    expect(() => store.resolveObject("../../etc/passwd")).toThrow();
    const write = await store.writeSession(
      "ing_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      oneChunk(new TextEncoder().encode("1234")),
    );
    expect(existsSync(join(root, write.relativePath))).toBe(true);
    store.cleanupSession(write.relativePath);
    expect(existsSync(join(root, write.relativePath))).toBe(false);
  });
});
