import { createHash, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ArtifactKind, ArtifactUploadDescriptor } from "@markorbit/contracts";
import { SqliteCollectionPlanRepository } from "../src/collection-plan-registry";
import { SqliteWorkerExecutionRepository } from "../src/controlled-worker-execution";
import { SqliteExecutionLedgerRepository } from "../src/execution-ledger";
import { openRegistryDatabase, SqliteSourceRepository } from "../src/index";
import { inspectRawArtifactLineage } from "../src/raw-artifact-lineage";
import { SqliteRawArtifactRepository } from "../src/raw-artifact-registry";
import { SqliteWorkerRegistryRepository } from "../src/safe-worker-registry";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const temporaryPaths: string[] = [];

const executor = {
  executorId: "lineage-fixture-runtime",
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

function environment() {
  const database = openRegistryDatabase(":memory:");
  const storageRoot = join(tmpdir(), `markorbit-lineage-${randomUUID()}`);
  temporaryPaths.push(storageRoot);
  const clock = () => new Date("2026-08-20T02:30:00.000Z");
  const sources = new SqliteSourceRepository(database, clock);
  const plans = new SqliteCollectionPlanRepository(database, clock);
  const runs = new SqliteExecutionLedgerRepository(database, clock);
  const workers = new SqliteWorkerRegistryRepository(database, clock);
  const executions = new SqliteWorkerExecutionRepository(database, clock);
  const artifacts = new SqliteRawArtifactRepository(database, storageRoot, clock);

  const source = sources.create({
    workspaceId,
    name: "Attachment lineage fixture",
    slug: `attachment-lineage-${randomUUID()}`,
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["EU"],
    languages: ["en"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    connectorConfig: {},
    canonicalUri: "https://example.com/rules",
    entrypoints: [{ uri: "https://example.com/rules" }],
  });
  const plan = plans.create({
    workspaceId,
    sourceId: source.id,
    name: "Attachment lineage fixture plan",
    status: "ACTIVE",
    schedule: { mode: "MANUAL" },
    priority: "NORMAL",
    policy: {
      includePatterns: [],
      excludePatterns: [],
      maxDepth: 1,
      maxItems: 10,
      renderJavascript: false,
      fetchAttachments: true,
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
    displayName: "Attachment lineage fixture worker",
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
  executions.start(worker.view.worker.id, worker.credential, claim.lease!.id, claim.leaseToken!, {
    executor,
    idempotencyKey: "lineage-start",
  });
  executions.markUploading(
    worker.view.worker.id,
    worker.credential,
    claim.lease!.id,
    claim.leaseToken!,
    { idempotencyKey: "lineage-uploading" },
  );

  return { database, worker, claim, artifacts };
}

async function ingest(
  env: ReturnType<typeof environment>,
  input: {
    key: string;
    artifactKind: ArtifactKind;
    mimeType: string;
    canonicalUri: string;
    content: string;
    parentArtifactIds?: string[];
  },
) {
  const bytes = new TextEncoder().encode(input.content);
  const descriptor: ArtifactUploadDescriptor = {
    artifactKind: input.artifactKind,
    mimeType: input.mimeType,
    originalName: input.key,
    expectedSizeBytes: bytes.byteLength,
    expectedSha256: sha256(bytes),
    sourceUri: input.canonicalUri,
    canonicalUri: input.canonicalUri,
    ...(input.parentArtifactIds ? { parentArtifactIds: input.parentArtifactIds } : {}),
  };
  const created = env.artifacts.createSession({
    workerId: env.worker.view.worker.id,
    credential: env.worker.credential,
    leaseId: env.claim.lease!.id,
    leaseToken: env.claim.leaseToken!,
    idempotencyKey: input.key,
    descriptor,
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

describe("raw artifact lineage inspection", () => {
  it("persists and resolves immutable parent-child provenance in both directions", async () => {
    const env = environment();
    const parent = await ingest(env, {
      key: "rules-page.html",
      artifactKind: "HTML",
      mimeType: "text/html",
      canonicalUri: "https://example.com/rules",
      content: "<html><a href='/linked-resource'>Linked resource</a></html>",
    });
    const parentId = parent.artifact.artifact.id;
    const child = await ingest(env, {
      key: "linked-resource.html",
      artifactKind: "HTML",
      mimeType: "text/html",
      canonicalUri: "https://example.com/linked-resource",
      content: "<html>linked child fixture</html>",
      parentArtifactIds: [parentId],
    });
    const childId = child.artifact.artifact.id;

    expect(child.artifact.artifact.provenance.parentArtifactIds).toEqual([parentId]);

    const fromParent = inspectRawArtifactLineage(env.database, {
      workspaceId,
      artifactId: parentId,
    });
    expect(fromParent.parents).toEqual([]);
    expect(fromParent.children.map((artifact) => artifact.id)).toEqual([childId]);
    expect(fromParent.integrity).toEqual({
      declaredParentCount: 0,
      resolvedParentCount: 0,
      childCount: 1,
      complete: true,
    });

    const fromChild = inspectRawArtifactLineage(env.database, { workspaceId, artifactId: childId });
    expect(fromChild.parents.map((artifact) => artifact.id)).toEqual([parentId]);
    expect(fromChild.children).toEqual([]);
    expect(fromChild.integrity).toEqual({
      declaredParentCount: 1,
      resolvedParentCount: 1,
      childCount: 0,
      complete: true,
    });
    env.database.close();
  });

  it("fails closed when immutable parent provenance references a missing artifact", async () => {
    const env = environment();
    const child = await ingest(env, {
      key: "orphan.html",
      artifactKind: "HTML",
      mimeType: "text/html",
      canonicalUri: "https://example.com/orphan",
      content: "<html>orphan fixture</html>",
      parentArtifactIds: ["art_01ARZ3NDEKTSV4RRFFQ69G5FAV"],
    });

    expect(() =>
      inspectRawArtifactLineage(env.database, {
        workspaceId,
        artifactId: child.artifact.artifact.id,
      }),
    ).toThrow("references missing parent");
    env.database.close();
  });
});
