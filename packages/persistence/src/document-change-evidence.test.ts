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

function installCollectionRunEvidenceTable(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE collection_runs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      document_json TEXT NOT NULL
    ) STRICT;
  `);
}

function insertCollectionRun(database: DatabaseSync, id: string, fetchAttachments: boolean): void {
  const run = {
    objectType: "COLLECTION_RUN",
    id,
    workspaceId: "workspace-1",
    sourceId: "source-1",
    planSnapshot: { policy: { fetchAttachments } },
  };
  database
    .prepare(
      `INSERT INTO collection_runs (id, workspace_id, source_id, document_json)
       VALUES (?, ?, ?, ?)`,
    )
    .run(id, "workspace-1", "source-1", JSON.stringify(run));
}

function insertRawArtifact(
  database: DatabaseSync,
  input: {
    id: string;
    digest: string;
    sizeBytes: number;
    binaryHash?: string;
    artifactKind?: "HTML" | "PDF";
    mimeType?: string;
    originalName?: string;
    canonicalUri?: string;
    sourceUri?: string;
    collectionRunId?: string;
    parentArtifactIds?: string[];
  },
): void {
  const artifactKind = input.artifactKind ?? "PDF";
  const mimeType = input.mimeType ?? (artifactKind === "HTML" ? "text/html" : "application/pdf");
  const canonicalUri = input.canonicalUri ?? "https://office.example/rules.pdf";
  const sourceUri = input.sourceUri ?? canonicalUri;
  const artifact = {
    objectType: "RAW_ARTIFACT",
    id: input.id,
    workspaceId: "workspace-1",
    sourceId: "source-1",
    ...(input.collectionRunId ? { collectionRunId: input.collectionRunId } : {}),
    artifactKind,
    mimeType,
    originalName: input.originalName ?? `${input.id}.${artifactKind === "HTML" ? "html" : "pdf"}`,
    canonicalUri,
    binaryHash: { algorithm: "SHA-256", value: input.binaryHash ?? input.digest },
    contentHash: { algorithm: "SHA-256", value: input.binaryHash ?? input.digest },
    sizeBytes: input.sizeBytes,
    capturedAt: "2026-08-20T00:00:00.000Z",
    provenance: {
      sourceUri,
      ...(input.parentArtifactIds ? { parentArtifactIds: input.parentArtifactIds } : {}),
    },
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
      artifactKind,
      mimeType,
      JSON.stringify(artifact),
    );
}

function insertParentArtifact(
  database: DatabaseSync,
  id: "raw-1" | "raw-2",
  runId: string,
): void {
  insertRawArtifact(database, {
    id,
    digest: "a".repeat(64),
    sizeBytes: 1600,
    artifactKind: "HTML",
    mimeType: "text/html",
    originalName: "rules.html",
    canonicalUri: "https://office.example/rules",
    sourceUri: "https://office.example/rules",
    collectionRunId: runId,
  });
}

function insertAttachment(
  database: DatabaseSync,
  input: { id: string; parentId: string; uri: string; digest: string; runId: string },
): void {
  insertRawArtifact(database, {
    id: input.id,
    digest: input.digest,
    sizeBytes: 900,
    artifactKind: "PDF",
    mimeType: "application/pdf",
    originalName: input.uri.split("/").at(-1) ?? "attachment.pdf",
    canonicalUri: input.uri,
    sourceUri: input.uri,
    collectionRunId: input.runId,
    parentArtifactIds: [input.parentId],
  });
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
    expect(created.attachments).toEqual({ before: [], after: [], added: [], removed: [], modified: [] });
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

  it("derives added, removed and binary-changed attachments only from fully covered collection runs", () => {
    const database = new DatabaseSync(":memory:");
    const index = new SqliteRetrievalIndexRepository(database);
    const changes = new SqliteDocumentChangeFeedRepository(database);
    const body = "# Rules\nCanonical page text remains identical.";
    const first = indexVersion(index, 1, "Rules", body, {}, "/knowledge/rules.md");
    changes.recordIndexedVersion(first.document, first.chunks);
    const second = indexVersion(index, 2, "Rules", body, {}, "/knowledge/rules.md");
    changes.recordIndexedVersion(second.document, second.chunks);

    installRawArtifactEvidenceTable(database);
    installCollectionRunEvidenceTable(database);
    insertCollectionRun(database, "run-1", true);
    insertCollectionRun(database, "run-2", true);
    insertParentArtifact(database, "raw-1", "run-1");
    insertParentArtifact(database, "raw-2", "run-2");
    insertAttachment(database, {
      id: "attachment-modified-v1",
      parentId: "raw-1",
      uri: "https://office.example/forms/main.pdf",
      digest: "1".repeat(64),
      runId: "run-1",
    });
    insertAttachment(database, {
      id: "attachment-removed-v1",
      parentId: "raw-1",
      uri: "https://office.example/forms/removed.pdf",
      digest: "2".repeat(64),
      runId: "run-1",
    });
    insertAttachment(database, {
      id: "attachment-stable-v1",
      parentId: "raw-1",
      uri: "https://office.example/forms/stable.pdf",
      digest: "3".repeat(64),
      runId: "run-1",
    });
    insertAttachment(database, {
      id: "attachment-modified-v2",
      parentId: "raw-2",
      uri: "https://office.example/forms/main.pdf",
      digest: "4".repeat(64),
      runId: "run-2",
    });
    insertAttachment(database, {
      id: "attachment-added-v2",
      parentId: "raw-2",
      uri: "https://office.example/forms/added.pdf",
      digest: "5".repeat(64),
      runId: "run-2",
    });
    insertAttachment(database, {
      id: "attachment-stable-v2",
      parentId: "raw-2",
      uri: "https://office.example/forms/stable.pdf",
      digest: "3".repeat(64),
      runId: "run-2",
    });

    const evidence = new SqliteDocumentChangeEvidenceRepository(database).feed({
      workspaceId: "workspace-1",
    });
    const updated = evidence.items[1]!;
    expect(updated.coverage.linkedAttachments).toBe(true);
    expect(updated.dimensions).toEqual(
      expect.arrayContaining([
        "ATTACHMENT_ADDED",
        "ATTACHMENT_REMOVED",
        "ATTACHMENT_BINARY_CHANGED",
      ]),
    );
    expect(updated.attachments.before).toHaveLength(3);
    expect(updated.attachments.after).toHaveLength(3);
    expect(updated.attachments.added.map((item) => item.identityUri)).toEqual([
      "https://office.example/forms/added.pdf",
    ]);
    expect(updated.attachments.removed.map((item) => item.identityUri)).toEqual([
      "https://office.example/forms/removed.pdf",
    ]);
    expect(updated.attachments.modified).toHaveLength(1);
    expect(updated.attachments.modified[0]).toMatchObject({
      identityUri: "https://office.example/forms/main.pdf",
      before: { binarySha256: "1".repeat(64) },
      after: { binarySha256: "4".repeat(64) },
    });
    expect(updated.attachments.modified.map((item) => item.identityUri)).not.toContain(
      "https://office.example/forms/stable.pdf",
    );
  });

  it("does not infer attachment changes when either document version lacks attachment collection coverage", () => {
    const database = new DatabaseSync(":memory:");
    const index = new SqliteRetrievalIndexRepository(database);
    const changes = new SqliteDocumentChangeFeedRepository(database);
    const body = "# Rules\nCanonical page text remains identical.";
    const first = indexVersion(index, 1, "Rules", body, {}, "/knowledge/rules.md");
    changes.recordIndexedVersion(first.document, first.chunks);
    const second = indexVersion(index, 2, "Rules", body, {}, "/knowledge/rules.md");
    changes.recordIndexedVersion(second.document, second.chunks);

    installRawArtifactEvidenceTable(database);
    installCollectionRunEvidenceTable(database);
    insertCollectionRun(database, "run-1", false);
    insertCollectionRun(database, "run-2", true);
    insertParentArtifact(database, "raw-1", "run-1");
    insertParentArtifact(database, "raw-2", "run-2");
    insertAttachment(database, {
      id: "attachment-before",
      parentId: "raw-1",
      uri: "https://office.example/forms/before.pdf",
      digest: "6".repeat(64),
      runId: "run-1",
    });
    insertAttachment(database, {
      id: "attachment-after",
      parentId: "raw-2",
      uri: "https://office.example/forms/after.pdf",
      digest: "7".repeat(64),
      runId: "run-2",
    });

    const updated = new SqliteDocumentChangeEvidenceRepository(database).feed({
      workspaceId: "workspace-1",
    }).items[1]!;
    expect(updated.coverage.linkedAttachments).toBe(false);
    expect(updated.attachments.before).toHaveLength(1);
    expect(updated.attachments.after).toHaveLength(1);
    expect(updated.attachments.added).toEqual([]);
    expect(updated.attachments.removed).toEqual([]);
    expect(updated.attachments.modified).toEqual([]);
    expect(updated.dimensions).not.toEqual(
      expect.arrayContaining([
        "ATTACHMENT_ADDED",
        "ATTACHMENT_REMOVED",
        "ATTACHMENT_BINARY_CHANGED",
      ]),
    );
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
