import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { isCollectionRun, isJob, type CollectionRun } from "@markorbit/contracts";
import {
  DEFAULT_WORKSPACE,
  RegistryConflictError,
  SqliteSourceRepository,
  listAppliedMigrations,
  openRegistryDatabase,
  type CreateSourceInput,
} from "../src/index";
import {
  SqliteCollectionPlanRepository,
  type CreateCollectionPlanInput,
} from "../src/collection-plan-registry";
import { SqliteConnectorRepository } from "../src/connector-registry";
import {
  SqliteExecutionLedgerRepository,
  deriveCollectionJobType,
  ensureExecutionLedger,
} from "../src/execution-ledger";

const temporaryPaths: string[] = [];

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) rmSync(path, { force: true });
});

function sourceInput(overrides: Partial<CreateSourceInput> = {}): CreateSourceInput {
  return {
    workspaceId: DEFAULT_WORKSPACE.id,
    name: "USPTO News",
    slug: "uspto-news",
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
    tags: ["official"],
    ...overrides,
  };
}

function planInput(
  sourceId: string,
  overrides: Partial<CreateCollectionPlanInput> = {},
): CreateCollectionPlanInput {
  return {
    workspaceId: DEFAULT_WORKSPACE.id,
    sourceId,
    name: "Daily official updates",
    status: "ACTIVE",
    schedule: { mode: "INTERVAL", intervalSeconds: 3600 },
    priority: "NORMAL",
    policy: {
      includePatterns: ["/about-us/news-updates/**"],
      excludePatterns: [],
      maxDepth: 2,
      maxItems: 100,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: true,
      rateLimitPerMinute: 30,
      timeoutSeconds: 60,
      retry: { maxAttempts: 3, backoffSeconds: 10 },
      locale: "en-US",
    },
    output: { artifactKinds: ["HTML", "MARKDOWN"] },
    ...overrides,
  };
}

function repositories(database = new DatabaseSync(":memory:")) {
  let tick = 0;
  let sourceTick = 0;
  let planTick = 0;
  let runTick = 0;
  let jobTick = 0;
  const clock = () => new Date(Date.UTC(2026, 6, 16, 2, 0, tick++));
  const sources = new SqliteSourceRepository(
    database,
    clock,
    () => `src_01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(65 + sourceTick++)}`,
  );
  const connectors = new SqliteConnectorRepository(database, clock);
  const plans = new SqliteCollectionPlanRepository(
    database,
    clock,
    () => `pln_01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(65 + planTick++)}`,
  );
  const runs = new SqliteExecutionLedgerRepository(
    database,
    clock,
    () => `run_01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(65 + runTick++)}`,
    () => `job_01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(65 + jobTick++)}`,
  );
  return { database, sources, connectors, plans, runs };
}

