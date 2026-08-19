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
) {
  const bytes = new TextEncoder().encode(`---\ntest: true\n---\n${body}\n`);
  return index.indexVerified({
    metadata: metadata(version, overrides),
    stagingDocumentId: `staging-${version}`,
    readyPackageId: `ready-${version}`,
    title,
    targetPath: `/knowledge/rules-${version}.md`,
    contentSha256: sha256(bytes),
    canonicalMarkdown: bytes,
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
    expect(created.dimensions).toContain("DOCUMENT_CREATED");
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
