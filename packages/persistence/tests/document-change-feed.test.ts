import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { CanonicalMarkdownMetadataV1 } from "@markorbit/contracts";
import { SqliteDocumentChangeFeedRepository } from "../src/document-change-feed";
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
    capturedAt: `2026-08-${String(version).padStart(2, "0")}T00:00:00.000Z`,
    publishedAt: null,
    conversionRunId: `cvr_${String(version).padStart(26, "0")}`,
    converterId: "builtin-html-markdown",
    converterVersion: "1.0.0",
    inputSha256: String(version).repeat(64).slice(0, 64),
  };
}

function canonicalMarkdown(version: number, body: string): Uint8Array {
  return encoder.encode(
    `---\nmarkorbit:\n  schemaVersion: "1.0"\n  artifactVersion: ${version}\n---\n\n${body}\n`,
  );
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function indexVersion(retrieval: SqliteRetrievalIndexRepository, version: number, body: string) {
  const markdown = canonicalMarkdown(version, body);
  return retrieval.indexVerified({
    metadata: metadata(version),
    stagingDocumentId: `std_${String(version).padStart(26, "0")}`,
    readyPackageId: `rdp_${String(version).padStart(26, "0")}`,
    title: "Maintaining your trademark registration",
    targetPath: `US/USPTO/maintenance-v${version}.md`,
    contentSha256: sha256(markdown),
    canonicalMarkdown: markdown,
  });
}

const versionOne = `# Maintenance

Official maintenance overview.

## Filing information

File the required maintenance documents through the official service.`;

const versionTwo = `# Maintenance

Official maintenance overview.

## Filing information

File maintenance documents through the current official filing service.

## Evidence examples

The source provides examples of supporting evidence.`;

describe("document change feed", () => {
  it("emits CREATED and UPDATED events with objective section diffs", () => {
    const database = new DatabaseSync(":memory:");
    const retrieval = new SqliteRetrievalIndexRepository(
      database,
      () => new Date("2026-08-09T01:00:00.000Z"),
    );
    const changes = new SqliteDocumentChangeFeedRepository(database);

    const first = indexVersion(retrieval, 1, versionOne);
    const created = changes.recordIndexedVersion(first.document, first.chunks);
    expect(created.event?.changeKind).toBe("CREATED");
    expect(created.event?.fromVersion).toBeNull();
    expect(created.event?.toVersion).toBe(1);
    expect(created.event?.summary.addedSections).toBeGreaterThan(0);

    const second = indexVersion(retrieval, 2, versionTwo);
    const updated = changes.recordIndexedVersion(second.document, second.chunks);
    expect(updated.event?.changeKind).toBe("UPDATED");
    expect(updated.event?.fromVersion).toBe(1);
    expect(updated.event?.summary.modifiedSections).toBe(1);
    expect(updated.event?.summary.addedSections).toBe(1);

    const diff = changes.compareVersions(workspaceId, documentId, 1, 2);
    expect(diff.changeKind).toBe("UPDATED");
    expect(diff.summary).toEqual(updated.event?.summary);
    expect(diff.sections.some((section) => section.changeKind === "MODIFIED")).toBe(true);
    expect(diff.sections.some((section) => section.changeKind === "ADDED")).toBe(true);
    expect(diff.sections.every((section) => section.beforeText !== section.afterText)).toBe(true);

    database.close();
  });

  it("treats metadata-only canonical changes as UNCHANGED source content", () => {
    const database = new DatabaseSync(":memory:");
    const retrieval = new SqliteRetrievalIndexRepository(database);
    const changes = new SqliteDocumentChangeFeedRepository(database);

    const first = indexVersion(retrieval, 1, versionOne);
    changes.recordIndexedVersion(first.document, first.chunks);
    const second = indexVersion(retrieval, 2, versionOne);
    expect(second.document.contentSha256).not.toBe(first.document.contentSha256);

    const unchanged = changes.recordIndexedVersion(second.document, second.chunks);
    expect(unchanged.event?.changeKind).toBe("UNCHANGED");
    expect(unchanged.event?.summary.changedSections).toBe(0);

    const diff = changes.compareVersions(workspaceId, documentId, 1, 2);
    expect(diff.changeKind).toBe("UNCHANGED");
    expect(diff.sections).toEqual([]);

    database.close();
  });

  it("supports idempotent recording and monotonic cursor delivery", () => {
    const database = new DatabaseSync(":memory:");
    const retrieval = new SqliteRetrievalIndexRepository(database);
    const changes = new SqliteDocumentChangeFeedRepository(database);

    const first = indexVersion(retrieval, 1, versionOne);
    const firstEvent = changes.recordIndexedVersion(first.document, first.chunks);
    const replay = changes.recordIndexedVersion(first.document, first.chunks);
    expect(replay.replayed).toBe(true);
    expect(replay.event?.id).toBe(firstEvent.event?.id);

    const second = indexVersion(retrieval, 2, versionTwo);
    changes.recordIndexedVersion(second.document, second.chunks);

    const pageOne = changes.feed({ workspaceId, limit: 1 });
    expect(pageOne.items).toHaveLength(1);
    expect(pageOne.nextCursor).toMatch(/^cf_\d+$/);
    const pageTwo = changes.feed({ workspaceId, cursor: pageOne.nextCursor ?? undefined });
    expect(pageTwo.items).toHaveLength(1);
    expect(pageTwo.items[0]?.sequence).toBeGreaterThan(pageOne.items[0]?.sequence ?? 0);

    database.close();
  });

  it("does not emit an event for a historical version indexed after a newer current version", () => {
    const database = new DatabaseSync(":memory:");
    const retrieval = new SqliteRetrievalIndexRepository(database);
    const changes = new SqliteDocumentChangeFeedRepository(database);

    const third = indexVersion(retrieval, 3, versionTwo);
    changes.recordIndexedVersion(third.document, third.chunks);
    const historical = indexVersion(retrieval, 2, versionOne);
    expect(historical.document.isCurrent).toBe(false);
    expect(changes.recordIndexedVersion(historical.document, historical.chunks).event).toBeNull();
    expect(changes.feed({ workspaceId }).items).toHaveLength(1);

    database.close();
  });
});
