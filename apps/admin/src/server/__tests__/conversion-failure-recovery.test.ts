import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  conversionFailureIsAutoRetryable,
  conversionRetryDelaySeconds,
  failedConversionRecoveryCandidateIds,
} from "../conversion-failure-recovery";

const WORKSPACE = "wsp_01H00000000000000000000000";

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE conversion_runs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      document_json TEXT NOT NULL
    );
    CREATE TABLE conversion_recovery_cases (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      root_run_id TEXT NOT NULL,
      latest_run_id TEXT NOT NULL,
      document_json TEXT NOT NULL
    );
  `);
  return db;
}

function insertRun(
  db: DatabaseSync,
  id: string,
  status: string,
  updatedAt: string,
  idempotencyKey = `initial:${id}`,
): void {
  db.prepare(
    `INSERT INTO conversion_runs
       (id, workspace_id, status, updated_at, idempotency_key, document_json)
     VALUES (?, ?, ?, ?, ?, '{}')`,
  ).run(id, WORKSPACE, status, updatedAt, idempotencyKey);
}

describe("conversion failure recovery", () => {
  it("keeps retry authority in the control plane", () => {
    expect(
      conversionFailureIsAutoRetryable({
        kind: "WORKER_ERROR",
        code: "PROCESS_CRASHED",
        message: "worker exited",
        retryable: false,
      }),
    ).toBe(true);
    expect(
      conversionFailureIsAutoRetryable({
        kind: "TIMEOUT",
        code: "LEASE_EXPIRED_DURING_CONVERSION",
        message: "lease expired",
        retryable: false,
      }),
    ).toBe(true);
    expect(
      conversionFailureIsAutoRetryable({
        kind: "CONVERTER_ERROR",
        code: "UPSTREAM_SERVICE_UNAVAILABLE",
        message: "temporary outage",
        retryable: false,
      }),
    ).toBe(true);
    expect(
      conversionFailureIsAutoRetryable({
        kind: "CONVERTER_ERROR",
        code: "UNSUPPORTED_DOCUMENT_STRUCTURE",
        message: "deterministic parser rejection",
        retryable: false,
      }),
    ).toBe(false);
    expect(
      conversionFailureIsAutoRetryable({
        kind: "VERIFICATION_FAILED",
        code: "CANONICAL_MARKDOWN_METADATA_MISMATCH",
        message: "output evidence invalid",
        retryable: false,
      }),
    ).toBe(false);
  });

  it("uses deterministic bounded exponential backoff", () => {
    expect(conversionRetryDelaySeconds(0)).toBe(60);
    expect(conversionRetryDelaySeconds(1)).toBe(120);
    expect(conversionRetryDelaySeconds(2)).toBe(240);
    expect(conversionRetryDelaySeconds(10)).toBe(900);
  });

  it("finds only untracked FAILED runs in deterministic bounded order", () => {
    const db = database();
    insertRun(db, "failed-oldest", "FAILED", "2026-08-09T00:01:00.000Z");
    insertRun(db, "failed-tracked-root", "FAILED", "2026-08-09T00:02:00.000Z");
    insertRun(db, "failed-middle", "FAILED", "2026-08-09T00:03:00.000Z");
    insertRun(db, "failed-tracked-latest", "FAILED", "2026-08-09T00:04:00.000Z");
    insertRun(db, "completed", "COMPLETED", "2026-08-09T00:00:00.000Z");
    insertRun(db, "failed-historical-retry", "FAILED", "2026-08-09T00:04:30.000Z");
    insertRun(
      db,
      "failed-crash-window-retry",
      "FAILED",
      "2026-08-09T00:04:45.000Z",
      "failure-retry:case-root:2",
    );
    insertRun(db, "failed-newest", "FAILED", "2026-08-09T00:05:00.000Z");

    db.prepare(
      `INSERT INTO conversion_recovery_cases
       (id, workspace_id, root_run_id, latest_run_id, document_json)
       VALUES ('case-root', ?, 'failed-tracked-root', 'failed-tracked-root', ?)`,
    ).run(
      WORKSPACE,
      JSON.stringify({ replacementRunIds: ["failed-historical-retry"] }),
    );
    db.prepare(
      `INSERT INTO conversion_recovery_cases
       (id, workspace_id, root_run_id, latest_run_id, document_json)
       VALUES ('case-latest', ?, 'some-root', 'failed-tracked-latest', ?)`,
    ).run(WORKSPACE, JSON.stringify({ replacementRunIds: [] }));

    expect(failedConversionRecoveryCandidateIds(db, WORKSPACE, 2)).toEqual([
      "failed-oldest",
      "failed-middle",
    ]);
    expect(failedConversionRecoveryCandidateIds(db, WORKSPACE, 10)).toEqual([
      "failed-oldest",
      "failed-middle",
      "failed-newest",
    ]);
  });
});
