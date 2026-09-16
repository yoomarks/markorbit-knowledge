import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { CanonicalMarkdownMetadataV1 } from "@markorbit/contracts";
import { DEFAULT_WORKSPACE, SqliteSourceRepository } from "@markorbit/persistence";
import { projectCurrentGovernedKnowledge } from "@markorbit/persistence/current-governed-knowledge";
import { SqliteRetrievalIndexRepository } from "@markorbit/persistence/retrieval-index";
import { SqliteWorkspaceRepository } from "@markorbit/persistence/workspaces";
import { isCurrentBrainReadyStaging } from "./knowledge-brain-ready-export";
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

function ensureGovernedProjectionFixture(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE staging_documents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_id TEXT NOT NULL
    ) STRICT;
    CREATE TABLE ready_packages (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      document_json TEXT NOT NULL
    ) STRICT;
  `);
}

function seedGovernedProjectionEvidence(
  database: DatabaseSync,
  workspaceId: string,
  sourceId: string,
  ordinal: number,
) {
  const id = String(ordinal).padStart(26, "0");
  const stagingDocumentId = `std_${id}`;
  const readyPackageId = `rdp_${id}`;
  database
    .prepare("INSERT INTO staging_documents (id, workspace_id, source_id) VALUES (?, ?, ?)")
    .run(stagingDocumentId, workspaceId, sourceId);
  database
    .prepare("INSERT INTO ready_packages (id, workspace_id, document_json) VALUES (?, ?, ?)")
    .run(
      readyPackageId,
      workspaceId,
      JSON.stringify({
        id: readyPackageId,
        workspaceId,
        status: "VERIFIED",
        evidence: { stagingDocumentId, verificationOutcome: "PASS" },
        createdAt: "2026-09-13T09:01:00.000Z",
      }),
    );
}

function index(
  database: DatabaseSync,
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
  seedGovernedProjectionEvidence(database, workspaceId, sourceId, ordinal);
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

    ensureGovernedProjectionFixture(database);
    const retrieval = new SqliteRetrievalIndexRepository(database);
    index(database, retrieval, WORKSPACE_A, sourceA.id, 11, "doc-shared");
    index(database, retrieval, WORKSPACE_B, sourceB.id, 12, "doc-b-only");
    index(database, retrieval, DEFAULT_WORKSPACE.id, sourceGlobal.id, 13, "doc-shared");

    expect(
      isCurrentBrainReadyStaging(database, WORKSPACE_A, `std_${String(11).padStart(26, "0")}`),
    ).toBe(true);
    expect(
      isCurrentBrainReadyStaging(
        database,
        DEFAULT_WORKSPACE.id,
        `std_${String(13).padStart(26, "0")}`,
      ),
    ).toBe(true);
    expect(
      projectCurrentGovernedKnowledge(database, {
        workspaceId: WORKSPACE_A,
        stagingDocumentId: `std_${String(11).padStart(26, "0")}`,
        viewerWorkspaceId: WORKSPACE_A,
      }),
    ).toMatchObject({
      states: { current: true, verified: true, consumerAdmissible: true, delivered: false },
      reasonCodes: [],
    });

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
    expect(
      isCurrentBrainReadyStaging(database, WORKSPACE_A, `std_${String(11).padStart(26, "0")}`),
    ).toBe(false);
    expect(
      projectCurrentGovernedKnowledge(database, {
        workspaceId: WORKSPACE_A,
        stagingDocumentId: `std_${String(11).padStart(26, "0")}`,
        viewerWorkspaceId: WORKSPACE_A,
      }),
    ).toMatchObject({
      states: { current: true, verified: true, consumerAdmissible: false, delivered: false },
      reasonCodes: ["WORKSPACE_INACTIVE"],
    });
    expect(
      isCurrentBrainReadyStaging(
        database,
        DEFAULT_WORKSPACE.id,
        `std_${String(13).padStart(26, "0")}`,
      ),
    ).toBe(true);
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
      isCurrentBrainReadyStaging(
        database,
        DEFAULT_WORKSPACE.id,
        `std_${String(13).padStart(26, "0")}`,
      ),
    ).toBe(false);
    expect(
      projectCurrentGovernedKnowledge(database, {
        workspaceId: DEFAULT_WORKSPACE.id,
        stagingDocumentId: `std_${String(13).padStart(26, "0")}`,
        viewerWorkspaceId: DEFAULT_WORKSPACE.id,
      }),
    ).toMatchObject({
      states: { current: true, verified: true, consumerAdmissible: false, delivered: false },
      reasonCodes: ["SOURCE_ARCHIVED"],
    });
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
