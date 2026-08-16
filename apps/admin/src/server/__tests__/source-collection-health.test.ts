import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { ensureExecutionLedger } from "@markorbit/persistence/execution-ledger";
import {
  listSourceCollectionHealth,
  listSourceCollectionHealthBatched,
  summarizeSourceCollectionHealth,
  summarizeSourceCollectionHealthOverview,
} from "../source-collection-health";

const WORKSPACE_ID = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";

function sourceDocument(sourceId: string, planId: string, createdAt: string) {
  return {
    schemaVersion: "1.0",
    objectType: "SOURCE_DEFINITION",
    id: sourceId,
    workspaceId: WORKSPACE_ID,
    name: `Source ${sourceId}`,
    slug: `source-${sourceId.slice(-6).toLowerCase()}`,
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    connectorConfig: {},
    canonicalUri: "https://example.com",
    entrypoints: [{ uri: "https://example.com" }],
    defaultCollectionPlanId: planId,
    tags: [],
    createdAt,
    updatedAt: createdAt,
  } as const;
}

function planDocument(
  planId: string,
  sourceId: string,
  createdAt: string,
  schedule:
    | { mode: "INTERVAL"; intervalSeconds: number }
    | { mode: "CHANGE_WATCH"; pollIntervalSeconds: number }
    | { mode: "CRON"; expression: string; timezone: string },
) {
  return {
    schemaVersion: "1.0",
    objectType: "COLLECTION_PLAN",
    id: planId,
    workspaceId: WORKSPACE_ID,
    sourceId,
    name: `Plan ${planId}`,
    status: "ACTIVE",
    schedule,
    priority: "NORMAL",
    policy: {
      includePatterns: [],
      excludePatterns: [],
      maxDepth: 2,
      maxItems: 100,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: true,
      rateLimitPerMinute: 30,
      timeoutSeconds: 30,
      retry: { maxAttempts: 3, backoffSeconds: 30 },
    },
    output: { artifactKinds: ["HTML"] },
    createdAt,
    updatedAt: createdAt,
  } as const;
}