describe("SQLite Execution Ledger", () => {
  it("applies migration 0004 idempotently", () => {
    const database = new DatabaseSync(":memory:");
    ensureExecutionLedger(database);
    ensureExecutionLedger(database);
    expect(listAppliedMigrations(database)).toEqual([
      "0001_source_registry",
      "0002_connector_registry",
      "0003_collection_plan_registry",
      "0004_execution_ledger",
    ]);
    database.close();
  });

  it("transactionally creates one pending run and one pending job", () => {
    const { database, sources, plans, runs } = repositories();
    const source = sources.create(sourceInput());
    const plan = plans.create(planInput(source.id));
    const dispatched = runs.dispatchManual({
      planId: plan.plan.id,
      idempotencyKey: "manual-001",
    });

    expect(dispatched.replayed).toBe(false);
    expect(dispatched.record.run.status).toBe("PENDING");
    expect(dispatched.record.jobs).toHaveLength(1);
    expect(dispatched.record.jobs[0]?.status).toBe("PENDING");
    expect(dispatched.record.jobs[0]?.jobType).toBe("WEB_CRAWL");
    expect(isCollectionRun(dispatched.record.run)).toBe(true);
    expect(isJob(dispatched.record.jobs[0])).toBe(true);
    expect(
      Number(
        (
          database.prepare("SELECT COUNT(*) AS count FROM collection_runs").get() as {
            count: number;
          }
        ).count,
      ),
    ).toBe(1);
    expect(
      Number(
        (database.prepare("SELECT COUNT(*) AS count FROM jobs").get() as { count: number }).count,
      ),
    ).toBe(1);
    database.close();
  });

  it("replays identical idempotent dispatch and rejects conflicting use", () => {
    const { database, sources, plans, runs } = repositories();
    const source = sources.create(sourceInput());
    const firstPlan = plans.create(planInput(source.id));
    const first = runs.dispatchManual({ planId: firstPlan.plan.id, idempotencyKey: "same-key" });
    const replay = runs.dispatchManual({ planId: firstPlan.plan.id, idempotencyKey: "same-key" });
    expect(replay.replayed).toBe(true);
    expect(replay.record.run.id).toBe(first.record.run.id);

    const secondPlan = plans.create(planInput(source.id, { name: "Second plan" }));
    expect(() =>
      runs.dispatchManual({ planId: secondPlan.plan.id, idempotencyKey: "same-key" }),
    ).toThrowError(RegistryConflictError);
    database.close();
  });

  it("requires active compatible plan, source and connector", () => {
    const { database, sources, connectors, plans, runs } = repositories();
    const source = sources.create(sourceInput());
    const paused = plans.create(planInput(source.id, { status: "PAUSED" }));
    expect(() => runs.dispatchManual({ planId: paused.plan.id })).toThrowError(
      RegistryConflictError,
    );

    const active = plans.create(planInput(source.id, { name: "Active plan" }));
    connectors.updateStatus("crawl4ai-web", "1.0.0", "DEPRECATED");
    expect(() => runs.dispatchManual({ planId: active.plan.id })).toThrowError(
      RegistryConflictError,
    );
    database.close();
  });

  it("derives deterministic job types and validates connector support", () => {
    const { database, sources, plans, connectors } = repositories();
    const source = sources.create(sourceInput());
    const watch = plans.create(
      planInput(source.id, {
        name: "Watch updates",
        schedule: { mode: "CHANGE_WATCH", pollIntervalSeconds: 600 },
      }),
    );
    const connector = connectors.get("crawl4ai-web", "1.0.0");
    expect(connector).not.toBeNull();
    expect(deriveCollectionJobType(watch.plan, source, connector!.manifest)).toBe(
      "PAGE_UPDATE_CHECK",
    );
    database.close();
  });

  it("preserves immutable snapshots after registry edits", () => {
    const { database, sources, plans, runs } = repositories();
    const source = sources.create(sourceInput());
    const plan = plans.create(planInput(source.id));
    const dispatched = runs.dispatchManual({ planId: plan.plan.id });

    plans.update(plan.plan.id, { name: "Renamed after dispatch" }, plan.plan.updatedAt);
    sources.update(source.id, { name: "Renamed source" }, source.updatedAt);
    const stored = runs.getById(dispatched.record.run.id);
    expect(stored?.run.planSnapshot.name).toBe("Daily official updates");
    expect(stored?.run.sourceSnapshot.name).toBe("USPTO News");
    database.close();
  });

  it("filters, paginates and lists history by plan and source", () => {
    const { database, sources, plans, runs } = repositories();
    const source = sources.create(sourceInput());
    const plan = plans.create(planInput(source.id));
    runs.dispatchManual({ planId: plan.plan.id, idempotencyKey: "one" });
    runs.dispatchManual({ planId: plan.plan.id, idempotencyKey: "two" });

    expect(runs.list({ status: "PENDING" }).total).toBe(2);
    expect(runs.list({ triggerType: "MANUAL", limit: 1, offset: 1 }).items).toHaveLength(1);
    expect(runs.list({ jobType: "WEB_CRAWL" }).total).toBe(2);
    expect(runs.listForPlan(plan.plan.id)).toHaveLength(2);
    expect(runs.listForSource(source.id)).toHaveLength(2);
    database.close();
  });

  it("cancels pending run and jobs atomically with optimistic concurrency", () => {
    const { database, sources, plans, runs } = repositories();
    const source = sources.create(sourceInput());
    const plan = plans.create(planInput(source.id));
    const dispatched = runs.dispatchManual({ planId: plan.plan.id });
    const cancelled = runs.cancel(dispatched.record.run.id, {
      expectedUpdatedAt: dispatched.record.run.updatedAt,
      reason: "No longer required",
    });
    expect(cancelled.run.status).toBe("CANCELLED");
    expect(cancelled.jobs[0]?.status).toBe("CANCELLED");
    expect(() =>
      runs.cancel(dispatched.record.run.id, {
        expectedUpdatedAt: dispatched.record.run.updatedAt,
      }),
    ).toThrowError(RegistryConflictError);
    database.close();
  });

  it("rejects cancellation after a worker-owned state is recorded", () => {
    const { database, sources, plans, runs } = repositories();
    const source = sources.create(sourceInput());
    const plan = plans.create(planInput(source.id));
    const dispatched = runs.dispatchManual({ planId: plan.plan.id });
    const running: CollectionRun = {
      ...dispatched.record.run,
      status: "RUNNING",
      updatedAt: "2026-07-16T03:00:00Z",
    };
    database
      .prepare(
        "UPDATE collection_runs SET status = ?, document_json = ?, updated_at = ? WHERE id = ?",
      )
      .run(running.status, JSON.stringify(running), running.updatedAt, running.id);
    expect(() => runs.cancel(running.id, { expectedUpdatedAt: running.updatedAt })).toThrowError(
      RegistryConflictError,
    );
    database.close();
  });

  it("survives database reopen without creating worker, artifact or scheduler tables", () => {
    const path = join(tmpdir(), `markorbit-execution-${process.pid}-${Date.now()}.sqlite`);
    temporaryPaths.push(path, `${path}-shm`, `${path}-wal`);
    const firstDatabase = openRegistryDatabase(path);
    const first = repositories(firstDatabase);
    const source = first.sources.create(sourceInput());
    const plan = first.plans.create(planInput(source.id));
    const dispatched = first.runs.dispatchManual({ planId: plan.plan.id });
    firstDatabase.close();

    const secondDatabase = openRegistryDatabase(path);
    const secondRuns = new SqliteExecutionLedgerRepository(secondDatabase);
    expect(secondRuns.getById(dispatched.record.run.id)?.jobs).toHaveLength(1);
    const tableNames = secondDatabase
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String((row as { name: unknown }).name));
    expect(tableNames).not.toContain("worker_leases");
    expect(tableNames).not.toContain("raw_artifacts");
    expect(tableNames).not.toContain("scheduler_runs");
    secondDatabase.close();
  });
});
