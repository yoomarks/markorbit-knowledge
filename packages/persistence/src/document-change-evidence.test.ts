import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { CanonicalMarkdownMetadataV1 } from "@markorbit/contracts";
import { describe, expect, it } from "vitest";
import { SqliteDocumentChangeEvidenceRepository } from "./document-change-evidence";
import { SqliteDocumentChangeFeedRepository } from "./document-change-feed";
import { SqliteRetrievalIndexRepository } from "./retrieval-index";

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function metadata(
  version: number,
  overrides: Partial<CanonicalMarkdownMetadataV1> = {},
): CanonicalMarkdownMetadataV1 {
  return {
    schemaVersion: "1.0",
    objectType: "CANONICAL_MARKDOWN_METADATA",
    documentId: "document-1",
    workspaceId: "workspace-1",
    sourceId: "source-1",
    sourceName: "Official Office",
    sourceCategory: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    jurisdictions: ["US", "EU"],
    languages: ["en"],
    rawArtifactId: `raw-${version}`,
    logicalDocumentId: "logical-1",
    artifactVersion: version,
    artifactKind: "HTML",
    originalName: `rules-${version}.html`,
    canonicalUri: "https://office.example/rules",
    sourceUri: "https://office.example/rules",
    capturedAt: `2026-08-${String(version).padStart(2, "0")}T00:00:00.000Z`,
    publishedAt: null,
    conversionRunId: `conversion-${version}`,
    converterId: "test-converter",
    converterVersion: "1.0.0",
    inputSha256: "a".repeat(64),
    ...overrides,
  };
}

function indexVersion(
  index: SqliteRetrievalIndexRepository,
  version: number,
  title: string,
  body: string,
  overrides: Partial<CanonicalMarkdownMetadataV1> = {},
  targetPath = `/knowledge/rules-${version}.md`,
) {
  const bytes = new TextEncoder().encode(`---\ntest: true\n---\n${body}\n`);
  return index.indexVerified({
    metadata: metadata(version, overrides),
    stagingDocumentId: `staging-${version}`,
    readyPackageId: `ready-${version}`,
    title,
    targetPath,
    contentSha256: sha256(bytes),
    canonicalMarkdown: bytes,
  });
}

function installRawArtifactEvidenceTable(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE raw_artifacts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      content_digest TEXT NOT NULL,
      artifact_kind TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      document_json TEXT NOT NULL
    ) STRICT;
  `);
}

function insertRawArtifact(
  database: DatabaseSync,
  input: { id: string; digest: string; sizeBytes: number; binaryHash?: string },
): void {
  const artifact = {
    objectType: "RAW_ARTIFACT",
    id: input.id,
    workspaceId: "workspace-1",
    sourceId: "source-1",
    artifactKind: "PDF",
    mimeType: "application/pdf",
    originalName: `${input.id}.pdf`,
    canonicalUri: "https://office.example/rules.pdf",
    binaryHash: { algorithm: "SHA-256", value: input.binaryHash ?? input.digest },
    contentHash: { algorithm: "SHA-256", value: input.binaryHash ?? input.digest },
    sizeBytes: input.sizeBytes,
    capturedAt: "2026-08-20T00:00:00.000Z",
    provenance: { sourceUri: "https://office.example/rules.pdf" },
  };
  database
    .prepare(
      `INSERT INTO raw_artifacts
       (id, workspace_id, source_id, content_digest, artifact_kind, mime_type, document_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      "workspace-1",
      "source-1",
      input.digest,
      "PDF",
      "application/pdf",
      JSON.stringify(artifact),
    );
}