function insertSourceAndPlan(
  database: DatabaseSync,
  sourceId: string,
  planId: string,
  createdAt: string,
  schedule:
    | { mode: "INTERVAL"; intervalSeconds: number }
    | { mode: "CHANGE_WATCH"; pollIntervalSeconds: number }
    | { mode: "CRON"; expression: string; timezone: string },
) {
  const source = sourceDocument(sourceId, planId, createdAt);
  const plan = planDocument(planId, sourceId, createdAt, schedule);
  database
    .prepare(
      `INSERT INTO source_definitions (
         id, workspace_id, slug, name, source_type, category, authority_level, status,
         connector_id, canonical_uri, jurisdictions_json, languages_json, tags_json,
         document_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      source.id,
      source.workspaceId,
      source.slug,
      source.name,
      source.sourceType,
      source.category,
      source.authorityLevel,
      source.status,
      source.connector.connectorId,
      source.canonicalUri,
      JSON.stringify(source.jurisdictions),
      JSON.stringify(source.languages),
      JSON.stringify(source.tags),
      JSON.stringify(source),
      source.createdAt,
      source.updatedAt,
    );
  database
    .prepare(
      `INSERT INTO collection_plans (
         id, workspace_id, source_id, name, status, schedule_mode, priority,
         connector_id, output_kinds_json, document_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      plan.id,
      plan.workspaceId,
      plan.sourceId,
      plan.name,
      plan.status,
      plan.schedule.mode,
      plan.priority,
      source.connector.connectorId,
      JSON.stringify(plan.output.artifactKinds),
      JSON.stringify(plan),
      plan.createdAt,
      plan.updatedAt,
    );
}

function insertRun(
  database: DatabaseSync,
  input: {
    id: string;
    sourceId: string;
    planId: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  },
) {
  database
    .prepare(
      `INSERT INTO collection_runs (
         id, workspace_id, source_id, plan_id, plan_name, source_name,
         connector_id, connector_version, trigger_type, status, idempotency_key,
         document_json, requested_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      WORKSPACE_ID,
      input.sourceId,
      input.planId,
      "Plan",
      "Source",
      "crawl4ai-web",
      "1.0.0",
      "SCHEDULED",
      input.status,
      null,
      "{}",
      input.createdAt,
      input.createdAt,
      input.updatedAt,
    );
}

describe("source collection health", () => {
  it("distinguishes never-run, healthy, collecting and cancelled sources", () => {
    expect(summarizeSourceCollectionHealth([]).state).toBe("NEVER_RUN");
    expect(
      summarizeSourceCollectionHealth([
        {
          sourceId: "src_a",
          status: "COMPLETED",
          updatedAt: "2026-08-15T12:00:00.000Z",
          retrying: false,
          jobFailureAt: null,
        },
      ]).state,
    ).toBe("HEALTHY");
    expect(
      summarizeSourceCollectionHealth([
        {
          sourceId: "src_a",
          status: "RUNNING",
          updatedAt: "2026-08-15T12:00:00.000Z",
          retrying: false,
          jobFailureAt: null,
        },
      ]).state,
    ).toBe("COLLECTING");
    expect(
      summarizeSourceCollectionHealth([
        {
          sourceId: "src_a",
          status: "CANCELLED",
          updatedAt: "2026-08-15T12:00:00.000Z",
          retrying: false,
          jobFailureAt: null,
        },
      ]).state,
    ).toBe("CANCELLED");
  });

  it("surfaces durable retry state before terminal failure", () => {
    const health = summarizeSourceCollectionHealth([
      {
        sourceId: "src_a",
        status: "PENDING",
        updatedAt: "2026-08-15T12:00:10.000Z",
        retrying: true,
        jobFailureAt: "2026-08-15T12:00:09.000Z",
      },
      {
        sourceId: "src_a",
        status: "COMPLETED",
        updatedAt: "2026-08-15T11:00:00.000Z",
        retrying: false,
        jobFailureAt: null,
      },
    ]);
    expect(health).toMatchObject({
      state: "RETRYING",
      latestRunStatus: "PENDING",
      latestSuccessAt: "2026-08-15T11:00:00.000Z",
      lastFailureAt: "2026-08-15T12:00:09.000Z",
      consecutiveFailures: 0,
      failedRuns: 0,
    });
  });

  it("aggregates consecutive and recent terminal failures", () => {
    const health = summarizeSourceCollectionHealth([
      {
        sourceId: "src_a",
        status: "FAILED",
        updatedAt: "2026-08-15T12:00:00.000Z",
        retrying: false,
        jobFailureAt: "2026-08-15T11:59:59.000Z",
      },
      {
        sourceId: "src_a",
        status: "FAILED",
        updatedAt: "2026-08-15T11:00:00.000Z",
        retrying: false,
        jobFailureAt: null,
      },
      {
        sourceId: "src_a",
        status: "COMPLETED",
        updatedAt: "2026-08-15T10:00:00.000Z",
        retrying: false,
        jobFailureAt: null,
      },
      {
        sourceId: "src_a",
        status: "FAILED",
        updatedAt: "2026-08-15T09:00:00.000Z",
        retrying: false,
        jobFailureAt: null,
      },
    ]);
    expect(health).toMatchObject({
      state: "FAILING",
      consecutiveFailures: 2,
      failedRuns: 3,
      lastFailureAt: "2026-08-15T11:59:59.000Z",
    });
  });

  it("detects interval collection staleness from the last successful run", () => {
    const database = new DatabaseSync(":memory:");
    try {
      ensureExecutionLedger(database);
      database.exec("PRAGMA foreign_keys = OFF;");
      const sourceId = "src_01ARZ3NDEKTSV4RRFFQ69G5FAA";
      const planId = "pln_01ARZ3NDEKTSV4RRFFQ69G5FAA";
      insertSourceAndPlan(database, sourceId, planId, "2026-08-15T08:00:00.000Z", {
        mode: "INTERVAL",
        intervalSeconds: 3_600,
      });
      insertRun(database, {
        id: "run_interval_success",
        sourceId,
        planId,
        status: "COMPLETED",
        createdAt: "2026-08-15T09:00:00.000Z",
        updatedAt: "2026-08-15T09:00:00.000Z",
      });

      const health = listSourceCollectionHealth(
        database,
        [sourceId],
        20,
        new Date("2026-08-15T11:00:00.000Z"),
      )[sourceId]!;

      expect(health).toMatchObject({
        defaultPlanId: planId,
        scheduleMode: "INTERVAL",
        latestSuccessAt: "2026-08-15T09:00:00.000Z",
        expectedNextCollectionAt: "2026-08-15T10:00:00.000Z",
        staleSince: "2026-08-15T10:06:00.000Z",
        attentionRequired: true,
      });
      expect(health.alerts).toEqual([
        expect.objectContaining({ code: "COLLECTION_OVERDUE", severity: "WARNING" }),
      ]);
    } finally {
      database.close();
    }
  });

  it("suppresses overdue noise while collection is actively recovering", () => {
    const database = new DatabaseSync(":memory:");
    try {
      ensureExecutionLedger(database);
      database.exec("PRAGMA foreign_keys = OFF;");
      const sourceId = "src_01ARZ3NDEKTSV4RRFFQ69G5FAB";
      const planId = "pln_01ARZ3NDEKTSV4RRFFQ69G5FAB";
      insertSourceAndPlan(database, sourceId, planId, "2026-08-15T08:00:00.000Z", {
        mode: "CHANGE_WATCH",
        pollIntervalSeconds: 1_800,
      });
      insertRun(database, {
        id: "run_watch_success",
        sourceId,
        planId,
        status: "COMPLETED",
        createdAt: "2026-08-15T09:00:00.000Z",
        updatedAt: "2026-08-15T09:00:00.000Z",
      });
      insertRun(database, {
        id: "run_watch_active",
        sourceId,
        planId,
        status: "RUNNING",
        createdAt: "2026-08-15T10:55:00.000Z",
        updatedAt: "2026-08-15T10:55:00.000Z",
      });

      const health = listSourceCollectionHealth(
        database,
        [sourceId],
        20,
        new Date("2026-08-15T11:00:00.000Z"),
      )[sourceId]!;

      expect(health.state).toBe("COLLECTING");
      expect(health.staleSince).toBe("2026-08-15T09:33:00.000Z");
      expect(health.alerts.some((alert) => alert.code === "COLLECTION_OVERDUE")).toBe(false);
      expect(health.attentionRequired).toBe(false);
    } finally {
      database.close();
    }
  });

  it("reads retry, failure streak and terminal failure state from execution ledger tables", () => {
    const database = new DatabaseSync(":memory:");
    try {
      ensureExecutionLedger(database);
      database.exec("PRAGMA foreign_keys = OFF;");

      const insertJob = database.prepare(`
        INSERT INTO jobs (
          id, run_id, workspace_id, source_id, plan_id, connector_id,
          connector_version, job_type, status, attempt, available_at,
          document_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertRun(database, {
        id: "run_retry",
        sourceId: "src_retry",
        planId: "pln_test",
        status: "PENDING",
        createdAt: "2026-08-15T12:00:00.000Z",
        updatedAt: "2026-08-15T12:00:10.000Z",
      });
      insertJob.run(
        "job_retry",
        "run_retry",
        WORKSPACE_ID,
        "src_retry",
        "pln_test",
        "crawl4ai-web",
        "1.0.0",
        "WEB_CRAWL",
        "RETRY",
        2,
        "2026-08-15T12:00:20.000Z",
        "{}",
        "2026-08-15T12:00:00.000Z",
        "2026-08-15T12:00:09.000Z",
      );

      insertRun(database, {
        id: "run_failed_2",
        sourceId: "src_failed",
        planId: "pln_test",
        status: "FAILED",
        createdAt: "2026-08-15T11:30:00.000Z",
        updatedAt: "2026-08-15T11:30:10.000Z",
      });
      insertRun(database, {
        id: "run_failed_1",
        sourceId: "src_failed",
        planId: "pln_test",
        status: "FAILED",
        createdAt: "2026-08-15T11:00:00.000Z",
        updatedAt: "2026-08-15T11:00:10.000Z",
      });
      insertJob.run(
        "job_failed",
        "run_failed_2",
        WORKSPACE_ID,
        "src_failed",
        "pln_test",
        "crawl4ai-web",
        "1.0.0",
        "WEB_CRAWL",
        "FAILED",
        1,
        "2026-08-15T11:30:00.000Z",
        "{}",
        "2026-08-15T11:30:00.000Z",
        "2026-08-15T11:30:09.000Z",
      );

      const health = listSourceCollectionHealth(database, ["src_retry", "src_failed", "src_never"]);

      expect(health.src_retry).toMatchObject({
        state: "RETRYING",
        latestRunStatus: "PENDING",
        lastFailureAt: "2026-08-15T12:00:09.000Z",
        consecutiveFailures: 0,
        failedRuns: 0,
      });
      expect(health.src_failed).toMatchObject({
        state: "FAILING",
        latestRunStatus: "FAILED",
        lastFailureAt: "2026-08-15T11:30:09.000Z",
        consecutiveFailures: 2,
        failedRuns: 2,
        attentionRequired: true,
      });
      expect(health.src_failed?.alerts).toEqual([
        expect.objectContaining({ code: "FAILURE_STREAK", severity: "WARNING" }),
      ]);
      expect(health.src_never?.state).toBe("NEVER_RUN");
    } finally {
      database.close();
    }
  });
  it("aggregates operational health beyond the 100-source query boundary", () => {
    const database = new DatabaseSync(":memory:");
    try {
      ensureExecutionLedger(database);
      const sourceIds = Array.from({ length: 205 }, (_, index) => `src_scale_${index + 1}`);
      const health = listSourceCollectionHealthBatched(
        database,
        sourceIds,
        20,
        new Date("2026-08-15T12:00:00.000Z"),
      );
      expect(Object.keys(health)).toHaveLength(205);
      const overview = summarizeSourceCollectionHealthOverview(health);
      expect(overview).toEqual({
        scopeSources: 205,
        sourcesRequiringAttention: 0,
        totalAlerts: 0,
        overdueCollections: 0,
        failureStreaks: 0,
        schedulerErrors: 0,
        failingSources: 0,
        retryingSources: 0,
      });
    } finally {
      database.close();
    }
  });

  it("exposes the latest persisted worker failure for operator diagnosis", () => {
    const database = new DatabaseSync(":memory:");
    try {
      ensureExecutionLedger(database);
      database.exec(`
        CREATE TABLE execution_attempts (
          id TEXT PRIMARY KEY,
          job_id TEXT NOT NULL,
          job_attempt INTEGER NOT NULL,
          status TEXT NOT NULL,
          document_json TEXT NOT NULL,
          completed_at TEXT,
          updated_at TEXT NOT NULL
        ) STRICT;
      `);
      database.exec("PRAGMA foreign_keys = OFF;");
      const sourceId = "src_failure_detail";
      insertRun(database, {
        id: "run_failure_detail",
        sourceId,
        planId: "pln_failure_detail",
        status: "FAILED",
        createdAt: "2026-08-15T12:00:00.000Z",
        updatedAt: "2026-08-15T12:00:10.000Z",
      });
      database
        .prepare(
          `
        INSERT INTO jobs (
          id, run_id, workspace_id, source_id, plan_id, connector_id,
          connector_version, job_type, status, attempt, available_at,
          document_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          "job_failure_detail",
          "run_failure_detail",
          WORKSPACE_ID,
          sourceId,
          "pln_failure_detail",
          "crawl4ai-web",
          "1.0.0",
          "WEB_CRAWL",
          "FAILED",
          1,
          "2026-08-15T12:00:00.000Z",
          "{}",
          "2026-08-15T12:00:00.000Z",
          "2026-08-15T12:00:09.000Z",
        );
      database
        .prepare(
          `
        INSERT INTO execution_attempts (
          id, job_id, job_attempt, status, document_json, completed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          "exa_failure_detail",
          "job_failure_detail",
          1,
          "FAILED",
          JSON.stringify({
            id: "exa_failure_detail",
            jobId: "job_failure_detail",
            jobAttempt: 1,
            failure: {
              code: "CRAWL4AI_TIMEOUT",
              message: "Collector exceeded the governed timeout",
              retryable: true,
              occurredAt: "2026-08-15T12:00:08.000Z",
            },
          }),
          "2026-08-15T12:00:08.000Z",
          "2026-08-15T12:00:08.000Z",
        );

      const health = listSourceCollectionHealth(database, [sourceId])[sourceId]!;
      expect(health.latestFailure).toEqual({
        attemptId: "exa_failure_detail",
        jobId: "job_failure_detail",
        jobAttempt: 1,
        code: "CRAWL4AI_TIMEOUT",
        message: "Collector exceeded the governed timeout",
        retryable: true,
        occurredAt: "2026-08-15T12:00:08.000Z",
      });
      expect(summarizeSourceCollectionHealthOverview({ [sourceId]: health })).toMatchObject({
        scopeSources: 1,
        sourcesRequiringAttention: 1,
        failingSources: 1,
      });
    } finally {
      database.close();
    }
  });
});
