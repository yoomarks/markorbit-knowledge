import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { CanonicalMarkdownMetadataV1 } from "@markorbit/contracts";
import { SqliteRetrievalIndexRepository } from "../src/retrieval-index";
import { SqliteRetrievalQualityAuditRepository } from "../src/retrieval-quality-audit";
import { SqliteRetrievalRemediationExecutionRepository } from "../src/retrieval-remediation-execution";

const encoder = new TextEncoder();
const workspaceId = "wsp_01H00000000000000000000000";
const sourceId = "src_01H00000000000000000000000";
const documentId = "doc-controlled-remediation";

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
    originalName: `controlled-v${version}.html`,
    canonicalUri: "https://example.gov/trademarks/controlled",
    sourceUri: "https://example.gov/trademarks/controlled",
    capturedAt: `2026-08-0${version}T00:00:00.000Z`,
    publishedAt: null,
    conversionRunId: `cvr_${String(version).padStart(26, "0")}`,
    converterId: "builtin-html-markdown",
    converterVersion: "1.0.0",
    inputSha256: String(version).repeat(64).slice(0, 64),
  };
}

function canonicalMarkdown(version: number): Uint8Array {
  return encoder.encode(
    `---\nmarkorbit:\n  schemaVersion: "1.0"\n---\n\n# Controlled remediation ${version}\n\nEvidence introduction for version ${version}.\n\n## Filing evidence\n\nOfficial filing evidence and requirements for version ${version}.\n\n## Maintenance evidence\n\nOfficial maintenance evidence and requirements for version ${version}.\n`,
  );
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function indexVersion(database: DatabaseSync, version: number) {
  const markdown = canonicalMarkdown(version);
  return new SqliteRetrievalIndexRepository(database).indexVerified({
    metadata: metadata(version),
    stagingDocumentId: `std_${String(version).padStart(26, "0")}`,
    readyPackageId: `rdp_${String(version).padStart(26, "0")}`,
    title: `Controlled remediation ${version}`,
    targetPath: `US/controlled-v${version}.md`,
    contentSha256: sha256(markdown),
    canonicalMarkdown: markdown,
  });
}

describe("controlled retrieval remediation execution", () => {
  it("requires explicit approval, rebuilds only the FTS projection, and records an idempotent ledger entry", () => {
    const database = new DatabaseSync(":memory:");
    indexVersion(database, 1);
    database.exec(
      "DELETE FROM retrieval_chunks_fts WHERE rowid = (SELECT MIN(rowid) FROM retrieval_chunks_fts)",
    );
    const repository = new SqliteRetrievalRemediationExecutionRepository(
      database,
      () => new Date("2026-08-09T16:00:00.000Z"),
    );
    const input = {
      workspaceId,
      stagingDocumentId: "std_00000000000000000000000001",
      actionCode: "REBUILD_RETRIEVAL_INDEX" as const,
      actorId: "operator:mile",
      idempotencyKey: "m17-fts-1",
      approved: true,
    };

    expect(() => repository.execute({ ...input, approved: false })).toThrow(
      /requires approved=true/i,
    );

    const execution = repository.execute(input);
    expect(execution.replayed).toBe(false);
    expect(execution.approvalMode).toBe("EXPLICIT_OPERATOR");
    expect(execution.beforeGaps).toContain("FTS_ROW_COUNT_MISMATCH");
    expect(execution.afterGaps).not.toContain("FTS_ROW_COUNT_MISMATCH");
    expect(execution.effects[0]).toMatch(/Rebuilt \d+ FTS projection rows/);

    const replay = repository.execute(input);
    expect(replay.replayed).toBe(true);
    expect(replay.executionId).toBe(execution.executionId);
    expect(repository.list(workspaceId).items).toHaveLength(1);
  });

  it("reconciles the current-version projection to the latest persisted artifact version", () => {
    const database = new DatabaseSync(":memory:");
    indexVersion(database, 1);
    indexVersion(database, 2);
    database
      .prepare(
        "UPDATE retrieval_documents SET is_current = 1 WHERE workspace_id = ? AND document_id = ?",
      )
      .run(workspaceId, documentId);

    const repository = new SqliteRetrievalRemediationExecutionRepository(database);
    const execution = repository.execute({
      workspaceId,
      stagingDocumentId: "std_00000000000000000000000002",
      actionCode: "RECONCILE_CURRENT_VERSION",
      actorId: "operator:mile",
      idempotencyKey: "m17-version-1",
      approved: true,
    });

    expect(execution.beforeGaps).toContain("MULTIPLE_CURRENT_VERSIONS");
    expect(execution.afterGaps).not.toContain("MULTIPLE_CURRENT_VERSIONS");
    const current = database
      .prepare(
        "SELECT artifact_version FROM retrieval_documents WHERE workspace_id = ? AND document_id = ? AND is_current = 1",
      )
      .all(workspaceId, documentId) as Array<{ artifact_version: number }>;
    expect(current.map((row) => Number(row.artifact_version))).toEqual([2]);

    expect(() =>
      repository.execute({
        workspaceId,
        stagingDocumentId: "std_00000000000000000000000002",
        actionCode: "REBUILD_RETRIEVAL_INDEX",
        actorId: "operator:mile",
        idempotencyKey: "m17-version-1",
        approved: true,
      }),
    ).toThrow(/already bound to a different remediation execution/i);
  });

  it("refuses structural chunk repair and provenance restoration because they require governed upstream evidence", () => {
    const database = new DatabaseSync(":memory:");
    indexVersion(database, 1);
    const stagingDocumentId = "std_00000000000000000000000001";
    database
      .prepare(
        "UPDATE retrieval_documents SET chunk_count = chunk_count + 1 WHERE staging_document_id = ?",
      )
      .run(stagingDocumentId);

    const audit = new SqliteRetrievalQualityAuditRepository(database).list({ workspaceId })
      .items[0];
    expect(audit.gaps).toContain("CHUNK_COUNT_MISMATCH");
    expect(audit.gaps).toContain("STAGING_DOCUMENT_MISSING");

    const repository = new SqliteRetrievalRemediationExecutionRepository(database);
    expect(() =>
      repository.execute({
        workspaceId,
        stagingDocumentId,
        actionCode: "REBUILD_RETRIEVAL_INDEX",
        actorId: "operator:mile",
        idempotencyKey: "m17-structural-1",
        approved: true,
      }),
    ).toThrow(/requires reindexing from verified canonical Markdown/i);

    expect(() =>
      repository.execute({
        workspaceId,
        stagingDocumentId,
        actionCode: "RESTORE_PROVENANCE_EVIDENCE",
        actorId: "operator:mile",
        idempotencyKey: "m17-provenance-1",
        approved: true,
      }),
    ).toThrow(/requires governed evidence recovery/i);
    expect(repository.list(workspaceId).items).toHaveLength(0);
  });
});
