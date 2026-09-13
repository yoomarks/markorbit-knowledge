import { describe, expect, it } from "vitest";
import {
  RETRIEVAL_INDEX_MODE,
  RETRIEVAL_PROTOCOL_VERSION,
  type RetrievalDocument,
  type RetrievalSearchHit,
  type RetrievalSearchRequest,
  type RetrievalSearchResult,
} from "@markorbit/contracts";
import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import {
  resolveCurrentWorkspaceDocument,
  searchWorkspaceRetrievalOverlay,
  type WorkspaceRetrievalReader,
} from "./workspace-retrieval-overlay";

const WORKSPACE_A = "wsp_overlay_a";
const WORKSPACE_B = "wsp_overlay_b";
const SHA = "a".repeat(64);

function document(workspaceId: string, id: string): RetrievalDocument {
  return {
    protocolVersion: RETRIEVAL_PROTOCOL_VERSION,
    objectType: "RETRIEVAL_DOCUMENT",
    documentId: id,
    workspaceId,
    sourceId: `src_${workspaceId}`,
    stagingDocumentId: `stg_${workspaceId}_${id}`,
    readyPackageId: `rp_${workspaceId}_${id}`,
    rawArtifactId: `raw_${workspaceId}_${id}`,
    logicalDocumentId: null,
    artifactVersion: 1,
    title: id,
    targetPath: `${id}.md`,
    canonicalUri: `https://example.test/${id}`,
    sourceUri: `https://example.test/${id}`,
    sourceName: id,
    sourceCategory: "OFFICIAL_GUIDANCE",
    authorityLevel: "PRIMARY_OFFICIAL",
    jurisdictions: ["US"],
    languages: ["en"],
    capturedAt: "2026-09-13T00:00:00.000Z",
    publishedAt: null,
    contentSha256: SHA,
    keywords: [id],
    chunkCount: 1,
    indexedAt: "2026-09-13T00:00:00.000Z",
    isCurrent: true,
  };
}

function hit(workspaceId: string, id: string, score: number): RetrievalSearchHit {
  const doc = document(workspaceId, id);
  return {
    document: doc,
    chunk: {
      protocolVersion: RETRIEVAL_PROTOCOL_VERSION,
      objectType: "RETRIEVAL_CHUNK",
      chunkId: `chunk_${workspaceId}_${id}`,
      documentId: id,
      stagingDocumentId: doc.stagingDocumentId,
      artifactVersion: 1,
      ordinal: 1,
      headingPath: [],
      text: id,
      contentSha256: SHA,
    },
    score,
    snippet: id,
  };
}

function fakeReader(entries: Record<string, RetrievalSearchHit[]>): WorkspaceRetrievalReader {
  const byWorkspace = new Map(
    Object.entries(entries).map(([workspaceId, items]) => [
      workspaceId,
      [...items].sort((left, right) => right.score - left.score),
    ]),
  );
  return {
    search(request: RetrievalSearchRequest): RetrievalSearchResult {
      const items = byWorkspace.get(request.workspaceId) ?? [];
      const offset = request.offset ?? 0;
      const limit = request.limit ?? 25;
      return {
        protocolVersion: RETRIEVAL_PROTOCOL_VERSION,
        objectType: "RETRIEVAL_SEARCH_RESULT",
        indexMode: RETRIEVAL_INDEX_MODE,
        query: request.query,
        items: items.slice(offset, offset + limit),
        total: items.length,
      };
    },
    getDocument(workspaceId: string, documentId: string) {
      return (
        byWorkspace
          .get(workspaceId)
          ?.map((item) => item.document)
          .find((item) => item.documentId === documentId) ?? null
      );
    },
  };
}

describe("workspace retrieval overlay", () => {
  it("merges only the requested private Workspace with Global and preserves relevance order", () => {
    const reader = fakeReader({
      [WORKSPACE_A]: [hit(WORKSPACE_A, "a-high", 9), hit(WORKSPACE_A, "a-low", 3)],
      [WORKSPACE_B]: [hit(WORKSPACE_B, "b-secret", 100)],
      [DEFAULT_WORKSPACE.id]: [hit(DEFAULT_WORKSPACE.id, "global", 7)],
    });

    const result = searchWorkspaceRetrievalOverlay(reader, {
      workspaceId: WORKSPACE_A,
      query: "trademark",
      limit: 10,
    });

    expect(result.items.map((item) => item.document.documentId)).toEqual([
      "a-high",
      "global",
      "a-low",
    ]);
    expect(result.items.some((item) => item.document.workspaceId === WORKSPACE_B)).toBe(false);
    expect(result.total).toBe(3);
  });

  it("keeps Global queries Global-only and prefers private content on equal scores", () => {
    const reader = fakeReader({
      [WORKSPACE_A]: [hit(WORKSPACE_A, "local", 5)],
      [DEFAULT_WORKSPACE.id]: [hit(DEFAULT_WORKSPACE.id, "global", 5)],
    });
    const privateResult = searchWorkspaceRetrievalOverlay(reader, {
      workspaceId: WORKSPACE_A,
      query: "same",
      limit: 10,
    });
    expect(privateResult.items.map((item) => item.document.documentId)).toEqual([
      "local",
      "global",
    ]);

    const globalResult = searchWorkspaceRetrievalOverlay(reader, {
      workspaceId: DEFAULT_WORKSPACE.id,
      query: "same",
      limit: 10,
    });
    expect(globalResult.items.map((item) => item.document.documentId)).toEqual(["global"]);
  });

  it("paginates across more than one primitive retrieval page per scope", () => {
    const local = Array.from({ length: 60 }, (_, index) =>
      hit(WORKSPACE_A, `local-${index}`, 200 - index * 2),
    );
    const global = Array.from({ length: 60 }, (_, index) =>
      hit(DEFAULT_WORKSPACE.id, `global-${index}`, 199 - index * 2),
    );
    const result = searchWorkspaceRetrievalOverlay(
      fakeReader({ [WORKSPACE_A]: local, [DEFAULT_WORKSPACE.id]: global }),
      {
        workspaceId: WORKSPACE_A,
        query: "page",
        offset: 50,
        limit: 10,
      },
    );
    expect(result.items).toHaveLength(10);
    expect(result.items[0]?.document.documentId).toBe("local-25");
    expect(result.items[9]?.document.documentId).toBe("global-29");
    expect(result.total).toBe(120);
  });

  it("resolves current documents from private first, then Global, without exposing another Workspace", () => {
    const reader = fakeReader({
      [WORKSPACE_A]: [hit(WORKSPACE_A, "local", 2)],
      [WORKSPACE_B]: [hit(WORKSPACE_B, "b-only", 2)],
      [DEFAULT_WORKSPACE.id]: [hit(DEFAULT_WORKSPACE.id, "public", 1)],
    });
    expect(resolveCurrentWorkspaceDocument(reader, WORKSPACE_A, "local")?.workspaceId).toBe(
      WORKSPACE_A,
    );
    expect(resolveCurrentWorkspaceDocument(reader, WORKSPACE_A, "public")?.workspaceId).toBe(
      DEFAULT_WORKSPACE.id,
    );
    expect(resolveCurrentWorkspaceDocument(reader, WORKSPACE_A, "b-only")).toBeNull();
    expect(resolveCurrentWorkspaceDocument(reader, DEFAULT_WORKSPACE.id, "local")).toBeNull();
  });
});
