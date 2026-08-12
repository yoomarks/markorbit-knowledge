import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE,
  SqliteSourceRepository,
  listAppliedMigrations,
  openRegistryDatabase,
  type CreateSourceInput,
} from "../src/index";
import {
  SqliteCollectionPlanRepository,
  type CreateCollectionPlanInput,
} from "../src/collection-plan-registry";
import { SqliteExecutionLedgerRepository } from "../src/execution-ledger";
import {
  SqliteCollectionSchedulerRepository,
  ensureCollectionScheduler,
  nextCronOccurrence,
} from "../src/collection-scheduler";

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
    name: "Scheduled official updates",
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
  let sourceTick = 0;
  let planTick = 0;
  let runTick = 0;
  let jobTick = 0;
  let registryTick = 0;
  let schedulerNow = new Date("2026-08-12T00:00:00.000Z");
  const registryClock = () => new Date(Date.UTC(2026, 7, 12, 0, 0, registryTick++));
  const sources = new SqliteSourceRepository(
    database,
    registryClock,
    () => `src_01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(65 + sourceTick++)}`,
  );
  const plans = new SqliteCollectionPlanRepository(
    database,
    registryClock,
    () => `pln_01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(65 + planTick++)}`,
  );
  const scheduler = new SqliteCollectionSchedulerRepository(
    database,
    () => schedulerNow,
    () => `run_01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(65 + runTick++)}`,
    () => `job_01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(65 + jobTick++)}`,
  );
  const runs = new SqliteExecutionLedgerRepository(database);
  return {
    database,
    sources,
    plans,
    scheduler,
    runs,
    setNow(value: string) {
      schedulerNow = new Date(value);
    },
  };
}

