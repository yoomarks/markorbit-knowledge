import { NextResponse } from "next/server";
import {
  ARTIFACT_KINDS,
  CONVERSION_STAGING_DOCUMENT_STATUSES,
  RETRIEVAL_INDEX_MODE,
  type ArtifactKind,
  type StagingDocumentDescriptor,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  queryKnowledgeReadModel,
  queryKnowledgeReadModelItemsByIds,
} from "@markorbit/persistence/knowledge-browser-query";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import {
  collectCompleteKnowledgeSearch,
  composeKnowledgeHybridSearch,
  KNOWLEDGE_HYBRID_SEARCH_MODE,
} from "@/server/knowledge-hybrid-search";
import {
  filterKnowledgeSearchByGeneratedDate,
  readKnowledgeSearchDateRange,
} from "@/server/knowledge-search-date-filter";
import { getRegistryDatabase, getRetrievalIndexRepository } from "@/server/source-registry";

const SEARCH_PAGE_SIZE = 50;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

function offsetParam(value: string | null): number {
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new RegistryValidationError("offset must be a non-negative safe integer");
  }
  return parsed;
}

function limitParam(value: string | null): number {
  if (!value) return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_LIMIT) {
    throw new RegistryValidationError(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  return parsed;
}

function artifactKind(value: string | null): ArtifactKind | undefined {
  if (!value) return undefined;
  if (!ARTIFACT_KINDS.includes(value as ArtifactKind)) {
    throw new RegistryValidationError(`Unsupported artifact kind ${value}`);
  }
  return value as ArtifactKind;
}

function stagingStatus(value: string | null): StagingDocumentDescriptor["status"] | undefined {
  if (!value) return undefined;
  if (
    !CONVERSION_STAGING_DOCUMENT_STATUSES.includes(value as StagingDocumentDescriptor["status"])
  ) {
    throw new RegistryValidationError(`Unsupported staging status ${value}`);
  }
  return value as StagingDocumentDescriptor["status"];
}

function batches<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export async function handleKnowledgeSearchGet(request: Request) {
  try {
    const url = new URL(request.url);
    const assertedWorkspaceId = url.searchParams.get("workspaceId")?.trim() || undefined;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
    const q = url.searchParams.get("q")?.trim() || "";
    if (!q) throw new RegistryValidationError("Knowledge search query is required");

    const sourceId = url.searchParams.get("sourceId")?.trim() || undefined;
    const jurisdiction = url.searchParams.get("jurisdiction")?.trim().toUpperCase() || undefined;
    const requestedKind = artifactKind(url.searchParams.get("artifactKind"));
    const status = stagingStatus(url.searchParams.get("status"));
    const offset = offsetParam(url.searchParams.get("offset"));
    const limit = limitParam(url.searchParams.get("limit"));
    const dateRange = readKnowledgeSearchDateRange(url.searchParams);

    const database = getRegistryDatabase();
    const retrieval = getRetrievalIndexRepository();
    const structuredQuery = {
      workspaceId,
      ...(sourceId ? { sourceId } : {}),
      ...(jurisdiction ? { jurisdiction } : {}),
      ...(requestedKind ? { artifactKind: requestedKind } : {}),
      ...(status ? { status } : {}),
    };

    const metadataMatches = collectCompleteKnowledgeSearch((metadataOffset) =>
      queryKnowledgeReadModel(database, {
        ...structuredQuery,
        q,
        offset: metadataOffset,
        limit: SEARCH_PAGE_SIZE,
      }),
    );

    const fullTextHits = collectCompleteKnowledgeSearch((fullTextOffset) =>
      retrieval.search({
        workspaceId,
        query: q,
        ...(sourceId ? { sourceId } : {}),
        ...(jurisdiction ? { jurisdiction } : {}),
        limit: SEARCH_PAGE_SIZE,
        offset: fullTextOffset,
      }),
    );

    const resolvedItems = new Map(
      batches(
        fullTextHits.map((hit) => hit.document.stagingDocumentId),
        SEARCH_PAGE_SIZE,
      )
        .flatMap((ids) => queryKnowledgeReadModelItemsByIds(database, structuredQuery, ids))
        .map((item) => [item.id, item] as const),
    );

    const fullTextCandidates = fullTextHits.flatMap((hit) => {
      const item = resolvedItems.get(hit.document.stagingDocumentId);
      return item
        ? [
            {
              item,
              evidence: {
                indexMode: RETRIEVAL_INDEX_MODE,
                score: hit.score,
                snippet: hit.snippet,
                headingPath: hit.chunk.headingPath,
              },
            },
          ]
        : [];
    });

    const composed = composeKnowledgeHybridSearch(fullTextCandidates, metadataMatches);
    const filtered = filterKnowledgeSearchByGeneratedDate(composed, dateRange);
    const page = filtered.slice(offset, offset + limit);
    const facetResult = queryKnowledgeReadModel(database, {
      ...structuredQuery,
      q,
      offset: 0,
      limit: 1,
    });

    return NextResponse.json({
      search: {
        mode: KNOWLEDGE_HYBRID_SEARCH_MODE,
        indexMode: RETRIEVAL_INDEX_MODE,
        graphNavigation: "OBJECTIVE_LOCAL_1_2_HOP",
        graphAffectsRank: false,
        vectorSearch: false,
        complete: true,
        totalSemantics: "EXACT_COMPLETE",
        dateSemantics: "GENERATED_AT_UTC_DATE",
        pageSizes: { metadata: SEARCH_PAGE_SIZE, fullText: SEARCH_PAGE_SIZE },
      },
      query: q,
      items: page,
      total: filtered.length,
      offset,
      limit,
      summary: {
        total: filtered.length,
        ready: filtered.filter((item) => item.status === "READY").length,
        generated: filtered.filter((item) => item.status === "GENERATED").length,
        blocked: filtered.filter((item) => item.status === "BLOCKED").length,
        archived: filtered.filter((item) => item.status === "ARCHIVED").length,
      },
      appliedFilters: dateRange,
      filters: facetResult.filters,
    });
  } catch (error) {
    return apiError(error);
  }
}
