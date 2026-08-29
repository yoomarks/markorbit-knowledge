import { createHash, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONVERSION_RUNTIME_VERSION,
  isConversionAttempt,
  isConversionClaimResult,
  isConversionLease,
  type ConversionClaimRequest,
  type ConversionWorkerCapability,
} from "@markorbit/contracts";
import { SqliteSourceRepository, listAppliedMigrations, openRegistryDatabase } from "../src/index";
import { SqliteCollectionPlanRepository } from "../src/collection-plan-registry";
import { SqliteConverterRegistryRepository } from "../src/converter-registry";
import { SqliteExecutionLedgerRepository } from "../src/execution-ledger";
import { SqliteRawArtifactRepository } from "../src/raw-artifact-registry";
import { SqliteWorkerExecutionRepository } from "../src/controlled-worker-execution";
import { SqliteWorkerRegistryRepository } from "../src/safe-worker-registry";
import { SqliteConversionRunLedgerRepository } from "../src/conversion-run-ledger";
import {
  SqliteConversionRuntimePersistenceRepository,
  ensureConversionRuntimePersistence,
} from "../src/conversion-runtime-persistence";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const paths: string[] = [];
afterEach(() => paths.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
const sha256 = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
async function* oneChunk(value: Uint8Array) {
  yield value;
}

async function fixture(path = ":memory:") {
  const database = openRegistryDatabase(path);
  const storageRoot = join(tmpdir(), `markorbit-conversion-runtime-${randomUUID()}`);
  paths.push(storageRoot);
  const clock = () => new Date("2026-07-18T00:00:00Z");
  const sources = new SqliteSourceRepository(database, clock);
  const plans = new SqliteCollectionPlanRepository(database, clock);
  const executionRuns = new SqliteExecutionLedgerRepository(database, clock);
  const workers = new SqliteWorkerRegistryRepository(database, clock);
  const executions = new SqliteWorkerExecutionRepository(database, clock);
  const artifacts = new SqliteRawArtifactRepository(database, storageRoot, clock);
  const converters = new SqliteConverterRegistryRepository(database, clock);
  const conversionRuns = new SqliteConversionRunLedgerRepository(database, clock);
  const runtime = new SqliteConversionRuntimePersistenceRepository(database, clock);

  const source = sources.create({
    workspaceId,
    name: "Conversion runtime fixture",
    slug: `conversion-runtime-${randomUUID()}`,
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en-US"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    connectorConfig: {},
    canonicalUri: "https://example.com",
    entrypoints: [{ uri: "https://example.com" }],
  });
  const plan = plans.create({
    workspaceId,
    sourceId: source.id,
    name: "Plan",
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
    displayName: "Conversion Worker",
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
      idempotencyKey: "start",
    },
  );
  executions.markUploading(
    worker.view.worker.id,
    worker.credential,
    collectionClaim.lease!.id,
    collectionClaim.leaseToken!,
    { idempotencyKey: "uploading" },
  );
  const bytes = new TextEncoder().encode("<html>conversion runtime</html>");
  const session = artifacts.createSession({
    workerId: worker.view.worker.id,
    credential: worker.credential,
    leaseId: collectionClaim.lease!.id,
    leaseToken: collectionClaim.leaseToken!,
    idempotencyKey: "artifact",
    descriptor: {
      artifactKind: "HTML",
      mimeType: "text/html",
      originalName: "page.html",
      expectedSizeBytes: bytes.length,
      expectedSha256: sha256(bytes),
      sourceUri: "https://example.com/page",
      canonicalUri: "https://example.com/page",
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
  database
    .prepare("UPDATE raw_artifacts SET status = ?, document_json = ? WHERE id = ?")
    .run(artifact.status, JSON.stringify(artifact), artifact.id);
  const profile = converters.createProfile({
    workspaceId,
    sourceId: source.id,
    name: "HTML profile",
    converter: { converterId: "builtin-html-markdown", version: "1.0.0" },
    input: { artifactKinds: ["HTML"], mimePatterns: ["text/html"] },
    outputFormat: "MARKDOWN",
    targetPathTemplate: "00_Inbox/{artifactId}.md",
    configuration: { preserveLinks: true },
    precedence: 1,
    autoConvert: false,
  });
  const activeProfile = converters.updateProfileStatus(profile.id, "ACTIVE", profile.updatedAt);
  const dispatched = conversionRuns.dispatchManual({
    workspaceId,
    rawArtifactId: artifact.id,
    conversionProfileId: activeProfile.id,
    requestedOutput: {
      format: "MARKDOWN",
      targetPathTemplate: activeProfile.targetPathTemplate,
    },
    trigger: "MANUAL",
    actor: { type: "ADMIN", id: "tester" },
    idempotencyKey: "runtime-dispatch",
  });
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
    runtime: { runtimeId: "builtin-conversion-fixture", version: "1.0.0" },
    createdAt: clock().toISOString(),
  };
  runtime.registerCapability(capability);
  return { database, runtime, worker, capability, run: dispatched.record.run, clock };
}

function claimRequest(
  env: Awaited<ReturnType<typeof fixture>>,
  idempotencyKey = "claim-1",
): ConversionClaimRequest {
  return {
    contractVersion: CONVERSION_RUNTIME_VERSION,
    objectType: "CONVERSION_CLAIM_REQUEST",
    id: "ccr_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    workspaceId,
    workerId: env.worker.view.worker.id,
    workerCredentialId: "worker-credential-fixture",
    capabilityRevision: env.capability.capabilityRevision,
    supportedConverters: env.capability.supportedConverters,
    maxAcceptedWork: 1,
    idempotencyKey,
    requestedLeaseDurationSeconds: 120,
  };
}

describe("Conversion Runtime persistence", () => {
  it("applies migration 0010 idempotently", () => {
    const database = openRegistryDatabase(":memory:");
    ensureConversionRuntimePersistence(database);
    ensureConversionRuntimePersistence(database);
    expect(listAppliedMigrations(database)).toContain("0010_conversion_runtime_lease_attempt");
    const tables = database
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (
          'conversion_worker_capabilities','conversion_attempts','conversion_leases',
          'conversion_read_grants','conversion_upload_grants','conversion_claim_idempotency'
        )`,
      )
      .all();
    expect(tables).toHaveLength(6);
    database.close();
  });

  it("registers exact conversion capability without a second Worker Registry", async () => {
    const env = await fixture();
    const record = env.runtime.getCapability(env.capability.id);
    expect(record?.active).toBe(true);
    expect(record?.capability).toEqual(env.capability);
    expect(env.database.prepare("SELECT COUNT(*) AS total FROM worker_definitions").get()).toEqual({
      total: 1,
    });
    expect(() => env.runtime.registerCapability(env.capability)).toThrowError();
    env.database.close();
  });

  it("claims one PENDING ConversionRun atomically with one ACTIVE lease and CLAIMED attempt", async () => {
    const env = await fixture();
    const claimed = env.runtime.claim(claimRequest(env));
    expect(claimed.replayed).toBe(false);
    expect(claimed.result.result).toBe("CLAIMED");
    expect(isConversionClaimResult(claimed.result)).toBe(true);
    expect(isConversionLease(claimed.result.lease)).toBe(true);
    expect(claimed.result.lease?.status).toBe("ACTIVE");
    expect(claimed.result.stagingOutputUploadGrant?.normalizedTargetPath).toBe(
      `00_Inbox/${env.run.rawArtifactId}.md`,
    );
    const attempt = env.runtime.getAttempt(claimed.result.lease!.conversionAttemptId);
    expect(isConversionAttempt(attempt)).toBe(true);
    expect(attempt?.status).toBe("CLAIMED");
    expect(env.runtime.listLeases({ conversionRunId: env.run.id }).items).toHaveLength(1);
    expect(env.runtime.listAttempts(env.run.id)).toHaveLength(1);
    expect(
      env.database.prepare("SELECT status FROM conversion_runs WHERE id = ?").get(env.run.id),
    ).toEqual({
      status: "PENDING",
    });
    env.database.close();
  });

  it("replays identical claims and conflicts on changed immutable request", async () => {
    const env = await fixture();
    const first = env.runtime.claim(claimRequest(env));
    const replay = env.runtime.claim(claimRequest(env));
    expect(replay.replayed).toBe(true);
    expect(replay.result).toEqual(first.result);
    const conflict = { ...claimRequest(env), requestedLeaseDurationSeconds: 121 };
    expect(() => env.runtime.claim(conflict)).toThrowError(/different request/i);
    expect(env.runtime.listLeases({ conversionRunId: env.run.id }).items).toHaveLength(1);
    env.database.close();
  });

  it("returns stable NO_COMPATIBLE_WORK after the only run is claimed", async () => {
    const env = await fixture();
    env.runtime.claim(claimRequest(env, "claim-first"));
    const noWork = env.runtime.claim(claimRequest(env, "claim-second"));
    expect(noWork.result.result).toBe("NO_COMPATIBLE_WORK");
    expect(isConversionClaimResult(noWork.result)).toBe(true);
    expect(env.runtime.claim(claimRequest(env, "claim-second")).replayed).toBe(true);
    env.database.close();
  });

  it("renews an ACTIVE lease with a new generation and token evidence", async () => {
    const env = await fixture();
    const lease = env.runtime.claim(claimRequest(env)).result.lease!;
    const renewed = env.runtime.renewLease(lease.id, {
      workspaceId,
      workerId: env.worker.view.worker.id,
      requestedDurationSeconds: 180,
      idempotencyKey: "renew-1",
    });
    expect(renewed.generation).toBe(2);
    expect(renewed.tokenReference).not.toBe(lease.tokenReference);
    expect(renewed.tokenDigest).not.toBe(lease.tokenDigest);
    expect(isConversionLease(renewed)).toBe(true);
    env.database.close();
  });

  it("releases a pre-start lease and preserves reconciliation evidence", async () => {
    const env = await fixture();
    const lease = env.runtime.claim(claimRequest(env)).result.lease!;
    const released = env.runtime.releaseBeforeStart(lease.id, {
      workspaceId,
      workerId: env.worker.view.worker.id,
      reconciliationCode: "WORKER_RELEASED_BEFORE_START",
      evidence: { "x-reason": "shutdown" },
    });
    expect(released.status).toBe("RELEASED");
    const attempt = env.runtime.getAttempt(lease.conversionAttemptId);
    expect(attempt?.status).toBe("ABANDONED");
    expect(attempt?.reconciliation?.code).toBe("WORKER_RELEASED_BEFORE_START");
    expect(
      env.database.prepare("SELECT status FROM conversion_runs WHERE id = ?").get(env.run.id),
    ).toEqual({
      status: "PENDING",
    });
    env.database.close();
  });

  it("persists lease and attempt across database restart", async () => {
    const path = join(tmpdir(), `markorbit-runtime-${randomUUID()}.sqlite`);
    paths.push(path, `${path}-wal`, `${path}-shm`);
    const env = await fixture(path);
    const lease = env.runtime.claim(claimRequest(env)).result.lease!;
    env.database.close();
    const reopened = openRegistryDatabase(path);
    const runtime = new SqliteConversionRuntimePersistenceRepository(reopened);
    expect(runtime.getLease(lease.id)).toEqual(lease);
    expect(runtime.getAttempt(lease.conversionAttemptId)?.status).toBe("CLAIMED");
    reopened.close();
  });

  it("enforces one ACTIVE conversion lease per run", async () => {
    const env = await fixture();
    const first = env.runtime.claim(claimRequest(env, "claim-first"));
    const second = env.runtime.claim(claimRequest(env, "claim-second"));
    expect(first.result.result).toBe("CLAIMED");
    expect(second.result.result).toBe("NO_COMPATIBLE_WORK");
    expect(
      env.database
        .prepare(
          "SELECT COUNT(*) AS total FROM conversion_leases WHERE conversion_run_id = ? AND status = 'ACTIVE'",
        )
        .get(env.run.id),
    ).toEqual({ total: 1 });
    env.database.close();
  });
});
