import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type {
  ArtifactKind,
  RawArtifact,
  SourceDefinition,
  StagingDocumentDescriptor,
} from "@markorbit/contracts";
import { queryKnowledgeBrowser } from "./knowledge-browser-query";

const WORKSPACE = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const OTHER_WORKSPACE = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FB0";
const SOURCE_CN = "src_01ARZ3NDEKTSV4RRFFQ69G5FAA";
const SOURCE_US = "src_01ARZ3NDEKTSV4RRFFQ69G5FAB";
const SHA = "a".repeat(64);

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function id(prefix: "art" | "std" | "cvr", index: number): string {
  let value = index + 1;
  let encoded = "";
  for (let position = 0; position < 26; position += 1) {
    encoded = CROCKFORD[value & 31] + encoded;
    value = Math.floor(value / 32);
  }
  return `${prefix}_${encoded}`;
}

function source(
  sourceId: string,
  workspaceId: string,
  name: string,
  jurisdictions: string[],
): SourceDefinition {
  return {
    schemaVersion: "1.0",
    objectType: "SOURCE_DEFINITION",
    id: sourceId,
    workspaceId,
    name,
    slug: sourceId === SOURCE_CN ? "cn-source" : "us-source",
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions,
    languages: ["zh-CN"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    connectorConfig: {},
    canonicalUri: "https://example.test/",
    entrypoints: [{ uri: "https://example.test/" }],
    tags: [],
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  };
}

function artifact(
  index: number,
  sourceId: string,
  workspaceId: string,
  kind: ArtifactKind,
  searchableName = `artifact-${index}`,
): RawArtifact {
  return {
    schemaVersion: "1.0",
    objectType: "RAW_ARTIFACT",
    id: id("art", index),
    workspaceId,
    sourceId,
    version: 1,
    artifactKind: kind,
    mimeType: kind === "PDF" ? "application/pdf" : "text/html",
    originalName: searchableName,
    storage: { provider: "LOCAL", uri: `file:///artifacts/${index}` },
    binaryHash: { algorithm: "SHA-256", value: SHA },
    sizeBytes: 100 + index,
    capturedAt: "2026-09-01T00:00:00Z",
    collector: { connectorId: "crawl4ai-web", connectorVersion: "1.0.0" },
    provenance: { sourceUri: `https://example.test/items/${index}` },
    status: "READY_FOR_CONVERSION",
    createdAt: "2026-09-01T00:00:00Z",
  };
}

function staging(
  index: number,
  sourceId: string,
  workspaceId: string,
  status: StagingDocumentDescriptor["status"],
  title = `Document ${index}`,
  generatedAt = new Date(Date.UTC(2026, 8, 1, 0, index % 60, Math.floor(index / 60))).toISOString(),
): StagingDocumentDescriptor {
  return {
    contractVersion: "1.0",
    objectType: "STAGING_DOCUMENT_DESCRIPTOR",
    id: id("std", index),
    workspaceId,
    sourceId,
    rawArtifactId: id("art", index),
    conversionRunId: id("cvr", index),
    title,
    targetPath: `knowledge/item-${index}.md`,
    outputFormat: "MARKDOWN",
    contentHash: { algorithm: "SHA-256", value: SHA },
    sizeBytes: 100 + index,
    contentAddressedRef: `cas:sha256:${SHA}`,
    frontmatterSummary: { fieldCount: 0, fields: [] },
    converter: { converterId: "html-to-markdown", version: "1.0.0" },
    generatedAt,
    validation:
      status === "BLOCKED"
        ? { outcome: "FAIL", checks: [{ code: "TEST_BLOCKED", status: "FAIL" }], warnings: [] }
        : { outcome: "PASS", checks: [], warnings: [] },
    status,
  };
}

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
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
      artifact_kind TEXT NOT NULL,
      document_json TEXT NOT NULL
    );
    CREATE TABLE staging_documents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      raw_artifact_id TEXT NOT NULL,
      target_path TEXT NOT NULL,
      status TEXT NOT NULL,
      document_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function insertSource(db: DatabaseSync, value: SourceDefinition): void {
  db.prepare(
    `INSERT INTO source_definitions (id, workspace_id, name, jurisdictions_json, document_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    value.id,
    value.workspaceId,
    value.name,
    JSON.stringify(value.jurisdictions),
    JSON.stringify(value),
  );
}

function insertDocument(
  db: DatabaseSync,
  descriptor: StagingDocumentDescriptor,
  raw: RawArtifact,
): void {
  db.prepare(
    `INSERT INTO raw_artifacts (id, workspace_id, source_id, artifact_kind, document_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(raw.id, raw.workspaceId, raw.sourceId, raw.artifactKind, JSON.stringify(raw));
  db.prepare(
    `INSERT INTO staging_documents
     (id, workspace_id, source_id, raw_artifact_id, target_path, status, document_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    descriptor.id,
    descriptor.workspaceId,
    descriptor.sourceId,
    descriptor.rawArtifactId,
    descriptor.targetPath,
    descriptor.status,
    JSON.stringify(descriptor),
    descriptor.generatedAt,
  );
}

function seed(db: DatabaseSync, count = 125): void {
  insertSource(db, source(SOURCE_CN, WORKSPACE, "CN Official", ["CN"]));
  insertSource(db, source(SOURCE_US, WORKSPACE, "US Official", ["US"]));
  for (let index = 0; index < count; index += 1) {
    const sourceId = index % 2 === 0 ? SOURCE_CN : SOURCE_US;
    const status = index % 5 === 0 ? "BLOCKED" : index % 3 === 0 ? "READY" : "GENERATED";
    const kind: ArtifactKind = index % 4 === 0 ? "PDF" : "HTML";
    const name = index === 124 ? "beyond-one-hundred-needle.pdf" : `artifact-${index}`;
    insertDocument(
      db,
      staging(index, sourceId, WORKSPACE, status),
      artifact(index, sourceId, WORKSPACE, kind, name),
    );
  }
}

describe("queryKnowledgeBrowser", () => {
  it("searches and counts a match beyond the old 100-record prefix", () => {
    const db = database();
    seed(db);
    const result = queryKnowledgeBrowser(db, {
      workspaceId: WORKSPACE,
      q: "beyond-one-hundred-needle",
    });
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.artifact?.originalName).toBe("beyond-one-hundred-needle.pdf");
    expect(result.summary.total).toBe(1);
  });

  it("returns exact corpus total and a correct last page without an offset ceiling", () => {
    const db = database();
    seed(db);
    const result = queryKnowledgeBrowser(db, { workspaceId: WORKSPACE, offset: 120, limit: 25 });
    expect(result.total).toBe(125);
    expect(result.items).toHaveLength(5);
    expect(result.offset).toBe(120);
  });

  it("returns explicit zero counts for no matches while retaining workspace source options", () => {
    const db = database();
    seed(db);
    const result = queryKnowledgeBrowser(db, { workspaceId: WORKSPACE, q: "does-not-exist" });
    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.summary).toEqual({ total: 0, ready: 0, generated: 0, blocked: 0, archived: 0 });
    expect(result.filters.sources).toHaveLength(2);
  });

  it("combines source, jurisdiction, status, artifact kind and text filters in persistence", () => {
    const db = database();
    seed(db);
    const result = queryKnowledgeBrowser(db, {
      workspaceId: WORKSPACE,
      sourceId: SOURCE_CN,
      jurisdiction: "cn",
      status: "BLOCKED",
      artifactKind: "PDF",
      q: "item-",
      limit: 50,
    });
    expect(result.total).toBeGreaterThan(0);
    expect(result.items.every((item) => item.source?.id === SOURCE_CN)).toBe(true);
    expect(result.items.every((item) => item.source?.jurisdictions.includes("CN"))).toBe(true);
    expect(result.items.every((item) => item.status === "BLOCKED")).toBe(true);
    expect(result.items.every((item) => item.artifact?.artifactKind === "PDF")).toBe(true);
    expect(result.summary.total).toBe(result.total);
  });

  it("uses a deterministic id tie-breaker for equal generatedAt values", () => {
    const db = database();
    insertSource(db, source(SOURCE_CN, WORKSPACE, "CN Official", ["CN"]));
    const sameTime = "2026-09-01T12:00:00Z";
    for (const index of [1, 2, 3]) {
      insertDocument(
        db,
        staging(index, SOURCE_CN, WORKSPACE, "READY", `Tie ${index}`, sameTime),
        artifact(index, SOURCE_CN, WORKSPACE, "HTML"),
      );
    }
    const result = queryKnowledgeBrowser(db, { workspaceId: WORKSPACE, limit: 3 });
    expect(result.items.map((item) => item.id)).toEqual([id("std", 3), id("std", 2), id("std", 1)]);
  });

  it("remains corpus-complete after growth between queries", () => {
    const db = database();
    seed(db, 101);
    const before = queryKnowledgeBrowser(db, { workspaceId: WORKSPACE, offset: 100, limit: 25 });
    expect(before.total).toBe(101);
    expect(before.items).toHaveLength(1);
    insertDocument(
      db,
      staging(125, SOURCE_CN, WORKSPACE, "READY"),
      artifact(125, SOURCE_CN, WORKSPACE, "PDF"),
    );
    const after = queryKnowledgeBrowser(db, { workspaceId: WORKSPACE, offset: 100, limit: 25 });
    expect(after.total).toBe(102);
    expect(after.items).toHaveLength(2);
  });

  it("fails closed to the requested workspace", () => {
    const db = database();
    seed(db, 3);
    const otherSource = "src_01ARZ3NDEKTSV4RRFFQ69G5FAC";
    insertSource(db, source(otherSource, OTHER_WORKSPACE, "Other", ["GB"]));
    insertDocument(
      db,
      staging(126, otherSource, OTHER_WORKSPACE, "READY", "Secret other workspace"),
      artifact(126, otherSource, OTHER_WORKSPACE, "PDF"),
    );
    const result = queryKnowledgeBrowser(db, {
      workspaceId: WORKSPACE,
      q: "secret other workspace",
    });
    expect(result.total).toBe(0);
    expect(result.filters.jurisdictions).not.toContain("GB");
  });
});
