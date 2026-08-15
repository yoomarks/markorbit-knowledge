import { createHash, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteSourceRepository, openRegistryDatabase } from "../src/index";
import { SqliteCollectionPlanRepository } from "../src/collection-plan-registry";
import { SqliteExecutionLedgerRepository } from "../src/execution-ledger";
import { SqliteWorkerExecutionRepository } from "../src/controlled-worker-execution";
import { SqliteWorkerRegistryRepository } from "../src/safe-worker-registry";
import { SqliteRawArtifactRepository } from "../src/raw-artifact-registry";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
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

async function environment() {
  const database = openRegistryDatabase(":memory:");
  const storageRoot = join(tmpdir(), `markorbit-identity-${randomUUID()}`);
  temporaryPaths.push(storageRoot);
  const clock = () => new Date("2026-08-15T14:00:00Z");
  const sources = new SqliteSourceRepository(database, clock);
  const plans = new SqliteCollectionPlanRepository(database, clock);
  const runs = new SqliteExecutionLedgerRepository(database, clock);
  const workers = new SqliteWorkerRegistryRepository(database, clock);
  const executions = new SqliteWorkerExecutionRepository(database, clock);
  const artifacts = new SqliteRawArtifactRepository(database, storageRoot, clock);

  const source = sources.create({
    workspaceId,
    name: "Incremental identity source",
    slug: `incremental-identity-${randomUUID().slice(0, 8)}`,
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en-US"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    connectorConfig: {},
    canonicalUri: "https://example.com/rules",
    entrypoints: [{ uri: "https://example.com/rules" }],
  });
  const plan = plans.create({
    workspaceId,
    sourceId: source.id,
    name: "Incremental identity plan",
    status: "ACTIVE",
    schedule: { mode: "MANUAL" },
    priority: "NORMAL",
    policy: {
      includePatterns: [],
      excludePatterns: [],
      maxDepth: 1,
      maxItems: 5,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: true,
      rateLimitPerMinute: 10,
      timeoutSeconds: 30,
      retry: { maxAttempts: 1, backoffSeconds: 1 },
    },
    output: { artifactKinds: ["HTML"] },
  });
  runs.dispatchManual({ planId: plan.plan.id });
  const worker = workers.create({
    workspaceId,
    displayName: "Incremental identity worker",
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
  executions.start(
    worker.view.worker.id,
    worker.credential,
    claim.lease!.id,
    claim.leaseToken!,
    {
      executor: { executorId: "fixture", version: "1.0.0", mode: "FIXTURE" },
      idempotencyKey: "start",
    },
  );
  executions.markUploading(
    worker.view.worker.id,
    worker.credential,
    claim.lease!.id,
    claim.leaseToken!,
    { idempotencyKey: "uploading" },
  );

  const bytes = new TextEncoder().encode("<html>stable rules</html>");
  const canonicalUri = "https://example.com/rules";
  const session = artifacts.createSession({
    workerId: worker.view.worker.id,
    credential: worker.credential,
    leaseId: claim.lease!.id,
    leaseToken: claim.leaseToken!,
    idempotencyKey: "artifact",
    descriptor: {
      artifactKind: "HTML",
      mimeType: "text/html",
      originalName: "rules.html",
      expectedSizeBytes: bytes.length,
      expectedSha256: sha256(bytes),
      sourceUri: canonicalUri,
      canonicalUri,
    },
  });
  await artifacts.uploadContent(
    worker.view.worker.id,
    worker.credential,
    claim.lease!.id,
    claim.leaseToken!,
    session.record.session.id,
    oneChunk(bytes),
  );
  const finalized = await artifacts.finalize(
    worker.view.worker.id,
    worker.credential,
    claim.lease!.id,
    claim.leaseToken!,
    session.record.session.id,
  );

  return { database, artifacts, worker, claim, bytes, canonicalUri, finalized };
}

describe("RawArtifact current content identity", () => {
  it("matches only the latest canonical artifact of the same source and kind", async () => {
    const env = await environment();
    const auth = {
      workerId: env.worker.view.worker.id,
      credential: env.worker.credential,
      leaseId: env.claim.lease!.id,
      leaseToken: env.claim.leaseToken!,
      artifactKind: "HTML" as const,
      canonicalUri: env.canonicalUri,
    };

    expect(env.artifacts.checkCurrentContent({ ...auth, sha256: sha256(env.bytes) })).toEqual({
      unchanged: true,
      latestArtifactId: env.finalized.artifact.artifact.id,
      latestSha256: sha256(env.bytes),
    });
    expect(
      env.artifacts.checkCurrentContent({
        ...auth,
        sha256: sha256(new TextEncoder().encode("changed rules")),
      }),
    ).toMatchObject({
      unchanged: false,
      latestArtifactId: env.finalized.artifact.artifact.id,
      latestSha256: sha256(env.bytes),
    });
    expect(
      env.artifacts.checkCurrentContent({
        ...auth,
        canonicalUri: "https://example.com/fees",
        sha256: sha256(env.bytes),
      }),
    ).toEqual({ unchanged: false, latestArtifactId: null, latestSha256: null });

    env.database.close();
  });
});
