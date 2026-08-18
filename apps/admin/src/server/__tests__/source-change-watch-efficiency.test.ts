import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { listSourceChangeWatchEfficiency } from "../source-change-watch-efficiency";

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE source_definitions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL
    ) STRICT;
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      document_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE execution_attempts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      status TEXT NOT NULL,
      completed_at TEXT,
      document_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE http_validator_checkpoints (
      workspace_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      canonical_uri TEXT NOT NULL,
      etag TEXT,
      last_modified TEXT,
      observed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, source_id, canonical_uri)
    ) STRICT;
  `);
  db.prepare("INSERT INTO source_definitions (id, workspace_id, name) VALUES (?, ?, ?)").run(
    "src_a",
    "wsp_test",
    "Alpha Office",
  );
  db.prepare("INSERT INTO source_definitions (id, workspace_id, name) VALUES (?, ?, ?)").run(
    "src_b",
    "wsp_test",
    "Beta Office",
  );
  return db;
}

function insertJob(
  db: DatabaseSync,
  id: string,
  sourceId: string,
  mode: "CHANGE_WATCH" | "INTERVAL",
): void {
  db.prepare(
    "INSERT INTO jobs (id, workspace_id, source_id, document_json) VALUES (?, ?, ?, ?)",
  ).run(id, "wsp_test", sourceId, JSON.stringify({ planSnapshot: { schedule: { mode } } }));
}

function insertAttempt(
  db: DatabaseSync,
  input: {
    id: string;
    jobId: string;
    completedAt: string;
    metadataOnly: boolean;
    itemsObserved: number;
    bytesPrepared: number;
  },
): void {
  db.prepare(
    `INSERT INTO execution_attempts
       (id, workspace_id, job_id, status, completed_at, document_json)
     VALUES (?, ?, ?, 'COMPLETED', ?, ?)`,
  ).run(
    input.id,
    "wsp_test",
    input.jobId,
    input.completedAt,
    JSON.stringify({
      receipt: {
        metadataOnly: input.metadataOnly,
        itemsObserved: input.itemsObserved,
        bytesPrepared: input.bytesPrepared,
      },
    }),
  );
}

function insertValidator(db: DatabaseSync, sourceId: string, uri: string, updatedAt: string): void {
  db.prepare(
    `INSERT INTO http_validator_checkpoints
       (workspace_id, source_id, canonical_uri, etag, last_modified, observed_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`,
  ).run("wsp_test", sourceId, uri, '"v1"', updatedAt, updatedAt);
}

describe("listSourceChangeWatchEfficiency", () => {
  it("separates pre-body 304 avoidance from post-body identity no-change", () => {
    const db = database();
    insertJob(db, "job_a", "src_a", "CHANGE_WATCH");
    insertJob(db, "job_b", "src_b", "CHANGE_WATCH");
    insertJob(db, "job_interval", "src_b", "INTERVAL");

    insertAttempt(db, {
      id: "att_304",
      jobId: "job_a",
      completedAt: "2026-08-18T10:00:00.000Z",
      metadataOnly: true,
      itemsObserved: 0,
      bytesPrepared: 0,
    });
    insertAttempt(db, {
      id: "att_sha",
      jobId: "job_a",
      completedAt: "2026-08-18T10:30:00.000Z",
      metadataOnly: true,
      itemsObserved: 2,
      bytesPrepared: 0,
    });
    insertAttempt(db, {
      id: "att_changed",
      jobId: "job_a",
      completedAt: "2026-08-18T11:00:00.000Z",
      metadataOnly: false,
      itemsObserved: 1,
      bytesPrepared: 128,
    });
    insertAttempt(db, {
      id: "att_old",
      jobId: "job_b",
      completedAt: "2026-08-16T11:00:00.000Z",
      metadataOnly: true,
      itemsObserved: 0,
      bytesPrepared: 0,
    });
    insertAttempt(db, {
      id: "att_interval",
      jobId: "job_interval",
      completedAt: "2026-08-18T11:30:00.000Z",
      metadataOnly: true,
      itemsObserved: 0,
      bytesPrepared: 0,
    });

    insertValidator(db, "src_a", "https://alpha.test/feed", "2026-08-18T11:05:00.000Z");
    insertValidator(db, "src_a", "https://alpha.test/api", "2026-08-18T11:10:00.000Z");
    insertValidator(db, "src_b", "https://beta.test/feed", "2026-08-18T09:00:00.000Z");

    const summary = listSourceChangeWatchEfficiency(db, "wsp_test", {
      windowHours: 24,
      observedAt: new Date("2026-08-18T12:00:00.000Z"),
    });

    expect(summary).toMatchObject({
      completedRuns: 3,
      metadataOnlyRuns: 2,
      http304NoBodyRuns: 1,
      bodyComparedNoChangeRuns: 1,
      artifactProducingRuns: 1,
      noChangeRatePercent: 66.7,
      activeValidatorSources: 2,
      activeValidatorEndpoints: 3,
      latestValidatorAt: "2026-08-18T11:10:00.000Z",
    });
    expect(summary.sources).toHaveLength(1);
    expect(summary.sources[0]).toMatchObject({
      sourceId: "src_a",
      sourceName: "Alpha Office",
      completedRuns: 3,
      metadataOnlyRuns: 2,
      http304NoBodyRuns: 1,
      bodyComparedNoChangeRuns: 1,
      artifactProducingRuns: 1,
      noChangeRatePercent: 66.7,
      activeValidatorEndpoints: 2,
      latestCompletedAt: "2026-08-18T11:00:00.000Z",
      latestValidatorAt: "2026-08-18T11:10:00.000Z",
    });
    db.close();
  });

  it("returns an empty summary before operational tables exist", () => {
    const db = new DatabaseSync(":memory:");
    expect(listSourceChangeWatchEfficiency(db, "wsp_test")).toEqual({
      windowHours: 24,
      completedRuns: 0,
      metadataOnlyRuns: 0,
      http304NoBodyRuns: 0,
      bodyComparedNoChangeRuns: 0,
      artifactProducingRuns: 0,
      noChangeRatePercent: 0,
      activeValidatorSources: 0,
      activeValidatorEndpoints: 0,
      latestValidatorAt: null,
      sources: [],
    });
    db.close();
  });
});
