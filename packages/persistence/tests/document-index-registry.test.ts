import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { DocumentIndexV1 } from "@markorbit/contracts";
import { RegistryConflictError } from "../src/index";
import { SqliteDocumentIndexRegistryRepository } from "../src/document-index-registry";

const WORKSPACE = "wsp_01H00000000000000000000000";
const SOURCE = "src_01H00000000000000000000000";
const ARTIFACT = "art_01H00000000000000000000000";
const RUN = "cvr_01H00000000000000000000000";
const STAGING = "std_01H00000000000000000000000";
const CONTENT_SHA = "a".repeat(64);
const INDEX_ID = `dix_${"b".repeat(40)}`;

function index(): DocumentIndexV1 {
  return {
    protocolVersion: "1.0",
    objectType: "DOCUMENT_INDEX",
    id: INDEX_ID,
    workspaceId: WORKSPACE,
    stagingDocumentId: STAGING,
    documentId: "doc-uspto-maintenance",
    sourceId: SOURCE,
    rawArtifactId: ARTIFACT,
    conversionRunId: RUN,
    contentSha256: CONTENT_SHA,
    declaredLanguages: ["en"],
    languageHint: { code: "en", basis: "DECLARED_SINGLE" },
    statistics: {
      characterCount: 120,
      wordCount: 18,
      lineCount: 8,
      headingCount: 2,
      linkCount: 0,
    },
    keywords: ["maintenance", "registration"],
    chunking: { strategy: "MARKDOWN_SECTION_V1", maxCharacters: 1800 },
    chunks: [
      {
        protocolVersion: "1.0",
        objectType: "RETRIEVAL_CHUNK",
        id: `chk_${"c".repeat(40)}`,
        documentIndexId: INDEX_ID,
        stagingDocumentId: STAGING,
        workspaceId: WORKSPACE,
        sourceId: SOURCE,
        ordinal: 0,
        headingPath: ["Maintaining your registration"],
        startLine: 7,
        endLine: 9,
        text: "# Maintaining your registration\n\nOfficial trademark maintenance guidance.",
        contentSha256: "d".repeat(64),
        characterCount: 72,
        wordCount: 7,
        keywords: ["maintenance", "registration", "trademark"],
      },
      {
        protocolVersion: "1.0",
        objectType: "RETRIEVAL_CHUNK",
        id: `chk_${"e".repeat(40)}`,
        documentIndexId: INDEX_ID,
        stagingDocumentId: STAGING,
        workspaceId: WORKSPACE,
        sourceId: SOURCE,
        ordinal: 1,
        headingPath: ["Maintaining your registration", "Evidence"],
        startLine: 10,
        endLine: 12,
        text: "## Evidence\n\nEvidence examples are supplied by the official source.",
        contentSha256: "f".repeat(64),
        characterCount: 63,
        wordCount: 8,
        keywords: ["evidence", "official", "source"],
      },
    ],
    embedding: { status: "NOT_GENERATED" },
  };
}

function readyStaging(database: DatabaseSync, status = "READY"): void {
  database.exec("PRAGMA foreign_keys = OFF;");
  database
    .prepare(
      `INSERT INTO staging_documents
       (id, workspace_id, source_id, raw_artifact_id, conversion_run_id, target_path,
        content_sha256, size_bytes, status, document_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      STAGING,
      WORKSPACE,
      SOURCE,
      ARTIFACT,
      RUN,
      "US/USPTO/maintenance.md",
      CONTENT_SHA,
      120,
      status,
      "{}",
      "2026-08-09T00:00:00.000Z",
      "2026-08-09T00:00:00.000Z",
    );
}

describe("DocumentIndex registry", () => {
  it("persists immutable verified chunks and supports deterministic lexical lookup", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteDocumentIndexRegistryRepository(
      database,
      () => new Date("2026-08-09T01:00:00.000Z"),
    );
    readyStaging(database);

    const first = repository.persistVerified(index());
    const replay = repository.persistVerified(index());

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(repository.listChunks(INDEX_ID, WORKSPACE)).toHaveLength(2);
    const hits = repository.searchTerms({ workspaceId: WORKSPACE, query: "trademark maintenance" });
    expect(hits[0]?.chunk.ordinal).toBe(0);
    expect(hits[0]?.score).toBeGreaterThan(0);
    expect(
      repository.searchTerms({ workspaceId: WORKSPACE, query: "evidence source" })[0]?.chunk.ordinal,
    ).toBe(1);

    database.close();
  });

  it("rejects indexing content before Staging verification reaches READY", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteDocumentIndexRegistryRepository(database);
    readyStaging(database, "GENERATED");

    expect(() => repository.persistVerified(index())).toThrow(RegistryConflictError);
    database.close();
  });
});
