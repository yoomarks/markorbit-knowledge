import { createHash, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONVERSION_EXECUTION_VERSION,
  CONVERSION_RUNTIME_VERSION,
  type ConversionClaimRequest,
  type ConversionFailedReport,
  type ConversionOutputReadyReport,
  type ConversionProgressReport,
  type ConversionStartedReport,
  type ConversionWorkerCapability,
  type RuntimeReportBase,
  type StagingDocumentDescriptor,
} from "@markorbit/contracts";
import { SqliteCollectionPlanRepository } from "../src/collection-plan-registry";
import { SqliteWorkerExecutionRepository } from "../src/controlled-worker-execution";
import { SqliteConverterRegistryRepository } from "../src/converter-registry";
import { SqliteConversionRunLedgerRepository } from "../src/conversion-run-ledger";
import {
  SqliteConversionRuntimePersistenceRepository,
  ensureConversionRuntimePersistence,
} from "../src/conversion-runtime-persistence";
import {
  SqliteConversionRuntimeTransitionRepository,
  ensureConversionRuntimeTransitions,
} from "../src/conversion-runtime-transitions";
import { SqliteExecutionLedgerRepository } from "../src/execution-ledger";
import { listAppliedMigrations, openRegistryDatabase, SqliteSourceRepository } from "../src/index";
import { SqliteRawArtifactRepository } from "../src/raw-artifact-registry";
import { SqliteWorkerRegistryRepository } from "../src/safe-worker-registry";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const paths: string[] = [];
afterEach(() => paths.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
async function* oneChunk(value: Uint8Array) {
  yield value;
}

async function fixture(databasePath = ":memory:") {
  let current = Date.parse("2026-07-18T00:00:00Z");
  const clock = () => new Date(current);
  const advance = (seconds: number) => {
    current += seconds * 1000;
    return clock().toISOString();
  };
  const database = openRegistryDatabase(databasePath);
  const storageRoot = join(tmpdir(), `markorbit-conversion-transitions-${randomUUID()}`);
  paths.push(storageRoot);
  const sources = new SqliteSourceRepository(database, clock);
  const plans = new SqliteCollectionPlanRepository(database, clock);
  const executionRuns = new SqliteExecutionLedgerRepository(database, clock);
  const workers = new SqliteWorkerRegistryRepository(database, clock);
  const executions = new SqliteWorkerExecutionRepository(database, clock);
  const artifacts = new SqliteRawArtifactRepository(database, storageRoot, clock);
  const converters = new SqliteConverterRegistryRepository(database, clock);
  const conversionRuns = new SqliteConversionRunLedgerRepository(database, clock);
  const runtime = new SqliteConversionRuntimePersistenceRepository(database, clock);
  const transitions = new SqliteConversionRuntimeTransitionRepository(database, clock);

  const source = sources.create({
    workspaceId,
    name: "Conversion transition fixture",
    slug: `conversion-transition-${randomUUID()}`,
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
  const bytes = new TextEncoder().encode("<html>conversion transition</html>");
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
    idempotencyKey: "runtime-transition-dispatch",
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
  const request: ConversionClaimRequest = {
    contractVersion: CONVERSION_RUNTIME_VERSION,
    objectType: "CONVERSION_CLAIM_REQUEST",
    id: "ccr_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    workspaceId,
    workerId: worker.view.worker.id,
    workerCredentialId: "worker-credential-fixture",
    capabilityRevision: 1,
    supportedConverters: capability.supportedConverters,
    maxAcceptedWork: 1,
    idempotencyKey: "claim-transition",
    requestedLeaseDurationSeconds: 120,
  };
  const claim = runtime.claim(request).result;
  return {
    database,
    databasePath,
    clock,
    advance,
    worker,
    run: dispatched.record.run,
    claim,
    transitions,
  };
}

function baseReport(
  env: Awaited<ReturnType<typeof fixture>>,
  id: string,
  idempotencyKey: string,
  expectedCurrentStatus: RuntimeReportBase["expectedCurrentStatus"],
): RuntimeReportBase {
  const lease = env.claim.lease!;
  return {
    contractVersion: CONVERSION_RUNTIME_VERSION,
    objectType: "CONVERSION_PROGRESS_REPORT",
    id,
    workspaceId,
    workerId: env.worker.view.worker.id,
    workerCredentialId: "worker-credential-fixture",
    conversionRunId: env.run.id,
    conversionAttemptId: lease.conversionAttemptId,
    conversionLeaseId: lease.id,
    leaseGeneration: lease.generation,
    leaseTokenReference: lease.tokenReference,
    leaseTokenDigest: lease.tokenDigest,
    idempotencyKey,
    occurredAt: env.clock().toISOString(),
    expectedCurrentStatus,
  };
}

function startedReport(env: Awaited<ReturnType<typeof fixture>>, key = "started") {
  return {
    ...baseReport(env, "csr_01ARZ3NDEKTSV4RRFFQ69G5FAV", key, "PENDING"),
    objectType: "CONVERSION_STARTED_REPORT",
    converter: env.run.converter,
  } as ConversionStartedReport;
}

function progressReport(env: Awaited<ReturnType<typeof fixture>>, key = "progress") {
  return {
    ...baseReport(env, "cpr_01ARZ3NDEKTSV4RRFFQ69G5FAV", key, "RUNNING"),
    objectType: "CONVERSION_PROGRESS_REPORT",
    progress: { percent: 50, message: "Half complete" },
  } as ConversionProgressReport;
}

function outputReport(env: Awaited<ReturnType<typeof fixture>>, key = "output") {
  const grant = env.claim.stagingOutputUploadGrant!;
  return {
    ...baseReport(env, "cor_01ARZ3NDEKTSV4RRFFQ69G5FAV", key, "RUNNING"),
    objectType: "CONVERSION_OUTPUT_READY_REPORT",
    output: {
      uploadGrantId: grant.id,
      targetPath: grant.normalizedTargetPath,
      sha256: sha256("# Converted"),
      sizeBytes: 11,
      mediaType: "text/markdown",
    },
  } as ConversionOutputReadyReport;
}

function failedReport(env: Awaited<ReturnType<typeof fixture>>, key = "failed") {
  return {
    ...baseReport(env, "cfr_01ARZ3NDEKTSV4RRFFQ69G5FAV", key, "RUNNING"),
    objectType: "CONVERSION_FAILED_REPORT",
    failure: { code: "CONVERTER_FAILED", message: "Fixture failure", retryable: false },
  } as ConversionFailedReport;
}

function descriptor(
  env: Awaited<ReturnType<typeof fixture>>,
  output: ConversionOutputReadyReport,
): StagingDocumentDescriptor {
  return {
    contractVersion: CONVERSION_EXECUTION_VERSION,
    objectType: "STAGING_DOCUMENT_DESCRIPTOR",
    id: "std_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    workspaceId,
    sourceId: env.run.sourceId,
    rawArtifactId: env.run.rawArtifactId,
    conversionRunId: env.run.id,
    title: "Converted fixture",
    targetPath: output.output.targetPath,
    outputFormat: "MARKDOWN",
    contentHash: { algorithm: "SHA-256", value: output.output.sha256 },
    sizeBytes: output.output.sizeBytes,
    contentAddressedRef: `cas:sha256:${output.output.sha256}`,
    frontmatterSummary: { fieldCount: 0, fields: [] },
    converter: env.run.converter,
    generatedAt: env.clock().toISOString(),
    validation: { outcome: "PASS", checks: [], warnings: [] },
    status: "READY",
  };
}

describe("Authenticated Conversion Runtime transitions", () => {
  it("applies migration 0011 idempotently", () => {
    const database = openRegistryDatabase(":memory:");
    ensureConversionRuntimePersistence(database);
    ensureConversionRuntimeTransitions(database);
    ensureConversionRuntimeTransitions(database);
    expect(listAppliedMigrations(database)).toContain("0011_conversion_runtime_transitions");
    expect(
      database
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN
           ('conversion_runtime_reports','conversion_verifier_transitions')`,
        )
        .all(),
    ).toHaveLength(2);
    database.close();
  });

  it("moves PENDING through RUNNING and VERIFYING to verifier-owned COMPLETED", async () => {
    const env = await fixture();
    const started = env.transitions.submitStarted(startedReport(env), env.worker.credential);
    expect(started.run.status).toBe("RUNNING");
    expect(started.attempt.status).toBe("STARTED");
    env.advance(10);
    const progress = env.transitions.submitProgress(progressReport(env), env.worker.credential);
    expect(progress.event.eventType).toBe("PROGRESS_REPORTED");
    env.advance(10);
    const output = outputReport(env);
    const verifying = env.transitions.submitOutputReady(output, env.worker.credential);
    expect(verifying.run.status).toBe("VERIFYING");
    expect(verifying.attempt.status).toBe("OUTPUT_REPORTED");
    expect(verifying.lease.status).toBe("RELEASED");
    env.advance(10);
    const completed = env.transitions.completeVerification({
      workspaceId,
      verifierId: "staging-verifier",
      idempotencyKey: "complete",
      stagingDocument: descriptor(env, output),
    });
    expect(completed.run.status).toBe("COMPLETED");
    expect(completed.run.stagingDocument?.status).toBe("READY");
    expect(
      env.database
        .prepare(
          "SELECT event_type FROM conversion_execution_events WHERE run_id = ? ORDER BY sequence",
        )
        .all(env.run.id),
    ).toEqual([
      { event_type: "CREATED" },
      { event_type: "STARTED" },
      { event_type: "PROGRESS_REPORTED" },
      { event_type: "VERIFICATION_STARTED" },
      { event_type: "COMPLETED" },
    ]);
    env.database.close();
  });

  it("replays identical Worker reports and conflicts on changed payload", async () => {
    const env = await fixture();
    const report = startedReport(env);
    const first = env.transitions.submitStarted(report, env.worker.credential);
    const replay = env.transitions.submitStarted(report, env.worker.credential);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.event.id).toBe(first.event.id);
    const changed = { ...report, occurredAt: env.advance(1) };
    expect(() => env.transitions.submitStarted(changed, env.worker.credential)).toThrowError(
      /different report/i,
    );
    expect(
      env.database.prepare("SELECT COUNT(*) AS total FROM conversion_runtime_reports").get(),
    ).toEqual({ total: 1 });
    env.database.close();
  });

  it("rejects wrong Worker credential, token evidence, generation and stale status", async () => {
    const env = await fixture();
    expect(() =>
      env.transitions.submitStarted(startedReport(env), "wrong-credential"),
    ).toThrowError();
    const wrongToken = { ...startedReport(env), leaseTokenDigest: "f".repeat(64) };
    expect(() => env.transitions.submitStarted(wrongToken, env.worker.credential)).toThrowError(
      /not match/i,
    );
    const wrongGeneration = { ...startedReport(env), leaseGeneration: 2 };
    expect(() =>
      env.transitions.submitStarted(wrongGeneration, env.worker.credential),
    ).toThrowError(/not match/i);
    env.transitions.submitStarted(startedReport(env), env.worker.credential);
    env.advance(1);
    const stale = { ...progressReport(env), expectedCurrentStatus: "PENDING" as const };
    expect(() => env.transitions.submitProgress(stale, env.worker.credential)).toThrowError();
    env.database.close();
  });

  it("binds output evidence to the persisted upload grant", async () => {
    const env = await fixture();
    env.transitions.submitStarted(startedReport(env), env.worker.credential);
    env.advance(10);
    const wrongPath = outputReport(env);
    wrongPath.output.targetPath = "00_Inbox/other.md";
    expect(() => env.transitions.submitOutputReady(wrongPath, env.worker.credential)).toThrowError(
      /upload grant/i,
    );
    expect(
      env.database.prepare("SELECT status FROM conversion_runs WHERE id = ?").get(env.run.id),
    ).toEqual({ status: "RUNNING" });
    env.database.close();
  });

  it("persists a structured Worker failure and closes the lease", async () => {
    const env = await fixture();
    env.transitions.submitStarted(startedReport(env), env.worker.credential);
    env.advance(10);
    const failed = env.transitions.submitFailed(failedReport(env), env.worker.credential);
    expect(failed.run.status).toBe("FAILED");
    expect(failed.run.failure?.kind).toBe("WORKER_ERROR");
    expect(failed.attempt.status).toBe("FAILED");
    expect(failed.lease.status).toBe("RELEASED");
    env.database.close();
  });

  it("allows verifier failure but rejects non-READY or mismatched completion evidence", async () => {
    const env = await fixture();
    env.transitions.submitStarted(startedReport(env), env.worker.credential);
    env.advance(10);
    const output = outputReport(env);
    env.transitions.submitOutputReady(output, env.worker.credential);
    env.advance(10);
    const invalid = { ...descriptor(env, output), status: "GENERATED" as const };
    expect(() =>
      env.transitions.completeVerification({
        workspaceId,
        verifierId: "staging-verifier",
        idempotencyKey: "invalid-completion",
        stagingDocument: invalid,
      }),
    ).toThrowError(/READY/);
    const failed = env.transitions.failVerification({
      workspaceId,
      verifierId: "staging-verifier",
      idempotencyKey: "verification-failed",
      conversionRunId: env.run.id,
      code: "FRONTMATTER_INVALID",
      message: "Required provenance field is missing",
    });
    expect(failed.run.status).toBe("FAILED");
    expect(failed.run.failure?.kind).toBe("VERIFICATION_FAILED");
    env.database.close();
  });

  it("fails a started run when its lease expires instead of returning it to PENDING", async () => {
    const env = await fixture();
    const started = env.transitions.submitStarted(startedReport(env), env.worker.credential);
    env.advance(121);
    const reconciled = env.transitions.reconcileExpiredStartedLease(started.lease.id, {
      workspaceId,
      reconcilerId: "lease-reconciler",
      idempotencyKey: "lease-expired",
    });
    expect(reconciled.run.status).toBe("FAILED");
    expect(reconciled.run.failure?.code).toBe("LEASE_EXPIRED_DURING_CONVERSION");
    expect(reconciled.attempt.status).toBe("LEASE_LOST");
    expect(reconciled.lease.status).toBe("EXPIRED");
    env.database.close();
  });

  it("survives disk restart and accepts the next authenticated report", async () => {
    const databasePath = join(tmpdir(), `markorbit-transition-${randomUUID()}.sqlite`);
    paths.push(databasePath, `${databasePath}-wal`, `${databasePath}-shm`);
    const env = await fixture(databasePath);
    env.transitions.submitStarted(startedReport(env), env.worker.credential);
    env.advance(10);
    env.database.close();
    const reopened = openRegistryDatabase(databasePath);
    const transitions = new SqliteConversionRuntimeTransitionRepository(reopened, env.clock);
    const progress = transitions.submitProgress(
      progressReport(env, "restart-progress"),
      env.worker.credential,
    );
    expect(progress.run.status).toBe("RUNNING");
    expect(progress.event.sequence).toBe(3);
    reopened.close();
  });

  it("serializes identical and conflicting report submissions across SQLite connections", async () => {
    const databasePath = join(tmpdir(), `markorbit-transition-concurrent-${randomUUID()}.sqlite`);
    paths.push(databasePath, `${databasePath}-wal`, `${databasePath}-shm`);
    const env = await fixture(databasePath);
    const secondDatabase = openRegistryDatabase(databasePath);
    const second = new SqliteConversionRuntimeTransitionRepository(secondDatabase, env.clock);
    const report = startedReport(env, "concurrent-start");
    const identical = await Promise.allSettled([
      Promise.resolve().then(() => env.transitions.submitStarted(report, env.worker.credential)),
      Promise.resolve().then(() => second.submitStarted(report, env.worker.credential)),
    ]);
    expect(identical.every((result) => result.status === "fulfilled")).toBe(true);
    expect(
      identical
        .filter(
          (
            result,
          ): result is PromiseFulfilledResult<ReturnType<typeof env.transitions.submitStarted>> =>
            result.status === "fulfilled",
        )
        .map((result) => result.value.replayed)
        .sort(),
    ).toEqual([false, true]);
    expect(
      env.database.prepare("SELECT COUNT(*) AS total FROM conversion_runtime_reports").get(),
    ).toEqual({ total: 1 });
    const conflict = { ...report, occurredAt: env.advance(1) };
    expect(() => second.submitStarted(conflict, env.worker.credential)).toThrowError(
      /different report/i,
    );
    secondDatabase.close();
    env.database.close();
  });
});
