import type { DatabaseSync } from "node:sqlite";
import type {
  DocumentChangeEvidenceFeedRequest,
  DocumentChangeEvidenceFeedResult,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteDocumentChangeEvidenceRepository } from "@markorbit/persistence/document-change-evidence";

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
