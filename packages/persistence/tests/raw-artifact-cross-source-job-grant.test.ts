import { createHash, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CROSS_SOURCE_PARENT_ARTIFACT_IDS_EXTENSION,
  type ArtifactUploadDescriptor,
} from "@markorbit/contracts";
import { SqliteCollectionPlanRepository } from "../src/collection-plan-registry";
import { SqliteWorkerExecutionRepository } from "../src/controlled-worker-execution";
import { SqliteExecutionLedgerRepository } from "../src/execution-ledger";
import { openRegistryDatabase, SqliteSourceRepository } from "../src/index";
import { SqliteRawArtifactRepository } from "../src/raw-artifact-repository";
import { SqliteWorkerRegistryRepository } from "../src/safe-worker-registry";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const temporaryPaths: string[] = [];
const clock = () => new Date("2026-09-19T14:00:00.000Z");
const executor = {
  executorId: "cross-source-lineage-fixture",
  version: "1.0.0",
  mode: "FIXTURE" as const,
};
afterEach(() => {
  for (const path of temporaryPaths.splice(0)) rmSync(path, { recursive: true, force: true });
});

function sourceAndPlan(
  sources: SqliteSourceRepository,
  plans: SqliteCollectionPlanRepository,
  suffix: string,
) {
  const source = sources.create({
    workspaceId,
    name: `Cross source fixture ${suffix}`,
    slug: `cross-source-${suffix}-${randomUUID()}`,
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["CN"],
    languages: ["zh-CN"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    connectorConfig: {},
    canonicalUri: `https://example.com/${suffix}`,
    entrypoints: [{ uri: `https://example.com/${suffix}` }],
  });
  const plan = plans.create({
    workspaceId,
    sourceId: source.id,
    name: `Cross source plan ${suffix}`,
    status: "ACTIVE",
    schedule: { mode: "MANUAL" },
    priority: "NORMAL",
    policy: {
      includePatterns: [],
      excludePatterns: [],
      maxDepth: 0,
      maxItems: 2,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: true,
      rateLimitPerMinute: 10,
      timeoutSeconds: 30,
      retry: { maxAttempts: 1, backoffSeconds: 1 },
    },
    output: { artifactKinds: ["JSON"] },
  });
  return { source, plan: plan.plan };
}

function createWorker(workers: SqliteWorkerRegistryRepository, suffix: string) {
  return workers.create({
    workspaceId,
    displayName: `Cross source worker ${suffix}`,
    desiredState: "ACTIVE",
    runtime: { runtimeId: `fixture-${suffix}`, version: "1.0.0" },
    supportedJobTypes: ["WEB_CRAWL"],
    connectorBindings: [
      { connectorId: "crawl4ai-web", version: "1.0.0", capabilities: ["COLLECT"] },
    ],
    maxConcurrency: 1,
    labels: ["fixture"],
  });
}

function claimAndStart(
  workers: SqliteWorkerRegistryRepository,
  executions: SqliteWorkerExecutionRepository,
  worker: ReturnType<typeof createWorker>,
  suffix: string,
) {
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
  if (!claim.lease || !claim.leaseToken) throw new Error("fixture claim failed");
  executions.start(worker.view.worker.id, worker.credential, claim.lease.id, claim.leaseToken, {
    executor,
    idempotencyKey: `${suffix}-start`,
  });
  executions.markUploading(
    worker.view.worker.id,
    worker.credential,
    claim.lease.id,
    claim.leaseToken,
    { idempotencyKey: `${suffix}-uploading` },
  );
  return claim;
}

async function ingest(
  artifacts: SqliteRawArtifactRepository,
  worker: ReturnType<typeof createWorker>,
  claim: ReturnType<typeof claimAndStart>,
  name: string,
  parentArtifactIds: string[] = [],
) {
  const content = new TextEncoder().encode(JSON.stringify({ name }));
  const descriptor: ArtifactUploadDescriptor = {
    artifactKind: "JSON",
    mimeType: "application/json",
    originalName: name,
    expectedSizeBytes: content.byteLength,
    expectedSha256: createHash("sha256").update(content).digest("hex"),
    sourceUri: `https://example.com/${name}`,
    canonicalUri: `https://example.com/${name}`,
    ...(parentArtifactIds.length > 0 ? { parentArtifactIds } : {}),
  };
  const session = artifacts.createSession({
    workerId: worker.view.worker.id,
    credential: worker.credential,
    leaseId: claim.lease!.id,
    leaseToken: claim.leaseToken!,
    idempotencyKey: name,
    descriptor,
  });
  async function* bytes() {
    yield content;
  }
  await artifacts.uploadContent(
    worker.view.worker.id,
    worker.credential,
    claim.lease!.id,
    claim.leaseToken!,
    session.record.session.id,
    bytes(),
  );
  return artifacts.finalize(
    worker.view.worker.id,
    worker.credential,
    claim.lease!.id,
    claim.leaseToken!,
    session.record.session.id,
  );
}
describe("RawArtifact immutable Job cross-Source parent grant", () => {
  it("allows exactly a granted same-workspace parent through the production repository", async () => {
    const database = openRegistryDatabase(":memory:");
    const storageRoot = join(tmpdir(), `markorbit-cross-source-${randomUUID()}`);
    temporaryPaths.push(storageRoot);
    const sources = new SqliteSourceRepository(database, clock);
    const plans = new SqliteCollectionPlanRepository(database, clock);
    const runs = new SqliteExecutionLedgerRepository(database, clock);
    const workers = new SqliteWorkerRegistryRepository(database, clock);
    const executions = new SqliteWorkerExecutionRepository(database, clock);
    const artifacts = new SqliteRawArtifactRepository(database, storageRoot, clock);

    const first = sourceAndPlan(sources, plans, "parent");
    runs.dispatchManual({ planId: first.plan.id });
    const parentWorker = createWorker(workers, "parent");
    const parentClaim = claimAndStart(workers, executions, parentWorker, "parent");
    const parent = await ingest(artifacts, parentWorker, parentClaim, "parent.json");
    const parentId = parent.artifact.artifact.id;
    executions.markVerifying(
      parentWorker.view.worker.id,
      parentWorker.credential,
      parentClaim.lease!.id,
      parentClaim.leaseToken!,
      { idempotencyKey: "parent-verifying" },
    );
    executions.complete(
      parentWorker.view.worker.id,
      parentWorker.credential,
      parentClaim.lease!.id,
      parentClaim.leaseToken!,
      {
        idempotencyKey: "parent-complete",
        receipt: {
          executor,
          outputKinds: ["JSON"],
          itemsObserved: 1,
          bytesPrepared: parent.artifact.artifact.sizeBytes,
          metadataOnly: false,
          artifactReceiptIds: [parent.receipt.id],
        },
      },
    );

    const second = sourceAndPlan(sources, plans, "child");
    runs.dispatchManual({
      planId: second.plan.id,
      extensions: { [CROSS_SOURCE_PARENT_ARTIFACT_IDS_EXTENSION]: [parentId] },
    });
    const childWorker = createWorker(workers, "child");
    const childClaim = claimAndStart(workers, executions, childWorker, "child");
    const child = await ingest(artifacts, childWorker, childClaim, "child.json", [parentId]);

    expect(child.artifact.artifact.sourceId).toBe(second.source.id);
    expect(child.artifact.artifact.provenance.parentArtifactIds).toEqual([parentId]);
    expect(parent.artifact.artifact.sourceId).not.toBe(child.artifact.artifact.sourceId);
    database.close();
  });
});
