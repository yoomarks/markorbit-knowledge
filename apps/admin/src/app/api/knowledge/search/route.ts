import { NextResponse } from "next/server";
import {
  ARTIFACT_KINDS,
  CONVERSION_STAGING_DOCUMENT_STATUSES,
  RETRIEVAL_INDEX_MODE,
  type ArtifactKind,
  type SourceDefinition,
  type StagingDocumentDescriptor,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { queryKnowledgeBrowser } from "@markorbit/persistence/knowledge-browser-query";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import {
  collectCompleteKnowledgeSearch,
  composeKnowledgeHybridSearch,
  KNOWLEDGE_HYBRID_SEARCH_MODE,
} from "@/server/knowledge-hybrid-search";
import {
  getRawArtifactRepository,
  getRegistryDatabase,
  getRetrievalIndexRepository,
  getSourceRepository,
  getStagingContentRepository,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function sourceSummary(source: SourceDefinition | null) {
  return source
    ? {
        id: source.id,
        name: source.name,
        sourceType: source.sourceType,
        category: source.category,
        authorityLevel: source.authorityLevel,
        jurisdictions: source.jurisdictions,
        languages: source.languages,
        canonicalUri: source.canonicalUri ?? null,
      }
    : null;
}

export async function GET(request: Request) {
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

    const database = getRegistryDatabase();
    const staging = getStagingContentRepository();
    const sources = getSourceRepository();
    const artifacts = getRawArtifactRepository();
    const retrieval = getRetrievalIndexRepository();

    const metadataMatches = collectCompleteKnowledgeSearch((metadataOffset) =>
      queryKnowledgeBrowser(database, {
        workspaceId,
        q,
        ...(sourceId ? { sourceId } : {}),
        ...(jurisdiction ? { jurisdiction } : {}),
        ...(requestedKind ? { artifactKind: requestedKind } : {}),
        ...(status ? { status } : {}),
        offset: metadataOffset,
        limit: SEARCH_PAGE_SIZE,
      }),
    );

    const enrich = (documentId: string) => {
      const record = staging.getDocument(documentId, workspaceId);
      if (!record) return null;
      const descriptor = record.descriptor;
      const source = sources.getById(descriptor.sourceId);
      const artifactView = artifacts.getArtifact(descriptor.rawArtifactId);
      const artifact = artifactView?.artifact ?? null;
      return {
        id: descriptor.id,
        title: descriptor.title || artifact?.originalName || descriptor.targetPath,
        targetPath: descriptor.targetPath,
        outputFormat: descriptor.outputFormat,
        sizeBytes: descriptor.sizeBytes,
        status: descriptor.status,
        validation: descriptor.validation,
        generatedAt: descriptor.generatedAt,
        updatedAt: record.updatedAt,
        source: sourceSummary(source),
        artifact: artifact
          ? {
              id: artifact.id,
              originalName: artifact.originalName,
              artifactKind: artifact.artifactKind,
              mimeType: artifact.mimeType,
              version: artifact.version,
              sizeBytes: artifact.sizeBytes,
              capturedAt: artifact.capturedAt,
              publishedAt: artifact.publishedAt ?? null,
              canonicalUri: artifact.canonicalUri ?? null,
              sourceUri: artifact.provenance.sourceUri,
              status: artifact.status,
            }
          : null,
      };
    };

    const passesStructuredFilters = (item: NonNullable<ReturnType<typeof enrich>>) => {
      if (status && item.status !== status) return false;
      if (requestedKind && item.artifact?.artifactKind !== requestedKind) return false;
      if (jurisdiction && !item.source?.jurisdictions.includes(jurisdiction)) return false;
      return true;
    };

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

    const fullTextCandidates = fullTextHits
      .map((hit) => {
        const item = enrich(hit.document.stagingDocumentId);
        if (!item || !passesStructuredFilters(item)) return null;
        return {
          item,
          evidence: {
            indexMode: RETRIEVAL_INDEX_MODE,
            score: hit.score,
            snippet: hit.snippet,
            headingPath: hit.chunk.headingPath,
          },
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

    const composed = composeKnowledgeHybridSearch(fullTextCandidates, metadataMatches);
    const page = composed.slice(offset, offset + limit);
    const facetResult = queryKnowledgeBrowser(database, {
      workspaceId,
      ...(sourceId ? { sourceId } : {}),
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
        pageSizes: { metadata: SEARCH_PAGE_SIZE, fullText: SEARCH_PAGE_SIZE },
      },
      query: q,
      items: page,
      total: composed.length,
      offset,
      limit,
      summary: {
        total: composed.length,
        ready: composed.filter((item) => item.status === "READY").length,
        generated: composed.filter((item) => item.status === "GENERATED").length,
        blocked: composed.filter((item) => item.status === "BLOCKED").length,
        archived: composed.filter((item) => item.status === "ARCHIVED").length,
      },
      filters: facetResult.filters,
    });
  } catch (error) {
    return apiError(error);
  }
}