describe("Collection scheduler runtime", () => {
  it("applies migration 0018 idempotently", () => {
    const database = new DatabaseSync(":memory:");
    ensureCollectionScheduler(database);
    ensureCollectionScheduler(database);
    expect(listAppliedMigrations(database)).toContain("0018_collection_scheduler_runtime");
    database.close();
  });

  it("anchors a new interval schedule in the future and dispatches a governed scheduled Run", () => {
    const { database, sources, plans, scheduler, runs, setNow } = repositories();
    const source = sources.create(sourceInput());
    const plan = plans.create(planInput(source.id));

    const initialized = scheduler.tick();
    expect(initialized.dispatched).toBe(0);
    expect(initialized.items[0]?.outcome).toBe("INITIALIZED");
    expect(scheduler.getState(plan.plan.id).nextDueAt).toBe("2026-08-12T01:00:00.000Z");

    setNow("2026-08-12T01:00:00.000Z");
    const tick = scheduler.tick();
    expect(tick.dispatched).toBe(1);
    const scheduled = runs.list({ triggerType: "SCHEDULED" });
    expect(scheduled.total).toBe(1);
    expect(scheduled.items[0]?.run.trigger).toMatchObject({
      type: "SCHEDULED",
      requestedBy: { actorType: "SYSTEM", actorId: "collection-scheduler" },
    });
    expect(scheduled.items[0]?.jobs[0]?.status).toBe("PENDING");
    expect(scheduled.items[0]?.jobs[0]?.jobType).toBe("WEB_CRAWL");
    expect(scheduler.getState(plan.plan.id).nextDueAt).toBe("2026-08-12T02:00:00.000Z");
    database.close();
  });

  it("materializes at most one catch-up run after missed intervals", () => {
    const { database, sources, plans, scheduler, runs, setNow } = repositories();
    const source = sources.create(sourceInput());
    const plan = plans.create(planInput(source.id));
    scheduler.tick();

    setNow("2026-08-12T05:30:00.000Z");
    const tick = scheduler.tick();
    expect(tick.dispatched).toBe(1);
    expect(runs.list({ planId: plan.plan.id }).total).toBe(1);
    expect(scheduler.getState(plan.plan.id).nextDueAt).toBe("2026-08-12T06:00:00.000Z");
    database.close();
  });

  it("uses the existing change-watch job type instead of creating a second diff engine", () => {
    const { database, sources, plans, scheduler, runs, setNow } = repositories();
    const source = sources.create(sourceInput());
    const plan = plans.create(
      planInput(source.id, {
        schedule: { mode: "CHANGE_WATCH", pollIntervalSeconds: 600 },
      }),
    );
    scheduler.tick();
    setNow("2026-08-12T00:10:00.000Z");
    scheduler.tick();

    const scheduled = runs.list({ planId: plan.plan.id });
    expect(scheduled.total).toBe(1);
    expect(scheduled.items[0]?.jobs[0]?.jobType).toBe("PAGE_UPDATE_CHECK");
    database.close();
  });

  it("respects pause/resume and performs only one catch-up after resuming", () => {
    const { database, sources, plans, scheduler, runs, setNow } = repositories();
    const source = sources.create(sourceInput());
    const created = plans.create(planInput(source.id));
    scheduler.tick();
    const paused = plans.updateStatus(created.plan.id, "PAUSED", created.plan.updatedAt);

    setNow("2026-08-12T03:00:00.000Z");
    expect(scheduler.tick().examined).toBe(0);
    expect(runs.list({ planId: created.plan.id }).total).toBe(0);
    expect(scheduler.getState(created.plan.id).runtimeState).toBe("PAUSED");

    plans.updateStatus(paused.plan.id, "ACTIVE", paused.plan.updatedAt);
    const resumed = scheduler.tick();
    expect(resumed.dispatched).toBe(1);
    expect(runs.list({ planId: created.plan.id }).total).toBe(1);
    expect(scheduler.getState(created.plan.id).nextDueAt).toBe("2026-08-12T04:00:00.000Z");
    database.close();
  });

  it("replays the exact schedule slot after restart-like state lag instead of duplicating runs", () => {
    const { database, sources, plans, scheduler, runs, setNow } = repositories();
    const source = sources.create(sourceInput());
    const plan = plans.create(planInput(source.id));
    scheduler.tick();
    setNow("2026-08-12T01:00:00.000Z");
    const first = scheduler.tick();
    expect(first.dispatched).toBe(1);

    database
      .prepare(
        `UPDATE collection_schedule_states
         SET next_due_at = ?, last_slot_at = NULL, last_triggered_at = NULL
         WHERE plan_id = ?`,
      )
      .run("2026-08-12T01:00:00.000Z", plan.plan.id);

    const restarted = new SqliteCollectionSchedulerRepository(
      database,
      () => new Date("2026-08-12T01:00:00.000Z"),
    );
    const replay = restarted.tick();
    expect(replay.replayed).toBe(1);
    expect(runs.list({ planId: plan.plan.id }).total).toBe(1);
    expect(restarted.getState(plan.plan.id).nextDueAt).toBe("2026-08-12T02:00:00.000Z");
    database.close();
  });

  it("persists scheduler state across a real SQLite reopen", () => {
    const path = join(tmpdir(), `markorbit-scheduler-${process.pid}-${Date.now()}.sqlite`);
    temporaryPaths.push(path, `${path}-shm`, `${path}-wal`);

    const firstDatabase = openRegistryDatabase(path);
    const first = repositories(firstDatabase);
    const source = first.sources.create(sourceInput());
    const plan = first.plans.create(planInput(source.id));
    first.scheduler.tick();
    firstDatabase.close();

    const secondDatabase = openRegistryDatabase(path);
    let runTick = 0;
    let jobTick = 0;
    const secondScheduler = new SqliteCollectionSchedulerRepository(
      secondDatabase,
      () => new Date("2026-08-12T02:30:00.000Z"),
      () => `run_01ARZ3NDEKTSV4RRFFQ69G5F${String(runTick++).padStart(2, "0")}`,
      () => `job_01ARZ3NDEKTSV4RRFFQ69G5F${String(jobTick++).padStart(2, "0")}`,
    );
    const tick = secondScheduler.tick();
    expect(tick.dispatched).toBe(1);
    expect(new SqliteExecutionLedgerRepository(secondDatabase).list({ planId: plan.plan.id }).total).toBe(
      1,
    );
    expect(secondScheduler.getState(plan.plan.id).nextDueAt).toBe("2026-08-12T03:00:00.000Z");
    secondDatabase.close();
  });

  it("evaluates standard five-field cron schedules in their declared timezone", () => {
    expect(
      nextCronOccurrence(
        "0 9 * * 1-5",
        "America/New_York",
        new Date("2026-08-12T12:30:00.000Z"),
      ).toISOString(),
    ).toBe("2026-08-12T13:00:00.000Z");
  });

  it("fails closed and exposes invalid cron configuration without creating a Run", () => {
    const { database, sources, plans, scheduler, runs } = repositories();
    const source = sources.create(sourceInput());
    const plan = plans.create(
      planInput(source.id, {
        schedule: { mode: "CRON", expression: "61 * * * *", timezone: "UTC" },
      }),
    );

    const tick = scheduler.tick();
    expect(tick.errors).toBe(1);
    expect(runs.list({ planId: plan.plan.id }).total).toBe(0);
    const state = scheduler.getState(plan.plan.id);
    expect(state.runtimeState).toBe("ERROR");
    expect(state.lastError?.code).toBe("SCHEDULER_INVALID_CRON");
    database.close();
  });
});