describe("SqliteDocumentChangeEvidenceRepository", () => {
  it("derives provenance and objective dimensions from persisted document changes", () => {
    const database = new DatabaseSync(":memory:");
    const index = new SqliteRetrievalIndexRepository(
      database,
      () => new Date("2026-08-19T00:00:00Z"),
    );
    const changes = new SqliteDocumentChangeFeedRepository(database);

    const first = indexVersion(
      index,
      1,
      "Trademark Rules",
      "# Rules\nSee https://office.example/old-rule for the current rule.\n\n# Fees\nOld fee table.",
    );
    const firstEvent = changes.recordIndexedVersion(first.document, first.chunks).event;
    expect(firstEvent).not.toBeNull();

    const second = indexVersion(
      index,
      2,
      "Trademark Rules 2026",
      "# Rules\nSee https://office.example/new-rule for the current rule.\n\n# Procedure\nNew filing procedure.",
      { jurisdictions: ["EU", "US"] },
    );
    const secondEvent = changes.recordIndexedVersion(second.document, second.chunks).event;
    expect(secondEvent).not.toBeNull();

    const evidence = new SqliteDocumentChangeEvidenceRepository(database).feed({
      workspaceId: "workspace-1",
    });

    expect(evidence.items).toHaveLength(2);
    expect(evidence.nextCursor).toBe("ce_2");

    const created = evidence.items[0]!;
    expect(created.changeKind).toBe("CREATED");
    expect(created.before).toBeNull();
    expect(created.after).toMatchObject({
      artifactVersion: 1,
      rawArtifactId: "raw-1",
      stagingDocumentId: "staging-1",
      readyPackageId: "ready-1",
    });
    expect(created.rawArtifacts).toEqual({ before: null, after: null });
    expect(created.dimensions).toContain("DOCUMENT_CREATED");
    expect(created.coverage.rawArtifactBinary).toBe(false);
    expect(created.coverage.linkedAttachments).toBe(false);

    const updated = evidence.items[1]!;
    expect(updated.changeKind).toBe("UPDATED");
    expect(updated.before).toMatchObject({ artifactVersion: 1, rawArtifactId: "raw-1" });
    expect(updated.after).toMatchObject({ artifactVersion: 2, rawArtifactId: "raw-2" });
    expect(updated.dimensions).toEqual(
      expect.arrayContaining([
        "CONTENT_CHANGED",
        "METADATA_CHANGED",
        "LINK_ADDED",
        "LINK_REMOVED",
        "SECTION_ADDED",
        "SECTION_REMOVED",
        "SECTION_MODIFIED",
        "STRUCTURE_CHANGED",
      ]),
    );
    expect(updated.dimensions).not.toContain("RAW_ARTIFACT_BINARY_CHANGED");
    expect(updated.metadataChanges).toEqual([
      { field: "title", before: "Trademark Rules", after: "Trademark Rules 2026" },
      {
        field: "targetPath",
        before: "/knowledge/rules-1.md",
        after: "/knowledge/rules-2.md",
      },
    ]);
    expect(updated.metadataChanges.some((change) => change.field === "jurisdictions")).toBe(false);
    expect(updated.links).toEqual({
      added: ["https://office.example/new-rule"],
      removed: ["https://office.example/old-rule"],
    });
    expect(updated.summary).toMatchObject({
      addedSections: 1,
      removedSections: 1,
      modifiedSections: 1,
      changedSections: 3,
    });
    expect(updated.sections).toHaveLength(3);
  });

  it("detects raw binary replacement even when canonical content is unchanged", () => {
    const database = new DatabaseSync(":memory:");
    const index = new SqliteRetrievalIndexRepository(database);
    const changes = new SqliteDocumentChangeFeedRepository(database);
    const body = "# Rules\nCanonical text remains identical.";
    const first = indexVersion(index, 1, "Rules", body, {}, "/knowledge/rules.md");
    changes.recordIndexedVersion(first.document, first.chunks);
    const second = indexVersion(index, 2, "Rules", body, {}, "/knowledge/rules.md");
    const secondEvent = changes.recordIndexedVersion(second.document, second.chunks).event;
    expect(secondEvent?.changeKind).toBe("UNCHANGED");
    expect(secondEvent?.fromContentSha256).toBe(secondEvent?.toContentSha256);

    installRawArtifactEvidenceTable(database);
    insertRawArtifact(database, { id: "raw-1", digest: "1".repeat(64), sizeBytes: 1200 });
    insertRawArtifact(database, { id: "raw-2", digest: "2".repeat(64), sizeBytes: 1400 });

    const evidence = new SqliteDocumentChangeEvidenceRepository(database).feed({
      workspaceId: "workspace-1",
    });
    const replacement = evidence.items[1]!;
    expect(replacement.changeKind).toBe("UNCHANGED");
    expect(replacement.dimensions).not.toContain("CONTENT_CHANGED");
    expect(replacement.dimensions).toContain("RAW_ARTIFACT_BINARY_CHANGED");
    expect(replacement.coverage).toMatchObject({
      rawArtifactBinary: true,
      linkedAttachments: false,
    });
    expect(replacement.rawArtifacts.before).toMatchObject({
      artifactId: "raw-1",
      artifactKind: "PDF",
      binarySha256: "1".repeat(64),
      sizeBytes: 1200,
    });
    expect(replacement.rawArtifacts.after).toMatchObject({
      artifactId: "raw-2",
      artifactKind: "PDF",
      binarySha256: "2".repeat(64),
      sizeBytes: 1400,
    });
  });

  it("fails closed when persisted raw binary evidence disagrees with its digest row", () => {
    const database = new DatabaseSync(":memory:");
    const index = new SqliteRetrievalIndexRepository(database);
    const changes = new SqliteDocumentChangeFeedRepository(database);
    const first = indexVersion(index, 1, "Rules", "# Rules\nInitial rule.");
    changes.recordIndexedVersion(first.document, first.chunks);
    installRawArtifactEvidenceTable(database);
    insertRawArtifact(database, {
      id: "raw-1",
      digest: "1".repeat(64),
      binaryHash: "2".repeat(64),
      sizeBytes: 1200,
    });

    expect(() =>
      new SqliteDocumentChangeEvidenceRepository(database).feed({ workspaceId: "workspace-1" }),
    ).toThrow("does not match its indexed evidence row");
  });

  it("supports evidence cursors and rejects malformed cursors", () => {
    const database = new DatabaseSync(":memory:");
    const index = new SqliteRetrievalIndexRepository(database);
    const changes = new SqliteDocumentChangeFeedRepository(database);
    const first = indexVersion(index, 1, "Rules", "# Rules\nInitial rule.");
    changes.recordIndexedVersion(first.document, first.chunks);
    const evidence = new SqliteDocumentChangeEvidenceRepository(database);

    const page = evidence.feed({ workspaceId: "workspace-1", cursor: "ce_1" });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
    expect(() => evidence.feed({ workspaceId: "workspace-1", cursor: "cf_1" })).toThrow(
      "change evidence cursor is invalid",
    );
  });
});
