import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { listSourceChangeAlerts } from "../source-change-alerts";

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE source_definitions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL
    ) STRICT;
    CREATE TABLE document_change_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      change_kind TEXT NOT NULL,
      to_version INTEGER NOT NULL,
      added_sections INTEGER NOT NULL,
      removed_sections INTEGER NOT NULL,
      modified_sections INTEGER NOT NULL,
      changed_sections INTEGER NOT NULL,
      observed_at TEXT NOT NULL
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

function insertEvent(
  db: DatabaseSync,
  input: {
    sourceId: string;
    documentId: string;
    kind?: string;
    version: number;
    added?: number;
    removed?: number;
    modified?: number;
    observedAt: string;
  },
): void {
  const added = input.added ?? 0;
  const removed = input.removed ?? 0;
  const modified = input.modified ?? 0;
  db.prepare(
    `INSERT INTO document_change_events (
       workspace_id, source_id, document_id, change_kind, to_version,
       added_sections, removed_sections, modified_sections, changed_sections, observed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "wsp_test",
    input.sourceId,
    input.documentId,
    input.kind ?? "UPDATED",
    input.version,
    added,
    removed,
    modified,
    added + removed + modified,
    input.observedAt,
  );
}

describe("listSourceChangeAlerts", () => {
  it("aggregates recent UPDATED events by Source and preserves the latest objective diff", () => {
    const db = database();
    insertEvent(db, {
      sourceId: "src_a",
      documentId: "doc_1",
      version: 2,
      added: 1,
      modified: 2,
      observedAt: "2026-08-18T10:00:00.000Z",
    });
    insertEvent(db, {
      sourceId: "src_a",
      documentId: "doc_2",
      version: 5,
      removed: 1,
      modified: 1,
      observedAt: "2026-08-18T11:00:00.000Z",
    });
    insertEvent(db, {
      sourceId: "src_b",
      documentId: "doc_3",
      version: 3,
      added: 4,
      observedAt: "2026-08-18T09:00:00.000Z",
    });
    insertEvent(db, {
      sourceId: "src_b",
      documentId: "doc_created",
      kind: "CREATED",
      version: 1,
      added: 10,
      observedAt: "2026-08-18T11:30:00.000Z",
    });
    insertEvent(db, {
      sourceId: "src_b",
      documentId: "doc_old",
      version: 8,
      modified: 9,
      observedAt: "2026-08-16T11:00:00.000Z",
    });

    const summary = listSourceChangeAlerts(db, "wsp_test", {
      windowHours: 24,
      observedAt: new Date("2026-08-18T12:00:00.000Z"),
      limit: 8,
    });

    expect(summary).toMatchObject({
      changedSources: 2,
      changedDocuments: 3,
      updateEvents: 3,
      changedSections: 9,
    });
    expect(summary.alerts.map((alert) => alert.sourceId)).toEqual(["src_a", "src_b"]);
    expect(summary.alerts[0]).toMatchObject({
      sourceName: "Alpha Office",
      changedDocuments: 2,
      updateEvents: 2,
      changedSections: 5,
      latestDocumentId: "doc_2",
      latestVersion: 5,
      latestSummary: {
        addedSections: 0,
        removedSections: 1,
        modifiedSections: 1,
        changedSections: 2,
      },
    });
  });

  it("returns an empty summary before the change-feed tables exist", () => {
    const db = new DatabaseSync(":memory:");
    expect(listSourceChangeAlerts(db, "wsp_test")).toEqual({
      windowHours: 24,
      changedSources: 0,
      changedDocuments: 0,
      updateEvents: 0,
      changedSections: 0,
      alerts: [],
    });
  });
});
