import {
  RETRIEVAL_INDEX_MODE,
  RETRIEVAL_PROTOCOL_VERSION,
  type RetrievalDocument,
  type RetrievalSearchHit,
  type RetrievalSearchRequest,
  type RetrievalSearchResult,
} from "@markorbit/contracts";
import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import type { RetrievalIndexRepository } from "@markorbit/persistence/retrieval-index";

const PAGE_SIZE = 50;

export type WorkspaceRetrievalReader = Pick<RetrievalIndexRepository, "search" | "getDocument">;

export type ResolvedWorkspaceDocument = {
  document: RetrievalDocument;
  workspaceId: string;
};

export function workspaceRetrievalScopes(workspaceId: string): string[] {
  const normalized = workspaceId.trim();
  return normalized === DEFAULT_WORKSPACE.id
    ? [DEFAULT_WORKSPACE.id]
    : [normalized, DEFAULT_WORKSPACE.id];
}

function hitIdentity(hit: RetrievalSearchHit): string {
  return [hit.document.workspaceId, hit.document.stagingDocumentId, hit.chunk.chunkId].join(
    "\u001f",
  );
}

function compareHits(
  requestWorkspaceId: string,
  left: RetrievalSearchHit,
  right: RetrievalSearchHit,
) {
  const score = right.score - left.score;
  if (score !== 0) return score;
  const leftLocal = left.document.workspaceId === requestWorkspaceId ? 0 : 1;
  const rightLocal = right.document.workspaceId === requestWorkspaceId ? 0 : 1;
  if (leftLocal !== rightLocal) return leftLocal - rightLocal;
  if (left.document.artifactVersion !== right.document.artifactVersion) {
    return right.document.artifactVersion - left.document.artifactVersion;
  }
  if (left.chunk.ordinal !== right.chunk.ordinal) return left.chunk.ordinal - right.chunk.ordinal;
  return hitIdentity(left).localeCompare(hitIdentity(right));
}

function searchScope(
  reader: WorkspaceRetrievalReader,
  request: RetrievalSearchRequest,
  workspaceId: string,
  required: number,
): { items: RetrievalSearchHit[]; total: number } {
  const items: RetrievalSearchHit[] = [];
  let offset = 0;
  let total = 0;
  while (items.length < required) {
    const page = reader.search({
      ...request,
      workspaceId,
      limit: Math.min(PAGE_SIZE, required - items.length),
      offset,
    });
    total = page.total;
    items.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= total) break;
  }
  return { items, total };
}

export function searchWorkspaceRetrievalOverlay(
  reader: WorkspaceRetrievalReader,
  request: RetrievalSearchRequest,
): RetrievalSearchResult {
  const workspaceId = request.workspaceId.trim();
  const limit = request.limit ?? 25;
  const offset = request.offset ?? 0;
  const scopes = workspaceRetrievalScopes(workspaceId);
  if (scopes.length === 1) return reader.search(request);

  const required = offset + limit;
  const scoped = scopes.map((scope) => searchScope(reader, request, scope, required));
  const merged = new Map<string, RetrievalSearchHit>();
  for (const result of scoped) {
    for (const hit of result.items) merged.set(hitIdentity(hit), hit);
  }
  const ordered = [...merged.values()].sort((left, right) => compareHits(workspaceId, left, right));

  return {
    protocolVersion: RETRIEVAL_PROTOCOL_VERSION,
    objectType: "RETRIEVAL_SEARCH_RESULT",
    indexMode: RETRIEVAL_INDEX_MODE,
    query: request.query.trim(),
    items: ordered.slice(offset, offset + limit),
    total: scoped.reduce((sum, result) => sum + result.total, 0),
  };
}

export function resolveCurrentWorkspaceDocument(
  reader: WorkspaceRetrievalReader,
  workspaceId: string,
  documentId: string,
): ResolvedWorkspaceDocument | null {
  for (const scope of workspaceRetrievalScopes(workspaceId)) {
    const document = reader.getDocument(scope, documentId);
    if (document) return { document, workspaceId: scope };
  }
  return null;
}
