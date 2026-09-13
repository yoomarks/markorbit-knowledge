import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { CanonicalMarkdownMetadataV1 } from "@markorbit/contracts";
import { DEFAULT_WORKSPACE, SqliteSourceRepository } from "@markorbit/persistence";
import { SqliteRetrievalIndexRepository } from "@markorbit/persistence/retrieval-index";
import { SqliteWorkspaceRepository } from "@markorbit/persistence/workspaces";
import {
  resolveCurrentWorkspaceDocument,
  searchWorkspaceRetrievalOverlay,
} from "./workspace-retrieval-overlay";

const encoder = new TextEncoder();
const WORKSPACE_A = "wsp_01H00000000000000000000010";
const WORKSPACE_B = "wsp_01H00000000000000000000011";

function source(database: DatabaseSync, workspaceId: string, sourceId: string, slug: string) {
  return new SqliteSourceRepository(database, undefined, () => sourceId).create({
    workspaceId,
    name: slug,
    slug,
    sourceType: "WEB",
    category: "OFFICIAL_GUIDANCE",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    canonicalUri: `https://example.com/${slug}`,
    entrypoints: [{ uri: `https://example.com/${slug}` }],
    tags: [],
  });
}

function metadata(
  workspaceId: string,
  sourceId: string,
  ordinal: number,
  documentId: string,
): CanonicalMarkdownMetadataV1 {
  const id = String(ordinal).padStart(26, "0");
  return {
    schemaVersion: "1.0",
    objectType: "CANONICAL_MARKDOWN_METADATA",
    documentId,
    workspaceId,
    sourceId,
    sourceName: documentId,
    sourceCategory: "OFFICIAL_GUIDANCE",
    authorityLevel: "PRIMARY_OFFICIAL",
    jurisdictions: ["US"],
    languages: ["en"],
    rawArtifactId: `art_${id}`,
    logicalDocumentId: documentId,
    artifactVersion: 1,
    artifactKind: "HTML",
    originalName: `${documentId}.html`,
    canonicalUri: `https://example.com/${documentId}`,
    sourceUri: `https://example.com/${documentId}`,
    capturedAt: "2026-09-13T09:00:00.000Z",
    publishedAt: null,
    conversionRunId: `cvr_${id}`,
    converterId: "overlay-integration-fixture",
    converterVersion: "1.0.0",
    inputSha256: ordinal.toString(16).repeat(64).slice(0, 64),
  };
}

function index(
  retrieval: SqliteRetrievalIndexRepository,
  workspaceId: string,
  sourceId: string,
  ordinal: number,
  documentId: string,
) {
  const markdown = encoder.encode(
    `---\nmarkorbit:\n  schemaVersion: "1.0"\n---\n\n# Orbit overlay\n\nGoverned orbitoverlay evidence.\n`,
  );
  retrieval.indexVerified({
    metadata: metadata(workspaceId, sourceId, ordinal, documentId),
    stagingDocumentId: `std_${String(ordinal).padStart(26, "0")}`,
    readyPackageId: `rdp_${String(ordinal).padStart(26, "0")}`,
    title: `${documentId} orbit overlay evidence`,
    targetPath: `Overlay/${documentId}.md`,
    contentSha256: createHash("sha256").update(markdown).digest("hex"),
    canonicalMarkdown: markdown,
  });
}

describe("workspace retrieval overlay repository integration", () => {
  it("composes private plus Global without cross-private leakage and obeys revocation", () => {
    const database = new DatabaseSync(":memory:");
    new SqliteWorkspaceRepository(database, undefined, () => WORKSPACE_A).create({
      slug: "overlay-a",
      name: "Overlay A",
    });
    new SqliteWorkspaceRepository(database, undefined, () => WORKSPACE_B).create({
      slug: "overlay-b",
      name: "Overlay B",
    });
    const workspaces = new SqliteWorkspaceRepository(database);

    const sourceA = source(database, WORKSPACE_A, "src_00000000000000000000000011", "overlay-a");
    const sourceB = source(database, WORKSPACE_B, "src_00000000000000000000000012", "overlay-b");
    const sourceGlobal = source(
      database,
      DEFAULT_WORKSPACE.id,
      "src_00000000000000000000000013",
      "overlay-global",
    );

    const retrieval = new SqliteRetrievalIndexRepository(database);
    index(retrieval, WORKSPACE_A, sourceA.id, 11, "doc-shared");
    index(retrieval, WORKSPACE_B, sourceB.id, 12, "doc-b-only");
    index(retrieval, DEFAULT_WORKSPACE.id, sourceGlobal.id, 13, "doc-shared");

    const privateResult = searchWorkspaceRetrievalOverlay(retrieval, {
      workspaceId: WORKSPACE_A,
      query: "orbitoverlay",
      limit: 10,
    });
    expect(privateResult.items.map((item) => item.document.workspaceId)).toEqual([
      WORKSPACE_A,
      DEFAULT_WORKSPACE.id,
    ]);
    expect(privateResult.items.some((item) => item.document.workspaceId === WORKSPACE_B)).toBe(
      false,
    );

    const globalResult = searchWorkspaceRetrievalOverlay(retrieval, {
      workspaceId: DEFAULT_WORKSPACE.id,
      query: "orbitoverlay",
      limit: 10,
    });
    expect(globalResult.items.map((item) => item.document.workspaceId)).toEqual([
      DEFAULT_WORKSPACE.id,
    ]);

    expect(resolveCurrentWorkspaceDocument(retrieval, WORKSPACE_A, "doc-shared")?.workspaceId).toBe(
      WORKSPACE_A,
    );
    expect(resolveCurrentWorkspaceDocument(retrieval, WORKSPACE_A, "doc-b-only")).toBeNull();

    const workspaceA = workspaces.getById(WORKSPACE_A)!;
    workspaces.updateStatus(WORKSPACE_A, "SUSPENDED", workspaceA.updatedAt);
    expect(resolveCurrentWorkspaceDocument(retrieval, WORKSPACE_A, "doc-shared")?.workspaceId).toBe(
      DEFAULT_WORKSPACE.id,
    );
    expect(
      searchWorkspaceRetrievalOverlay(retrieval, {
        workspaceId: WORKSPACE_A,
        query: "orbitoverlay",
        limit: 10,
      }).items.map((item) => item.document.workspaceId),
    ).toEqual([DEFAULT_WORKSPACE.id]);

    new SqliteSourceRepository(database).archive(sourceGlobal.id, sourceGlobal.updatedAt);
    expect(
      searchWorkspaceRetrievalOverlay(retrieval, {
        workspaceId: WORKSPACE_A,
        query: "orbitoverlay",
        limit: 10,
      }).total,
    ).toBe(0);
    expect(resolveCurrentWorkspaceDocument(retrieval, WORKSPACE_A, "doc-shared")).toBeNull();
    database.close();
  });
});
