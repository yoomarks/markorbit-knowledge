import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { CONVERSION_EXECUTION_VERSION, type StagingDocumentDescriptor } from "@markorbit/contracts";
import {
  queryKnowledgeBrowser,
  queryKnowledgeReadModel,
  queryKnowledgeReadModelItemsByIds,
} from "../src/knowledge-browser-query";

const WORKSPACE_A = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const WORKSPACE_B = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const HASH = "a".repeat(64);

function descriptor(
  id: string,
  workspaceId: string,
  title: string,
  status: StagingDocumentDescriptor["status"],
  generatedAt: string,
): StagingDocumentDescriptor {
  return {
    contractVersion: CONVERSION_EXECUTION_VERSION,
    objectType: "STAGING_DOCUMENT_DESCRIPTOR",
    id,
    workspaceId,
    sourceId: SOURCE_ID,
    rawArtifactId: ARTIFACT_ID,
    conversionRunId: `cvr_${id.slice(4)}`,
    title,
    targetPath: `00_Inbox/${id}.md`,
    outputFormat: "MARKDOWN",
    contentHash: { algorithm: "SHA-256", value: HASH },
    sizeBytes: 10,
    contentAddressedRef: `cas:sha256:${HASH}`,
    frontmatterSummary: { fieldCount: 0, fields: [] },
    converter: { converterId: "builtin-html-markdown", version: "1.0.0" },
    generatedAt,
    validation: { outcome: "PASS", checks: [], warnings: [] },
    status,
  };
}

function fixture(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE staging_documents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      raw_artifact_id TEXT NOT NULL,
      conversion_run_id TEXT NOT NULL,
      target_path TEXT NOT NULL,
      status TEXT NOT NULL,
      document_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE source_definitions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      jurisdictions_json TEXT NOT NULL,
      document_json TEXT NOT NULL
    );
    CREATE TABLE raw_artifacts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      artifact_kind TEXT,
      document_json TEXT NOT NULL
    );
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, document_json TEXT NOT NULL);
    CREATE TABLE retrieval_documents (
      staging_document_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      is_current INTEGER NOT NULL
    );
  `);
  const insert = database.prepare(`
    INSERT INTO staging_documents
      (id, workspace_id, source_id, raw_artifact_id, conversion_run_id, target_path,
       status, document_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const rows: StagingDocumentDescriptor[] = [
    descriptor(
      "std_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      WORKSPACE_A,
      "Alpha evidence",
      "READY",
      "2026-09-04T10:00:00Z",
    ),
    descriptor(
      "std_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      WORKSPACE_A,
      "Alpha older evidence",
      "GENERATED",
      "2026-09-03T10:00:00Z",
    ),
    descriptor(
      "std_01ARZ3NDEKTSV4RRFFQ69G5FAX",
      WORKSPACE_B,
      "Alpha foreign workspace",
      "READY",
      "2026-09-05T10:00:00Z",
    ),
  ];
  for (const row of rows) {
    insert.run(
      row.id,
      row.workspaceId,
      row.sourceId,
      row.rawArtifactId,
      row.conversionRunId,
      row.targetPath,
      row.status,
      JSON.stringify(row),
      row.generatedAt,
    );
  }
  database
    .prepare("INSERT INTO workspaces (id, document_json) VALUES (?, ?)")
    .run(WORKSPACE_A, JSON.stringify({ status: "ACTIVE" }));
  database
    .prepare("INSERT INTO workspaces (id, document_json) VALUES (?, ?)")
    .run(WORKSPACE_B, JSON.stringify({ status: "ACTIVE" }));
  const index = database.prepare(
    "INSERT INTO retrieval_documents (staging_document_id, workspace_id, source_id, is_current) VALUES (?, ?, ?, 1)",
  );
  index.run(rows[0].id, WORKSPACE_A, SOURCE_ID);
  index.run(rows[2].id, WORKSPACE_B, SOURCE_ID);
  return database;
}

describe("Knowledge Query Read Model V2", () => {
  it("keeps the Browser compatibility API on the canonical corpus truth", () => {
    const database = fixture();
    const input = {
      workspaceId: WORKSPACE_A,
      q: "alpha",
      status: "READY" as const,
    };

    const canonical = queryKnowledgeReadModel(database, input);
    const browser = queryKnowledgeBrowser(database, input);

    expect(browser).toEqual(canonical);
    expect(canonical.total).toBe(1);
    expect(canonical.items.map((item) => item.id)).toEqual(["std_01ARZ3NDEKTSV4RRFFQ69G5FAV"]);
    database.close();
  });

  it("resolves retrieval candidates through the same filters and fails closed by workspace", () => {
    const database = fixture();
    const candidateIds = [
      "std_01ARZ3NDEKTSV4RRFFQ69G5FAX",
      "std_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      "std_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    ];

    const ready = queryKnowledgeReadModelItemsByIds(
      database,
      { workspaceId: WORKSPACE_A, status: "READY" },
      candidateIds,
    );
    const workspaceB = queryKnowledgeReadModelItemsByIds(
      database,
      { workspaceId: WORKSPACE_B },
      candidateIds,
    );

    expect(ready.map((item) => item.id)).toEqual(["std_01ARZ3NDEKTSV4RRFFQ69G5FAV"]);
    expect(workspaceB.map((item) => item.id)).toEqual(["std_01ARZ3NDEKTSV4RRFFQ69G5FAX"]);
    database.close();
  });

  it("uses stable generatedAt/id corpus ordering independently of retrieval order", () => {
    const database = fixture();
    const result = queryKnowledgeReadModel(database, {
      workspaceId: WORKSPACE_A,
    });

    expect(result.items.map((item) => item.id)).toEqual([
      "std_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "std_01ARZ3NDEKTSV4RRFFQ69G5FAW",
    ]);
    database.close();
  });
  it("projects only current retrievable Knowledge when currentOnly is requested", () => {
    const database = fixture();
    const active = queryKnowledgeReadModel(database, {
      workspaceId: WORKSPACE_A,
      q: "alpha",
      currentOnly: true,
    });
    expect(active.items.map((item) => [item.workspaceId, item.id])).toEqual([
      [WORKSPACE_A, "std_01ARZ3NDEKTSV4RRFFQ69G5FAV"],
    ]);
    database
      .prepare("UPDATE workspaces SET document_json = ? WHERE id = ?")
      .run(JSON.stringify({ status: "SUSPENDED" }), WORKSPACE_A);
    expect(
      queryKnowledgeReadModel(database, { workspaceId: WORKSPACE_A, currentOnly: true }).total,
    ).toBe(0);
    database.close();
  });
});
