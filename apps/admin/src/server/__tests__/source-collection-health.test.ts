import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { ensureExecutionLedger } from "@markorbit/persistence/execution-ledger";
import {
  listSourceCollectionHealth,
  summarizeSourceCollectionHealth,
} from "../source-collection-health";

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

  it("reads retry and terminal failure state from execution ledger tables", () => {
    const database = new DatabaseSync(":memory:");
    try {
      ensureExecutionLedger(database);
      database.exec("PRAGMA foreign_keys = OFF;");

      const insertRun = database.prepare(`
        INSERT INTO collection_runs (
          id, workspace_id, source_id, plan_id, plan_name, source_name,
          connector_id, connector_version, trigger_type, status, idempotency_key,
          document_json, requested_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertJob = database.prepare(`
        INSERT INTO jobs (
          id, run_id, workspace_id, source_id, plan_id, connector_id,
          connector_version, job_type, status, attempt, available_at,
          document_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertRun.run(
        "run_retry",
        "ws_test",
        "src_retry",
        "pln_test",
        "Retry plan",
        "Retry source",
        "crawl4ai-web",
        "1.0.0",
        "MANUAL",
        "PENDING",
        null,
        "{}",
        "2026-08-15T12:00:00.000Z",
        "2026-08-15T12:00:00.000Z",
        "2026-08-15T12:00:10.000Z",
      );
      insertJob.run(
        "job_retry",
        "run_retry",
        "ws_test",
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

      insertRun.run(
        "run_failed",
        "ws_test",
        "src_failed",
        "pln_test",
        "Failure plan",
        "Failure source",
        "crawl4ai-web",
        "1.0.0",
        "MANUAL",
        "FAILED",
        null,
        "{}",
        "2026-08-15T11:00:00.000Z",
        "2026-08-15T11:00:00.000Z",
        "2026-08-15T11:00:10.000Z",
      );
      insertJob.run(
        "job_failed",
        "run_failed",
        "ws_test",
        "src_failed",
        "pln_test",
        "crawl4ai-web",
        "1.0.0",
        "WEB_CRAWL",
        "FAILED",
        1,
        "2026-08-15T11:00:00.000Z",
        "{}",
        "2026-08-15T11:00:00.000Z",
        "2026-08-15T11:00:09.000Z",
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
        lastFailureAt: "2026-08-15T11:00:09.000Z",
        consecutiveFailures: 1,
        failedRuns: 1,
      });
      expect(health.src_never?.state).toBe("NEVER_RUN");
    } finally {
      database.close();
    }
  });
});
