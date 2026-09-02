import { NextResponse } from "next/server";
import { ARTIFACT_KINDS, type ArtifactKind, type SourceDefinition } from "@markorbit/contracts";
import { DEFAULT_WORKSPACE, RegistryValidationError } from "@markorbit/persistence";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import {
  getRawArtifactRepository,
  getSourceRepository,
  getStagingContentRepository,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SCAN = 100;
const DEFAULT_LIMIT = 25;

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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const assertedWorkspaceId =
      url.searchParams.get("workspaceId")?.trim() || DEFAULT_WORKSPACE.id;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(
      request,
      assertedWorkspaceId,
    );
    const q = url.searchParams.get("q")?.trim().toLowerCase() || "";
    const sourceId = url.searchParams.get("sourceId")?.trim() || undefined;
    const jurisdiction = url.searchParams.get("jurisdiction")?.trim().toUpperCase() || "";
    const requestedKind = artifactKind(url.searchParams.get("artifactKind"));
    const status = url.searchParams.get("status")?.trim() || "";
    const offset = integerParam(url.searchParams.get("offset"), 0, MAX_SCAN);
    const limit = integerParam(url.searchParams.get("limit"), DEFAULT_LIMIT, 50) || DEFAULT_LIMIT;

    const staging = getStagingContentRepository();
    const sources = getSourceRepository();
    const artifacts = getRawArtifactRepository();
    const documents = staging.listDocuments({
      workspaceId,
      ...(sourceId ? { sourceId } : {}),
      limit: MAX_SCAN,
      offset: 0,
    });

    const enriched = documents.items
      .map((record) => {
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
      })
      .filter((item) => {
        if (status && item.status !== status) return false;
        if (requestedKind && item.artifact?.artifactKind !== requestedKind) return false;
        if (jurisdiction && !item.source?.jurisdictions.includes(jurisdiction)) return false;
        if (q) {
          const haystack = [
            item.title,
            item.targetPath,
            item.source?.name ?? "",
            item.artifact?.originalName ?? "",
            item.artifact?.sourceUri ?? "",
          ]
            .join("\n")
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((left, right) => Date.parse(right.generatedAt) - Date.parse(left.generatedAt));

    const page = enriched.slice(offset, offset + limit);
    const sourceOptions = sources.list({ workspaceId, limit: 100 }).items.map((source) => ({
      id: source.id,
      name: source.name,
      jurisdictions: source.jurisdictions,
    }));
    const jurisdictions = [
      ...new Set(sourceOptions.flatMap((source) => source.jurisdictions)),
    ].sort();
    const kinds = [
      ...new Set(enriched.map((item) => item.artifact?.artifactKind).filter(Boolean)),
    ].sort();

    return NextResponse.json({
      items: page,
      total: enriched.length,
      offset,
      limit,
      summary: {
        total: enriched.length,
        ready: enriched.filter((item) => item.status === "READY").length,
        generated: enriched.filter((item) => item.status === "GENERATED").length,
        blocked: enriched.filter((item) => item.status === "BLOCKED").length,
        archived: enriched.filter((item) => item.status === "ARCHIVED").length,
      },
      filters: { sources: sourceOptions, jurisdictions, artifactKinds: kinds },
    });
  } catch (error) {
    return apiError(error);
  }
}
