import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { CanonicalMarkdownMetadataV1 } from "@markorbit/contracts";
import { SqliteRetrievalIndexRepository } from "../src/retrieval-index";

const encoder = new TextEncoder();
const workspaceId = "wsp_01H00000000000000000000000";
const sourceId = "src_01H00000000000000000000000";
const documentId = "doc-uspto-maintenance";

function metadata(version: number): CanonicalMarkdownMetadataV1 {
  return {
    schemaVersion: "1.0",
    objectType: "CANONICAL_MARKDOWN_METADATA",
    documentId,
    workspaceId,
    sourceId,
    sourceName: "USPTO Trademark Maintenance",
    sourceCategory: "OFFICIAL_GUIDANCE",
    authorityLevel: "PRIMARY_OFFICIAL",
    jurisdictions: ["US"],
    languages: ["en"],
    rawArtifactId: `art_${String(version).padStart(26, "0")}`,
    logicalDocumentId: documentId,
    artifactVersion: version,
    artifactKind: "HTML",
    originalName: `maintenance-v${version}.html`,
    canonicalUri: "https://www.uspto.gov/trademarks/maintain",
    sourceUri: "https://www.uspto.gov/trademarks/maintain",
    capturedAt: `2026-08-0${version}T00:00:00.000Z`,
    publishedAt: null,
    conversionRunId: `cvr_${String(version).padStart(26, "0")}`,
    converterId: "builtin-html-markdown",
    converterVersion: "1.0.0",
    inputSha256: String(version).repeat(64).slice(0, 64),
  };
}

function canonicalMarkdown(body: string): Uint8Array {
  return encoder.encode(`---\nmarkorbit:\n  schemaVersion: "1.0"\n---\n\n${body}\n`);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function indexVersion(repository: SqliteRetrievalIndexRepository, version: number, body: string) {
  const markdown = canonicalMarkdown(body);
  return repository.indexVerified({
    metadata: metadata(version),
    stagingDocumentId: `std_${String(version).padStart(26, "0")}`,
    readyPackageId: `rdp_${String(version).padStart(26, "0")}`,
    title: "Maintaining your trademark registration",
    targetPath: `US/USPTO/maintenance-v${version}.md`,
    contentSha256: sha256(markdown),
    canonicalMarkdown: markdown,
  });
}

describe("retrieval index", () => {
  it("chunks canonical Markdown, extracts lexical keywords and searches with BM25", () => {
    const repository = new SqliteRetrievalIndexRepository(
      new DatabaseSync(":memory:"),
      () => new Date("2026-08-09T00:00:00.000Z"),
    );
    const indexed = indexVersion(
      repository,
      1,
      `# Trademark maintenance\n\n## Section 8 declaration\n\nA Section 8 declaration is a maintenance filing for a registered trademark.\n\n## Filing information\n\nReview the official maintenance filing information before submission.`,
    );

    expect(indexed.replayed).toBe(false);
    expect(indexed.document.chunkCount).toBeGreaterThanOrEqual(2);
    expect(indexed.document.keywords).toContain("maintenance");
    expect(
      indexed.chunks.some((chunk) => chunk.headingPath.includes("Section 8 declaration")),
    ).toBe(true);

    const result = repository.search({ workspaceId, query: "Section 8 maintenance" });
    expect(result.indexMode).toBe("SQLITE_FTS5_BM25");
    expect(result.total).toBeGreaterThan(0);
    expect(result.items[0].document.documentId).toBe(documentId);
    expect(result.items[0].chunk.text).toContain("Section 8");

    const filteredOut = repository.search({
      workspaceId,
      query: "Section 8 maintenance",
      jurisdiction: "EU",
    });
    expect(filteredOut.total).toBe(0);
  });

  it("keeps historical versions but searches only the current version", () => {
    const repository = new SqliteRetrievalIndexRepository(
      new DatabaseSync(":memory:"),
      () => new Date("2026-08-09T00:00:00.000Z"),
    );
    indexVersion(
      repository,
      1,
      "# Maintenance\n\nLegacy specimen guidance for maintenance filings.",
    );
    indexVersion(
      repository,
      2,
      "# Maintenance\n\nCurrent renewal and maintenance guidance replaces the legacy wording.",
    );

    const current = repository.getDocument(workspaceId, documentId);
    const historical = repository.getDocument(workspaceId, documentId, 1);
    expect(current?.artifactVersion).toBe(2);
    expect(current?.isCurrent).toBe(true);
    expect(historical?.artifactVersion).toBe(1);
    expect(historical?.isCurrent).toBe(false);

    const currentSearch = repository.search({ workspaceId, query: "renewal maintenance" });
    expect(currentSearch.items.every((item) => item.document.artifactVersion === 2)).toBe(true);

    const legacySearch = repository.search({ workspaceId, query: "specimen guidance" });
    expect(legacySearch.total).toBe(0);
  });

  it("pages through FTS hits beyond the 50-hit retrieval window without changing the exact total", () => {
    const repository = new SqliteRetrievalIndexRepository(
      new DatabaseSync(":memory:"),
      () => new Date("2026-08-09T00:00:00.000Z"),
    );
    const body = Array.from(
      { length: 75 },
      (_, index) =>
        `## Complete search section ${index}\n\nComplete search needle evidence for section ${index}.`,
    ).join("\n\n");
    indexVersion(repository, 1, body);

    const first = repository.search({
      workspaceId,
      query: "complete search needle",
      limit: 50,
    });
    const second = repository.search({
      workspaceId,
      query: "complete search needle",
      limit: 50,
      offset: 50,
    });

    expect(first.total).toBe(75);
    expect(first.items).toHaveLength(50);
    expect(second.total).toBe(75);
    expect(second.items).toHaveLength(25);
    expect(new Set(first.items.map((item) => item.chunk.chunkId)).size).toBe(50);
    expect(second.items.every((item) => !first.items.some((firstItem) => firstItem.chunk.chunkId === item.chunk.chunkId))).toBe(true);
  });

  it("is idempotent for the same verified staging evidence and rejects digest drift", () => {
    const repository = new SqliteRetrievalIndexRepository(new DatabaseSync(":memory:"));
    const markdown = canonicalMarkdown("# USPTO\n\nOfficial trademark maintenance guidance.");
    const input = {
      metadata: metadata(1),
      stagingDocumentId: "std_00000000000000000000000001",
      readyPackageId: "rdp_00000000000000000000000001",
      title: "USPTO maintenance",
      targetPath: "US/USPTO/maintenance.md",
      contentSha256: sha256(markdown),
      canonicalMarkdown: markdown,
    };
    expect(repository.indexVerified(input).replayed).toBe(false);
    expect(repository.indexVerified(input).replayed).toBe(true);

    try {
      repository.indexVerified({
        ...input,
        contentSha256: "f".repeat(64),
      });
      throw new Error("expected digest mismatch");
    } catch (error) {
      expect(error).toMatchObject({ code: "RETRIEVAL_CONTENT_DIGEST_MISMATCH" });
    }
  });
});
