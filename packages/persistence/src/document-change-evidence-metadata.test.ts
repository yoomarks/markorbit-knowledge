import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { CanonicalMarkdownMetadataV1 } from "@markorbit/contracts";
import { describe, expect, it } from "vitest";
import { SqliteDocumentChangeEvidenceRepository } from "./document-change-evidence";
import { SqliteDocumentChangeFeedRepository } from "./document-change-feed";
import { SqliteRetrievalIndexRepository } from "./retrieval-index";

const body = new TextEncoder().encode("---\ntest: true\n---\n# Rules\nThe filing rule is unchanged.\n");

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function metadata(version: number, publishedAt: string | null): CanonicalMarkdownMetadataV1 {
  return {
    schemaVersion: "1.0",
    objectType: "CANONICAL_MARKDOWN_METADATA",
    documentId: "document-metadata",
    workspaceId: "workspace-1",
    sourceId: "source-1",
    sourceName: "Official Office",
    sourceCategory: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    jurisdictions: version === 1 ? ["US", "EU"] : ["EU", "US"],
    languages: ["en"],
    rawArtifactId: `raw-metadata-${version}`,
    logicalDocumentId: "logical-metadata",
    artifactVersion: version,
    artifactKind: "HTML",
    originalName: `metadata-${version}.html`,
    canonicalUri: "https://office.example/rules",
    sourceUri: "https://office.example/rules",
    capturedAt: `2026-08-${String(version).padStart(2, "0")}T00:00:00.000Z`,
    publishedAt,
    conversionRunId: `conversion-metadata-${version}`,
    converterId: "test-converter",
    converterVersion: "1.0.0",
    inputSha256: "b".repeat(64),
  };
}

describe("document change evidence metadata-only updates", () => {
  it("does not confuse metadata changes or array order with content changes", () => {
    const database = new DatabaseSync(":memory:");
    const index = new SqliteRetrievalIndexRepository(database);
    const changes = new SqliteDocumentChangeFeedRepository(database);

    const first = index.indexVerified({
      metadata: metadata(1, null),
      stagingDocumentId: "staging-metadata-1",
      readyPackageId: "ready-metadata-1",
      title: "Rules",
      targetPath: "/knowledge/rules.md",
      contentSha256: sha256(body),
      canonicalMarkdown: body,
    });
    changes.recordIndexedVersion(first.document, first.chunks);

    const second = index.indexVerified({
      metadata: metadata(2, "2026-08-19T00:00:00.000Z"),
      stagingDocumentId: "staging-metadata-2",
      readyPackageId: "ready-metadata-2",
      title: "Rules",
      targetPath: "/knowledge/rules.md",
      contentSha256: sha256(body),
      canonicalMarkdown: body,
    });
    const event = changes.recordIndexedVersion(second.document, second.chunks).event;
    expect(event?.changeKind).toBe("UNCHANGED");

    const evidence = new SqliteDocumentChangeEvidenceRepository(database).feed({
      workspaceId: "workspace-1",
      cursor: "ce_1",
    }).items[0]!;

    expect(evidence.changeKind).toBe("UNCHANGED");
    expect(evidence.dimensions).toEqual(["METADATA_CHANGED"]);
    expect(evidence.metadataChanges).toEqual([
      { field: "publishedAt", before: null, after: "2026-08-19T00:00:00.000Z" },
    ]);
    expect(evidence.links).toEqual({ added: [], removed: [] });
    expect(evidence.sections).toEqual([]);
  });
});
