import type { DatabaseSync } from "node:sqlite";
import type {
  DocumentChangeEvidenceFeedRequest,
  DocumentChangeEvidenceFeedResult,
} from "@markorbit/contracts";
import { RegistryError, RegistryValidationError } from "@markorbit/persistence";
import { SqliteDocumentChangeEvidenceRepository } from "@markorbit/persistence/document-change-evidence";
import type { RetrievalIndexRepository } from "@markorbit/persistence/retrieval-index";

function optional(value: string | null): string | undefined {
  return value?.trim() || undefined;
}

function positiveLimit(value: string | null): number | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const limit = Number(normalized);
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RegistryValidationError("limit query parameter must be a positive integer");
  }
  return limit;
}

export function parseDocumentChangeEvidenceFeedRequest(
  requestUrl: string,
): DocumentChangeEvidenceFeedRequest {
  const search = new URL(requestUrl).searchParams;
  const workspaceId = search.get("workspaceId")?.trim();
  if (!workspaceId) {
    throw new RegistryValidationError("workspaceId query parameter is required");
  }
  return {
    workspaceId,
    cursor: optional(search.get("cursor")),
    sourceId: optional(search.get("sourceId")),
    documentId: optional(search.get("documentId")),
    limit: positiveLimit(search.get("limit")),
  };
}

export function buildDocumentChangeEvidenceFeed(
  database: DatabaseSync,
  request: DocumentChangeEvidenceFeedRequest,
): DocumentChangeEvidenceFeedResult {
  return new SqliteDocumentChangeEvidenceRepository(database).feed(request);
}

type RetrievalIndexReader = Pick<RetrievalIndexRepository, "listChunks">;

type DocumentChangeEvidenceReader = {
  feed(request: DocumentChangeEvidenceFeedRequest): DocumentChangeEvidenceFeedResult;
};

export type StagingDocumentChangeEvidenceFeedRequest = {
  workspaceId: string;
  stagingDocumentId: string;
  cursor?: string;
  limit?: number;
};

export type StagingDocumentChangeEvidenceFeedResult = {
  documentId: string;
  feed: DocumentChangeEvidenceFeedResult;
};

export function resolveDurableDocumentIdFromStaging(
  retrieval: RetrievalIndexReader,
  workspaceId: string,
  stagingDocumentId: string,
): string {
  const documentIds = new Set(
    retrieval
      .listChunks(stagingDocumentId, workspaceId)
      .map((chunk) => chunk.documentId.trim())
      .filter(Boolean),
  );

  if (documentIds.size === 0) {
    throw new RegistryError(
      "KNOWLEDGE_CHANGE_REVIEW_RETRIEVAL_IDENTITY_NOT_FOUND",
      `No durable retrieval identity was found for Knowledge document ${stagingDocumentId}`,
    );
  }
  if (documentIds.size > 1) {
    throw new RegistryError(
      "KNOWLEDGE_CHANGE_REVIEW_RETRIEVAL_IDENTITY_CONFLICT",
      `Knowledge document ${stagingDocumentId} resolved to multiple durable document identities`,
    );
  }

  return [...documentIds][0]!;
}

export function readDocumentChangeEvidenceFeedForStaging(
  retrieval: RetrievalIndexReader,
  evidence: DocumentChangeEvidenceReader,
  request: StagingDocumentChangeEvidenceFeedRequest,
): StagingDocumentChangeEvidenceFeedResult {
  const documentId = resolveDurableDocumentIdFromStaging(
    retrieval,
    request.workspaceId,
    request.stagingDocumentId,
  );
  const feed = evidence.feed({
    workspaceId: request.workspaceId,
    documentId,
    cursor: request.cursor,
    limit: request.limit,
  });
  return { documentId, feed };
}

export function buildDocumentChangeEvidenceFeedForStaging(
  database: DatabaseSync,
  retrieval: RetrievalIndexReader,
  request: StagingDocumentChangeEvidenceFeedRequest,
): StagingDocumentChangeEvidenceFeedResult {
  return readDocumentChangeEvidenceFeedForStaging(
    retrieval,
    new SqliteDocumentChangeEvidenceRepository(database),
    request,
  );
}
