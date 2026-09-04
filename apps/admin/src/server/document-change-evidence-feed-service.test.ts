import { describe, expect, it, vi } from "vitest";
import type {
  DocumentChangeEvidenceFeedRequest,
  DocumentChangeEvidenceFeedResult,
  RetrievalChunk,
} from "@markorbit/contracts";
import type { RetrievalIndexRepository } from "@markorbit/persistence/retrieval-index";
import {
  readDocumentChangeEvidenceFeedForStaging,
  resolveDurableDocumentIdFromStaging,
} from "./document-change-evidence-feed-service";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const stagingDocumentId = "stg_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const documentId = "doc_01ARZ3NDEKTSV4RRFFQ69G5FAV";

function retrievalChunk(stableDocumentId = documentId): RetrievalChunk {
  return {
    documentId: stableDocumentId,
    stagingDocumentId,
  } as unknown as RetrievalChunk;
}

function retrieval(chunks: RetrievalChunk[]) {
  return {
    listChunks: vi.fn(() => chunks),
  } as unknown as Pick<RetrievalIndexRepository, "listChunks">;
}

function evidenceReader() {
  return {
    feed: vi.fn((request: DocumentChangeEvidenceFeedRequest) => {
      void request;
      return { items: [], nextCursor: null } as unknown as DocumentChangeEvidenceFeedResult;
    }),
  };
}

describe("Knowledge Evidence Change Review durable identity", () => {
  it("maps a staging document to one durable document id and feeds evidence with workspace scope", () => {
    const index = retrieval([retrievalChunk(), retrievalChunk()]);
    const evidence = evidenceReader();

    const result = readDocumentChangeEvidenceFeedForStaging(index, evidence, {
      workspaceId,
      stagingDocumentId,
      limit: 25,
    });

    expect(index.listChunks).toHaveBeenCalledWith(stagingDocumentId, workspaceId);
    expect(evidence.feed).toHaveBeenCalledWith({
      workspaceId,
      documentId,
      cursor: undefined,
      limit: 25,
    });
    expect(result.documentId).toBe(documentId);
  });

  it("fails closed when the staging document has no workspace-scoped retrieval identity", () => {
    const index = retrieval([]);
    const evidence = evidenceReader();

    expect(() =>
      readDocumentChangeEvidenceFeedForStaging(index, evidence, {
        workspaceId,
        stagingDocumentId,
      }),
    ).toThrow(/No durable retrieval identity/);
    expect(evidence.feed).not.toHaveBeenCalled();
  });

  it("fails closed when one staging version resolves to multiple durable document ids", () => {
    const index = retrieval([
      retrievalChunk("doc_01ARZ3NDEKTSV4RRFFQ69G5FAV"),
      retrievalChunk("doc_01ARZ3NDEKTSV4RRFFQ69G5FAW"),
    ]);

    expect(() =>
      resolveDurableDocumentIdFromStaging(index, workspaceId, stagingDocumentId),
    ).toThrow(/multiple durable document identities/);
  });

  it("does not borrow a retrieval identity from another workspace", () => {
    const otherWorkspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAW";
    const index = {
      listChunks: vi.fn((requestedStagingId: string, requestedWorkspaceId: string) => {
        if (requestedStagingId === stagingDocumentId && requestedWorkspaceId === workspaceId) {
          return [retrievalChunk()];
        }
        return [];
      }),
    } as unknown as Pick<RetrievalIndexRepository, "listChunks">;
    const evidence = evidenceReader();

    expect(() =>
      readDocumentChangeEvidenceFeedForStaging(index, evidence, {
        workspaceId: otherWorkspaceId,
        stagingDocumentId,
      }),
    ).toThrow(/No durable retrieval identity/);
    expect(index.listChunks).toHaveBeenCalledWith(stagingDocumentId, otherWorkspaceId);
    expect(evidence.feed).not.toHaveBeenCalled();
  });
});
