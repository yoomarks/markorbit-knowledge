import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { CanonicalMarkdownMetadataV1 } from "@markorbit/contracts";
import { SqliteRetrievalIndexRepository } from "../src/retrieval-index";
import { SqliteRetrievalQualityAuditRepository } from "../src/retrieval-quality-audit";

const encoder = new TextEncoder();
const workspaceId = "wsp_01H00000000000000000000000";
const sourceId = "src_01H00000000000000000000000";
const documentId = "doc-retrieval-quality-audit";

function metadata(version: number): CanonicalMarkdownMetadataV1 {
  return {
    schemaVersion: "1.0",
    objectType: "CANONICAL_MARKDOWN_METADATA",
    documentId,
    workspaceId,
    sourceId,
    sourceName: "Official Trademark Guidance",
    sourceCategory: "OFFICIAL_GUIDANCE",
    authorityLevel: "PRIMARY_OFFICIAL",
    jurisdictions: ["US"],
    languages: ["en"],
    rawArtifactId: `art_${String(version).padStart(26, "0")}`,
    logicalDocumentId: documentId,
    artifactVersion: version,
    artifactKind: "HTML",
    originalName: `quality-v${version}.html`,
    canonicalUri: "https://example.gov/trademarks/quality",
    sourceUri: "https://example.gov/trademarks/quality",
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

function indexVersion(database: DatabaseSync, version: number) {
  const markdown = canonicalMarkdown(
    `# Trademark quality ${version}\n\nEvidence introduction for version ${version}.\n\n## Filing evidence\n\nOfficial filing evidence and requirements for version ${version}.\n\n## Maintenance evidence\n\nOfficial maintenance evidence and requirements for version ${version}.`,
  );
  return new SqliteRetrievalIndexRepository(database).indexVerified({
    metadata: metadata(version),
    stagingDocumentId: `std_${String(version).padStart(26, "0")}`,
    readyPackageId: `rdp_${String(version).padStart(26, "0")}`,
    title: `Trademark retrieval quality ${version}`,
    targetPath: `US/quality-v${version}.md`,
    contentSha256: sha256(markdown),
    canonicalMarkdown: markdown,
  });
}

describe("retrieval quality audit", () => {
  it("audits chunk and FTS integrity independently from missing provenance evidence", () => {
    const database = new DatabaseSync(":memory:");
    const indexed = indexVersion(database, 1);
    const audit = new SqliteRetrievalQualityAuditRepository(
      database,
      () => new Date("2026-08-09T12:00:00.000Z"),
    ).list({ workspaceId });

    expect(audit.items).toHaveLength(1);
    const item = audit.items[0];
    expect(item.state).toBe("BLOCKED");
    expect(item.gaps).toEqual(
      expect.arrayContaining([
        "STAGING_DOCUMENT_MISSING",
        "READY_PACKAGE_MISSING",
        "RAW_ARTIFACT_MISSING",
      ]),
    );
    expect(item.gaps).not.toContain("CHUNK_COUNT_MISMATCH");
    expect(item.gaps).not.toContain("CHUNK_ORDINAL_GAP");
    expect(item.gaps).not.toContain("FTS_ROW_COUNT_MISMATCH");
    expect(item.metrics.actualChunkCount).toBe(indexed.document.chunkCount);
    expect(item.metrics.ftsRowCount).toBe(indexed.document.chunkCount);
    expect(audit.summary.byState.BLOCKED).toBe(1);
  });

  it("reports only current versions by default and can include history", () => {
    const database = new DatabaseSync(":memory:");
    indexVersion(database, 1);
    indexVersion(database, 2);
    const repository = new SqliteRetrievalQualityAuditRepository(database);

    const current = repository.list({ workspaceId });
    expect(current.items).toHaveLength(1);
    expect(current.items[0].artifactVersion).toBe(2);
    expect(current.items[0].isCurrent).toBe(true);

    const history = repository.list({ workspaceId, includeHistorical: true });
    expect(history.items).toHaveLength(2);
    expect(history.items.map((item) => item.artifactVersion)).toEqual([2, 1]);
    expect(history.filters.includeHistorical).toBe(true);

    const filteredOut = repository.list({ workspaceId, jurisdiction: "WO" });
    expect(filteredOut.items).toHaveLength(0);
  });

  it("detects persisted chunk, ordinal, FTS and duplicate-content drift", () => {
    const database = new DatabaseSync(":memory:");
    indexVersion(database, 1);
    const stagingDocumentId = "std_00000000000000000000000001";

    database
      .prepare(
        "UPDATE retrieval_documents SET chunk_count = chunk_count + 1 WHERE staging_document_id = ?",
      )
      .run(stagingDocumentId);
    database
      .prepare(
        `UPDATE retrieval_chunks
            SET ordinal = ordinal + 10
          WHERE staging_document_id = ?
            AND ordinal = (SELECT MAX(ordinal) FROM retrieval_chunks WHERE staging_document_id = ?)`,
      )
      .run(stagingDocumentId, stagingDocumentId);
    database
      .prepare(
        "UPDATE retrieval_chunks SET text = 'Repeated retrieval content' WHERE staging_document_id = ?",
      )
      .run(stagingDocumentId);
    database.exec(
      "DELETE FROM retrieval_chunks_fts WHERE rowid = (SELECT MIN(rowid) FROM retrieval_chunks_fts)",
    );

    const item = new SqliteRetrievalQualityAuditRepository(database).list({ workspaceId }).items[0];
    expect(item.gaps).toEqual(
      expect.arrayContaining([
        "CHUNK_COUNT_MISMATCH",
        "CHUNK_ORDINAL_GAP",
        "FTS_ROW_COUNT_MISMATCH",
        "DUPLICATE_CHUNK_CONTENT",
      ]),
    );
    expect(item.metrics.distinctChunkTexts).toBe(1);
    expect(item.metrics.ftsRowCount).toBe(item.metrics.actualChunkCount - 1);
  });
});
