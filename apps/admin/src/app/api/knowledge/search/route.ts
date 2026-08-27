import { NextResponse } from "next/server";
import {
  ARTIFACT_KINDS,
  RETRIEVAL_INDEX_MODE,
  type ArtifactKind,
  type SourceDefinition,
} from "@markorbit/contracts";
import { DEFAULT_WORKSPACE, RegistryValidationError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import {
  composeKnowledgeHybridSearch,
  KNOWLEDGE_HYBRID_SEARCH_MODE,
} from "@/server/knowledge-hybrid-search";
import {
  getRawArtifactRepository,
  getRetrievalIndexRepository,
  getSourceRepository,
  getStagingContentRepository,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SCAN = 100;
const MAX_FTS_HITS = 50;
const DEFAULT_LIMIT = 25;

type SearchTruncationReason = "METADATA_SCAN_LIMIT" | "FULL_TEXT_HIT_LIMIT";

function integerParam(value: string | null, fallback: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new RegistryValidationError("Pagination values must be non-negative integers");
  }
  return Math.min(parsed, max);
}

function artifactKind(value: string | null): ArtifactKind | undefined {
  if (!value) return undefined;
  if (!ARTIFACT_KINDS.includes(value as ArtifactKind)) {
    throw new RegistryValidationError(`Unsupported artifact kind ${value}`);
  }
  return value as ArtifactKind;
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

export function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId")?.trim() || DEFAULT_WORKSPACE.id;
    const q = url.searchParams.get("q")?.trim() || "";
    if (!q) throw new RegistryValidationError("Knowledge search query is required");

    const sourceId = url.searchParams.get("sourceId")?.trim() || undefined;
    const jurisdiction = url.searchParams.get("jurisdiction")?.trim().toUpperCase() || "";
    const requestedKind = artifactKind(url.searchParams.get("artifactKind"));
    const status = url.searchParams.get("status")?.trim() || "";
    const offset = integerParam(url.searchParams.get("offset"), 0, MAX_SCAN);
    const limit = integerParam(url.searchParams.get("limit"), DEFAULT_LIMIT, 50) || DEFAULT_LIMIT;

    const staging = getStagingContentRepository();
    const sources = getSourceRepository();
    const artifacts = getRawArtifactRepository();
    const retrieval = getRetrievalIndexRepository();

    const documents = staging.listDocuments({
      workspaceId,
      ...(sourceId ? { sourceId } : {}),
      limit: MAX_SCAN,
      offset: 0,
    });

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

    const normalizedQuery = q.toLocaleLowerCase();
    const allScanned = documents.items
      .map((record) => enrich(record.descriptor.id))
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const metadataMatches = allScanned.filter((item) => {
      if (!passesStructuredFilters(item)) return false;
      const haystack = [
        item.title,
        item.targetPath,
        item.source?.name ?? "",
        item.artifact?.originalName ?? "",
        item.artifact?.sourceUri ?? "",
      ]
        .join("\n")
        .toLocaleLowerCase();
      return haystack.includes(normalizedQuery);
    });

    const fullTextResult = retrieval.search({
      workspaceId,
      query: q,
      ...(sourceId ? { sourceId } : {}),
      ...(jurisdiction ? { jurisdiction } : {}),
      limit: MAX_FTS_HITS,
    });

    const fullTextCandidates = fullTextResult.items
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
    const sourceOptions = sources.list({ workspaceId, limit: 100 }).items.map((source) => ({
      id: source.id,
      name: source.name,
      jurisdictions: source.jurisdictions,
    }));
    const jurisdictions = [
      ...new Set(sourceOptions.flatMap((source) => source.jurisdictions)),
    ].sort();
    const kinds = [
      ...new Set(allScanned.map((item) => item.artifact?.artifactKind).filter(Boolean)),
    ].sort();
    const truncationReasons: SearchTruncationReason[] = [];
    if (documents.total > documents.items.length) truncationReasons.push("METADATA_SCAN_LIMIT");
    if (fullTextResult.total > fullTextResult.items.length) {
      truncationReasons.push("FULL_TEXT_HIT_LIMIT");
    }

    return NextResponse.json({
      search: {
        mode: KNOWLEDGE_HYBRID_SEARCH_MODE,
        indexMode: RETRIEVAL_INDEX_MODE,
        graphNavigation: "OBJECTIVE_LOCAL_1_2_HOP",
        graphAffectsRank: false,
        vectorSearch: false,
        truncated: truncationReasons.length > 0,
        truncationReasons,
        limits: { metadataScan: MAX_SCAN, fullTextHits: MAX_FTS_HITS },
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
      filters: { sources: sourceOptions, jurisdictions, artifactKinds: kinds },
    });
  } catch (error) {
    return apiError(error);
  }
}
