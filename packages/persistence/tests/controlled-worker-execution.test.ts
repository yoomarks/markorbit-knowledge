import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { ExecutionReceipt } from "@markorbit/contracts";
import { RegistryConflictError, SqliteSourceRepository, openRegistryDatabase } from "../src/index";
import { SqliteCollectionPlanRepository } from "../src/collection-plan-registry";
import { SqliteExecutionLedgerRepository } from "../src/execution-ledger";
import {
  SqliteWorkerExecutionRepository,
  computeExecutionRetryDelayMs,
  ensureWorkerExecutionRegistry,
} from "../src/controlled-worker-execution";
import { SqliteWorkerRegistryRepository } from "../src/safe-worker-registry";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const executor = {
  executorId: "fixture-connector-runtime",
  version: "1.0.0",
  mode: "FIXTURE" as const,
};
const temporaryPaths: string[] = [];

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) rmSync(path, { force: true });
});

function createEnvironment(
  database = new DatabaseSync(":memory:"),
  retryPolicy = { maxAttempts: 3, backoffSeconds: 10 },
) {
  let current = new Date("2026-07-16T08:00:00Z");
  const clock = () => new Date(current);
  const sources = new SqliteSourceRepository(database, clock);
  const plans = new SqliteCollectionPlanRepository(database, clock);
  const runs = new SqliteExecutionLedgerRepository(database, clock);
  const workers = new SqliteWorkerRegistryRepository(
    database,
    clock,
    undefined,
    undefined,
    undefined,
    {
      heartbeatFreshnessMs: 30_000,
      heartbeatClockSkewMs: 30_000,
      leaseDurationMs: 5_000,
      maxLeaseLifetimeMs: 20_000,
    },
  );
  const executions = new SqliteWorkerExecutionRepository(database, clock);

  const source = sources.create({
    workspaceId,
    name: "USPTO controlled execution fixture",
    slug: `controlled-execution-${Math.random().toString(36).slice(2)}`,
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en-US"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    connectorConfig: {},
    canonicalUri: "https://www.uspto.gov/about-us/news-updates",
    entrypoints: [{ uri: "https://www.uspto.gov/about-us/news-updates" }],
    tags: ["fixture"],
  });
  const plan = plans.create({
    workspaceId,
    sourceId: source.id,
    name: "Controlled fixture execution",
    status: "ACTIVE",
    schedule: { mode: "INTERVAL", intervalSeconds: 3600 },
    priority: "NORMAL",
    policy: {
      includePatterns: [],
      excludePatterns: [],
      maxDepth: 1,
      maxItems: 20,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: true,
      rateLimitPerMinute: 10,
      timeoutSeconds: 30,
      retry: retryPolicy,
      locale: "en-US",
    },
    output: { artifactKinds: ["HTML", "MARKDOWN"] },
  });
  const record = runs.dispatchManual({ planId: plan.plan.id }).record;
  const worker = workers.create({
    workspaceId,
    displayName: "Controlled fixture Worker",
    desiredState: "ACTIVE",
    runtime: { runtimeId: "fixture-worker", version: "1.0.0" },
    supportedJobTypes: ["WEB_CRAWL"],
    connectorBindings: [
      {
        connectorId: "crawl4ai-web",
        version: "1.0.0",
        capabilities: ["COLLECT"],
      },
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

  return {
    database,
    clock,
    advance(milliseconds: number) {
      current = new Date(current.getTime() + milliseconds);
    },
    runs,
    workers,
    executions,
    record,
    worker,
    claim,
  };
}

type Environment = ReturnType<typeof createEnvironment>;

function start(env: Environment, idempotencyKey = "start-1") {
  return env.executions.start(
    env.worker.view.worker.id,
    env.worker.credential,
    env.claim.lease!.id,
    env.claim.leaseToken!,
    { executor, idempotencyKey },
  );
}

function uploading(env: Environment, idempotencyKey = "uploading-1") {
  return env.executions.markUploading(
    env.worker.view.worker.id,
    env.worker.credential,
    env.claim.lease!.id,
    env.claim.leaseToken!,
    { idempotencyKey },
  );
}

function verifying(env: Environment, idempotencyKey = "verifying-1") {
  return env.executions.markVerifying(
    env.worker.view.worker.id,
    env.worker.credential,
    env.claim.lease!.id,
    env.claim.leaseToken!,
    { idempotencyKey },
  );
}

function receipt(): ExecutionReceipt {
  return {
    executor,
    outputKinds: ["HTML", "MARKDOWN"],
    itemsObserved: 4,
    bytesPrepared: 2048,
    metadataOnly: true,
    summary: "Deterministic fixture completion evidence.",
  };
}

describe("controlled Worker execution", () => {
  it("applies migration 0006 idempotently", () => {
    const database = new DatabaseSync(":memory:");
    ensureWorkerExecutionRegistry(database);
    ensureWorkerExecutionRegistry(database);
    expect(
      database.prepare("SELECT id FROM schema_migrations WHERE id = '0006_worker_execution'").all(),
    ).toHaveLength(1);
    database.close();
  });

  it("completes the strict lifecycle and closes the active lease", () => {
    const env = createEnvironment();
    expect(start(env).attempt.status).toBe("RUNNING");
    expect(uploading(env).attempt.status).toBe("UPLOADING");
    expect(verifying(env).attempt.status).toBe("VERIFYING");
    const completed = env.executions.complete(
      env.worker.view.worker.id,
      env.worker.credential,
      env.claim.lease!.id,
      env.claim.leaseToken!,
      { idempotencyKey: "complete-1", receipt: receipt() },
    );

    expect(completed.attempt.status).toBe("COMPLETED");
    expect(env.runs.getById(env.record.run.id)?.run.status).toBe("COMPLETED");
    expect(env.runs.getById(env.record.run.id)?.jobs[0]?.status).toBe("COMPLETED");
    expect(env.workers.listLeases({ status: "RELEASED" }).total).toBe(1);
    expect(env.executions.listForRun(env.record.run.id)[0]?.events).toHaveLength(4);
    env.database.close();
  });

  it("authenticates idempotent replays even after terminal lease closure", () => {
    const env = createEnvironment();
    start(env);
    uploading(env);
    verifying(env);
    const first = env.executions.complete(
      env.worker.view.worker.id,
      env.worker.credential,
      env.claim.lease!.id,
      env.claim.leaseToken!,
      { idempotencyKey: "complete-stable", receipt: receipt() },
    );
    const replay = env.executions.complete(
      env.worker.view.worker.id,
      env.worker.credential,
      env.claim.lease!.id,
      env.claim.leaseToken!,
      { idempotencyKey: "complete-stable", receipt: receipt() },
    );
    expect(replay.replayed).toBe(true);
    expect(replay.attempt.id).toBe(first.attempt.id);
    expect(() =>
      env.executions.complete(
        env.worker.view.worker.id,
        "invalid-worker-credential",
        env.claim.lease!.id,
        env.claim.leaseToken!,
        { idempotencyKey: "complete-stable", receipt: receipt() },
      ),
    ).toThrow();
    env.database.close();
  });

  it("replays failures independently of the server occurrence timestamp", () => {
    const env = createEnvironment();
    start(env);
    const input = {
      idempotencyKey: "failure-stable",
      code: "FIXTURE_EXECUTION_FAILED",
      message: "Deterministic failure.",
      retryable: false,
    };
    const first = env.executions.fail(
      env.worker.view.worker.id,
      env.worker.credential,
      env.claim.lease!.id,
      env.claim.leaseToken!,
      input,
    );
    env.advance(1_000);
    const replay = env.executions.fail(
      env.worker.view.worker.id,
      env.worker.credential,
      env.claim.lease!.id,
      env.claim.leaseToken!,
      input,
    );
    expect(replay.replayed).toBe(true);
    expect(replay.attempt.failure?.occurredAt).toBe(first.attempt.failure?.occurredAt);
    expect(env.runs.getById(env.record.run.id)?.jobs).toHaveLength(1);
    env.database.close();
  });

  it("computes deterministic exponential retry delays with bounded jitter", () => {
    const env = createEnvironment();
    const firstJob = env.record.jobs[0]!;
    const firstDelay = computeExecutionRetryDelayMs(firstJob);
    const repeatedDelay = computeExecutionRetryDelayMs(firstJob);
    const secondDelay = computeExecutionRetryDelayMs({
      ...firstJob,
      id: `${firstJob.id}-retry-2`,
      attempt: 2,
    });
    const cappedDelay = computeExecutionRetryDelayMs({
      ...firstJob,
      id: `${firstJob.id}-retry-cap`,
      attempt: 20,
    });

    expect(firstDelay).toBe(repeatedDelay);
    expect(firstDelay).toBeGreaterThanOrEqual(10_000);
    expect(firstDelay).toBeLessThanOrEqual(12_500);
    expect(secondDelay).toBeGreaterThanOrEqual(20_000);
    expect(secondDelay).toBeLessThanOrEqual(25_000);
    expect(cappedDelay).toBe(30 * 60_000);
    env.database.close();
  });

  it("schedules retryable failures with durable exponential backoff before the next claim", () => {
    const env = createEnvironment();
    start(env);
    const failed = env.executions.fail(
      env.worker.view.worker.id,
      env.worker.credential,
      env.claim.lease!.id,
      env.claim.leaseToken!,
      {
        idempotencyKey: "retryable-failure",
        code: "UPSTREAM_TEMPORARY_FAILURE",
        message: "The upstream source is temporarily unavailable.",
        retryable: true,
      },
    );

    expect(failed.attempt.status).toBe("FAILED");
    const waiting = env.runs.getById(env.record.run.id);
    expect(waiting?.run.status).toBe("PENDING");
    expect(waiting?.jobs.map((job) => [job.attempt, job.status])).toEqual([
      [1, "RETRY"],
      [2, "PENDING"],
    ]);
    const retryAvailableAt = waiting?.jobs[1]?.availableAt;
    expect(retryAvailableAt).toBeDefined();
    const retryDelayMs =
      Date.parse(retryAvailableAt!) - Date.parse("2026-07-16T08:00:00.000Z");
    expect(retryDelayMs).toBeGreaterThanOrEqual(10_000);
    expect(retryDelayMs).toBeLessThanOrEqual(12_500);
    expect(env.workers.listLeases({ status: "RELEASED" }).items[0]?.closeReason).toBe(
      "EXECUTION_RETRY_SCHEDULED",
    );

    expect(env.workers.claim(env.worker.view.worker.id, env.worker.credential).job).toBeNull();
    env.advance(retryDelayMs - 1);
    expect(env.workers.claim(env.worker.view.worker.id, env.worker.credential).job).toBeNull();
    env.advance(1);
    const retryClaim = env.workers.claim(env.worker.view.worker.id, env.worker.credential);
    expect(retryClaim.job?.attempt).toBe(2);
    expect(retryClaim.job?.status).toBe("LEASED");

    env.database.close();
  });

  it("dead-letters retryable failures after maxAttempts instead of looping forever", () => {
    const env = createEnvironment(new DatabaseSync(":memory:"), {
      maxAttempts: 1,
      backoffSeconds: 10,
    });
    start(env);
    env.executions.fail(
      env.worker.view.worker.id,
      env.worker.credential,
      env.claim.lease!.id,
      env.claim.leaseToken!,
      {
        idempotencyKey: "retry-exhausted",
        code: "UPSTREAM_TEMPORARY_FAILURE",
        message: "The upstream source remains unavailable.",
        retryable: true,
      },
    );

    const exhausted = env.runs.getById(env.record.run.id);
    expect(exhausted?.run.status).toBe("FAILED");
    expect(exhausted?.jobs).toHaveLength(1);
    expect(exhausted?.jobs[0]?.status).toBe("DEAD_LETTER");
    expect(env.workers.listLeases({ status: "RELEASED" }).items[0]?.closeReason).toBe(
      "EXECUTION_RETRY_EXHAUSTED",
    );

    env.database.close();
  });

  it("rejects skips, reversals and conflicting key reuse", () => {
    const env = createEnvironment();
    start(env, "stable-key");
    expect(() => verifying(env)).toThrowError(RegistryConflictError);
    uploading(env);
    verifying(env);
    expect(() => uploading(env, "reverse-upload")).toThrowError(RegistryConflictError);
    expect(() =>
      env.executions.start(
        env.worker.view.worker.id,
        env.worker.credential,
        env.claim.lease!.id,
        env.claim.leaseToken!,
        {
          executor: { ...executor, version: "1.0.1" },
          idempotencyKey: "stable-key",
        },
      ),
    ).toThrowError(RegistryConflictError);
    env.database.close();
  });

  it("rejects completion evidence outside immutable Job output snapshots", () => {
    const env = createEnvironment();
    start(env);
    uploading(env);
    verifying(env);
    expect(() =>
      env.executions.complete(
        env.worker.view.worker.id,
        env.worker.credential,
        env.claim.lease!.id,
        env.claim.leaseToken!,
        {
          idempotencyKey: "bad-output",
          receipt: { ...receipt(), outputKinds: ["PDF"] },
        },
      ),
    ).toThrowError(RegistryConflictError);
    env.database.close();
  });

  it("fails started work on lease expiry instead of making it retryable", () => {
    const env = createEnvironment();
    start(env);
    env.advance(6_000);
    expect(env.executions.reconcileExpired()).toBe(1);
    const record = env.runs.getById(env.record.run.id);
    expect(record?.run.status).toBe("FAILED");
    expect(record?.jobs[0]?.status).toBe("FAILED");
    expect(env.executions.listForRun(env.record.run.id)[0]?.attempt.failure?.code).toBe(
      "LEASE_EXPIRED_DURING_EXECUTION",
    );
    expect(env.workers.listLeases({ status: "EXPIRED" }).total).toBe(1);
    expect(record?.jobs).toHaveLength(1);
    env.database.close();
  });

  it("keeps reservation-only expiry inside the lease protocol boundary", () => {
    const env = createEnvironment();
    env.advance(6_000);
    expect(env.workers.reapExpired()).toBe(1);
    expect(env.executions.listForRun(env.record.run.id)).toHaveLength(0);
    expect(env.runs.getById(env.record.run.id)?.run.status).toBe("PENDING");
    expect(env.runs.getById(env.record.run.id)?.jobs[0]?.status).toBe("PENDING");
    env.database.close();
  });

  it("persists terminal evidence across a database reopen", () => {
    const path = join(tmpdir(), `markorbit-execution-${process.pid}-${Date.now()}.sqlite`);
    temporaryPaths.push(path, `${path}-shm`, `${path}-wal`);
    const database = openRegistryDatabase(path);
    const env = createEnvironment(database);
    start(env);
    uploading(env);
    verifying(env);
    const completed = env.executions.complete(
      env.worker.view.worker.id,
      env.worker.credential,
      env.claim.lease!.id,
      env.claim.leaseToken!,
      { idempotencyKey: "complete-reopen", receipt: receipt() },
    );
    database.close();

    const reopened = openRegistryDatabase(path);
    const repository = new SqliteWorkerExecutionRepository(reopened);
    expect(repository.getById(completed.attempt.id)?.attempt.status).toBe("COMPLETED");
    expect(repository.getById(completed.attempt.id)?.events).toHaveLength(4);
    reopened.close();
  });
});
