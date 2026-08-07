import { createHash, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { isConversionExecutionEvent, isConversionRun } from "@markorbit/contracts";
import { SqliteSourceRepository, listAppliedMigrations, openRegistryDatabase } from "../src/index";
import { SqliteCollectionPlanRepository } from "../src/collection-plan-registry";
import { SqliteConverterRegistryRepository } from "../src/converter-registry";
import { SqliteExecutionLedgerRepository } from "../src/execution-ledger";
import { SqliteRawArtifactRepository } from "../src/raw-artifact-registry";
import { SqliteWorkerExecutionRepository } from "../src/controlled-worker-execution";
import { SqliteWorkerRegistryRepository } from "../src/safe-worker-registry";
import {
  SqliteConversionRunLedgerRepository,
  ensureConversionRunLedger,
} from "../src/conversion-run-ledger";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const paths: string[] = [];
afterEach(() => paths.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
const sha256 = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
async function* oneChunk(value: Uint8Array) {
  yield value;
}

async function fixture(path = ":memory:") {
  const database = openRegistryDatabase(path);
  const storageRoot = join(tmpdir(), `markorbit-conversion-ledger-${randomUUID()}`);
  paths.push(storageRoot);
  const clock = () => new Date("2026-07-17T00:00:00Z");
  const sources = new SqliteSourceRepository(database, clock);
  const plans = new SqliteCollectionPlanRepository(database, clock);
  const runs = new SqliteExecutionLedgerRepository(database, clock);
  const workers = new SqliteWorkerRegistryRepository(database, clock);
  const executions = new SqliteWorkerExecutionRepository(database, clock);
  const artifacts = new SqliteRawArtifactRepository(database, storageRoot, clock);
  const converters = new SqliteConverterRegistryRepository(database, clock);
  const ledger = new SqliteConversionRunLedgerRepository(database, clock);
  const source = sources.create({
    workspaceId,
    name: "Conversion fixture",
    slug: `conversion-${randomUUID()}`,
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
  runs.dispatchManual({ planId: plan.plan.id });
  const worker = workers.create({
    workspaceId,
    displayName: "Worker",
    desiredState: "ACTIVE",
    runtime: { runtimeId: "fixture-worker", version: "1.0.0" },
    supportedJobTypes: ["WEB_CRAWL"],
    connectorBindings: [
      { connectorId: "crawl4ai-web", version: "1.0.0", capabilities: ["COLLECT"] },
    ],
    maxConcurrency: 1,
    labels: [],
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
    executor: { executorId: "fixture", version: "1.0.0", mode: "FIXTURE" },
    idempotencyKey: "start",
  });
  executions.markUploading(
    worker.view.worker.id,
    worker.credential,
    claim.lease!.id,
    claim.leaseToken!,
    { idempotencyKey: "uploading" },
  );
  const bytes = new TextEncoder().encode("<html>conversion</html>");
  const session = artifacts.createSession({
    workerId: worker.view.worker.id,
    credential: worker.credential,
    leaseId: claim.lease!.id,
    leaseToken: claim.leaseToken!,
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
    claim.lease!.id,
    claim.leaseToken!,
    session.record.session.id,
    oneChunk(bytes),
  );
  const finalized = (
    await artifacts.finalize(
      worker.view.worker.id,
      worker.credential,
      claim.lease!.id,
      claim.leaseToken!,
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
  return { database, ledger, converters, artifact, profile: activeProfile };
}
function dispatch(env: Awaited<ReturnType<typeof fixture>>, key = "dispatch") {
  return env.ledger.dispatchManual({
    workspaceId,
    rawArtifactId: env.artifact.id,
    conversionProfileId: env.profile.id,
    requestedOutput: { format: "MARKDOWN", targetPathTemplate: env.profile.targetPathTemplate },
    trigger: "MANUAL",
    actor: { type: "ADMIN", id: "tester" },
    idempotencyKey: key,
  });
}

function manualDispatchInput(
  env: Pick<Awaited<ReturnType<typeof fixture>>, "artifact" | "profile">,
  idempotencyKey: string,
  trigger: "MANUAL" | "AUTO_PROFILE" = "MANUAL",
) {
  return {
    workspaceId,
    rawArtifactId: env.artifact.id,
    conversionProfileId: env.profile.id,
    requestedOutput: {
      format: "MARKDOWN" as const,
      targetPathTemplate: env.profile.targetPathTemplate,
    },
    trigger,
    actor: { type: "ADMIN" as const, id: "tester" },
    idempotencyKey,
  };
}

describe("ConversionRun ledger hardening", () => {
  it("applies migration 0009 idempotently without deferred runtime tables", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(
      "PRAGMA foreign_keys = ON; CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;",
    );
    ensureConversionRunLedger(database);
    ensureConversionRunLedger(database);
    expect(listAppliedMigrations(database)).toContain("0009_conversion_run_ledger");
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('conversion_runs','conversion_execution_events')",
        )
        .all(),
    ).toHaveLength(2);
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND lower(name) LIKE '%staging%' OR lower(name) LIKE '%retry%' OR lower(name) LIKE '%dead%' OR lower(name) LIKE '%scheduler%' OR lower(name) LIKE '%vault%'",
        )
        .all(),
    ).toHaveLength(0);
    database.close();
  });
  it("dispatches a validated PENDING run and CREATED event atomically", async () => {
    const env = await fixture();
    const result = dispatch(env);
    expect(result.replayed).toBe(false);
    expect(isConversionRun(result.record.run)).toBe(true);
    expect(isConversionExecutionEvent(result.record.events[0])).toBe(true);
    expect(result.record.events[0].sequence).toBe(1);
    expect(env.ledger.list({ workspaceId }).total).toBe(1);
    env.database.close();
  });
  it("rolls back run insert when event insert fails", async () => {
    const env = await fixture();
    const existing = dispatch(env, "seed");
    const before = env.ledger.list({ workspaceId }).total;
    const bad = new SqliteConversionRunLedgerRepository(
      env.database,
      () => new Date("2026-07-17T00:00:00Z"),
      undefined,
      () => existing.record.events[0].id,
    );
    expect(() =>
      bad.dispatchManual({
        workspaceId,
        rawArtifactId: env.artifact.id,
        conversionProfileId: env.profile.id,
        requestedOutput: { format: "MARKDOWN", targetPathTemplate: env.profile.targetPathTemplate },
        idempotencyKey: "rollback",
      }),
    ).toThrow();
    expect(env.ledger.list({ workspaceId }).total).toBe(before);
    expect(
      env.database
        .prepare("SELECT COUNT(*) AS count FROM conversion_execution_events WHERE id = ?")
        .get(existing.record.events[0].id),
    ).toEqual({ count: 1 });
    env.database.close();
  });
  it("replays identical idempotency and rejects conflicting immutable intent", async () => {
    const env = await fixture();
    const first = dispatch(env, "same");
    const replay = dispatch(env, "same");
    expect(replay.replayed).toBe(true);
    expect(replay.record.run.id).toBe(first.record.run.id);
    expect(() =>
      env.ledger.dispatchManual({
        workspaceId,
        rawArtifactId: env.artifact.id,
        conversionProfileId: env.profile.id,
        requestedOutput: { format: "MARKDOWN", targetPathTemplate: env.profile.targetPathTemplate },
        trigger: "AUTO_PROFILE",
        idempotencyKey: "same",
      }),
    ).toThrow(/different conversion intent/);
    expect(env.ledger.listEvents(first.record.run.id)).toHaveLength(1);
    env.database.close();
  });
  it("persists across restart and replays without duplicating CREATED event", async () => {
    const dbPath = join(tmpdir(), `markorbit-ledger-${randomUUID()}.sqlite`);
    paths.push(dbPath, `${dbPath}-wal`, `${dbPath}-shm`);
    const env = await fixture(dbPath);
    const first = dispatch(env, "restart");
    const json = JSON.stringify(first.record.run);
    const artifactId = env.artifact.id;
    const profileId = env.profile.id;
    const targetPathTemplate = env.profile.targetPathTemplate;
    env.database.close();
    const database = openRegistryDatabase(dbPath);
    const ledger = new SqliteConversionRunLedgerRepository(database);
    const replay = ledger.dispatchManual({
      workspaceId,
      rawArtifactId: artifactId,
      conversionProfileId: profileId,
      requestedOutput: { format: "MARKDOWN", targetPathTemplate },
      idempotencyKey: "restart",
    });
    expect(replay.replayed).toBe(true);
    expect(JSON.stringify(replay.record.run)).toBe(json);
    expect(replay.record.events).toHaveLength(1);
    database.close();
  });
  it("concurrently replays identical dispatches across independent SQLite connections", async () => {
    const dbPath = join(tmpdir(), `markorbit-dispatch-identical-${randomUUID()}.sqlite`);
    paths.push(dbPath, `${dbPath}-wal`, `${dbPath}-shm`);
    const env = await fixture(dbPath);
    const input = manualDispatchInput(env, "concurrent-identical");
    env.database.close();

    const dbA = openRegistryDatabase(dbPath);
    const dbB = openRegistryDatabase(dbPath);
    const repoA = new SqliteConversionRunLedgerRepository(dbA);
    const repoB = new SqliteConversionRunLedgerRepository(dbB);
    try {
      const results = await Promise.allSettled([
        Promise.resolve().then(() => repoA.dispatchManual(input)),
        Promise.resolve().then(() => repoB.dispatchManual(input)),
      ]);
      const rejected = results.filter((result) => result.status === "rejected");
      expect(rejected).toHaveLength(0);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      expect(fulfilled).toHaveLength(2);
      const runIds = new Set(fulfilled.map((result) => result.value.record.run.id));
      expect(runIds.size).toBe(1);
      expect(fulfilled.filter((result) => result.value.replayed)).toHaveLength(1);

      const verifier = openRegistryDatabase(dbPath);
      try {
        const runRows = verifier
          .prepare("SELECT id FROM conversion_runs WHERE workspace_id = ? AND idempotency_key = ?")
          .all(workspaceId, input.idempotencyKey) as Array<{ id: string }>;
        expect(runRows).toHaveLength(1);
        expect(runRows[0]!.id).toBe([...runIds][0]);
        const eventRows = verifier
          .prepare(
            "SELECT event_type, sequence FROM conversion_execution_events WHERE run_id = ? ORDER BY sequence ASC",
          )
          .all(runRows[0]!.id) as Array<{ event_type: string; sequence: number }>;
        expect(eventRows).toEqual([{ event_type: "CREATED", sequence: 1 }]);
        const orphanRows = verifier
          .prepare(
            "SELECT e.id FROM conversion_execution_events e LEFT JOIN conversion_runs r ON r.id = e.run_id WHERE r.id IS NULL",
          )
          .all();
        expect(orphanRows).toHaveLength(0);
      } finally {
        verifier.close();
      }
    } finally {
      dbA.close();
      dbB.close();
    }
  });

  it("concurrently rejects conflicting dispatch intent reuse across independent SQLite connections", async () => {
    const dbPath = join(tmpdir(), `markorbit-dispatch-conflict-${randomUUID()}.sqlite`);
    paths.push(dbPath, `${dbPath}-wal`, `${dbPath}-shm`);
    const env = await fixture(dbPath);
    const manualIntent = manualDispatchInput(env, "concurrent-conflict", "MANUAL");
    const autoIntent = manualDispatchInput(env, "concurrent-conflict", "AUTO_PROFILE");
    env.database.close();

    const dbA = openRegistryDatabase(dbPath);
    const dbB = openRegistryDatabase(dbPath);
    const repoA = new SqliteConversionRunLedgerRepository(dbA);
    const repoB = new SqliteConversionRunLedgerRepository(dbB);
    try {
      const results = await Promise.allSettled([
        Promise.resolve().then(() => repoA.dispatchManual(manualIntent)),
        Promise.resolve().then(() => repoB.dispatchManual(autoIntent)),
      ]);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const reason = rejected[0]!.reason as { code?: string; message?: string };
      expect(reason.code).toBe("CONVERSION_IDEMPOTENCY_CONFLICT");
      expect(reason.message ?? "").not.toMatch(/SQLITE_BUSY|SQLITE_CONSTRAINT/);

      const verifier = openRegistryDatabase(dbPath);
      try {
        const runRows = verifier
          .prepare(
            "SELECT id, trigger_type FROM conversion_runs WHERE workspace_id = ? AND idempotency_key = ?",
          )
          .all(workspaceId, manualIntent.idempotencyKey) as Array<{
          id: string;
          trigger_type: string;
        }>;
        expect(runRows).toHaveLength(1);
        expect(["MANUAL", "AUTO_PROFILE"]).toContain(runRows[0]!.trigger_type);
        const eventRows = verifier
          .prepare(
            "SELECT event_type, sequence FROM conversion_execution_events WHERE run_id = ? ORDER BY sequence ASC",
          )
          .all(runRows[0]!.id) as Array<{ event_type: string; sequence: number }>;
        expect(eventRows).toEqual([{ event_type: "CREATED", sequence: 1 }]);
        expect(fulfilled[0]!.value.record.run.id).toBe(runRows[0]!.id);
      } finally {
        verifier.close();
      }
    } finally {
      dbA.close();
      dbB.close();
    }
  });

  it("serializes concurrent cancellation to one terminal event", async () => {
    const dbPath = join(tmpdir(), `markorbit-cancel-${randomUUID()}.sqlite`);
    paths.push(dbPath, `${dbPath}-wal`, `${dbPath}-shm`);
    const env = await fixture(dbPath);
    const run = dispatch(env, "cancel").record.run;
    env.database.close();
    const dbA = openRegistryDatabase(dbPath);
    const dbB = openRegistryDatabase(dbPath);
    const dbVerifier = openRegistryDatabase(dbPath);
    const a = new SqliteConversionRunLedgerRepository(dbA);
    const b = new SqliteConversionRunLedgerRepository(dbB);
    try {
      const results = await Promise.allSettled([
        Promise.resolve().then(() => a.cancel(run.id, { workspaceId })),
        Promise.resolve().then(() => b.cancel(run.id, { workspaceId })),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        new SqliteConversionRunLedgerRepository(dbVerifier)
          .listEvents(run.id)
          .filter((e) => e.eventType === "CANCELLED"),
      ).toHaveLength(1);
    } finally {
      dbA.close();
      dbB.close();
      dbVerifier.close();
    }
  });
});
