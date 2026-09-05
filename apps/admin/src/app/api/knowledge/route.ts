import { NextResponse } from "next/server";
import {
  ARTIFACT_KINDS,
  CONVERSION_STAGING_DOCUMENT_STATUSES,
  type ArtifactKind,
  type StagingDocumentDescriptor,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { queryKnowledgeReadModel } from "@markorbit/persistence/knowledge-browser-query";
import { apiError } from "@/server/api-errors";
import { resolveKnowledgeWorkspaceReadAccess } from "@/server/knowledge-workspace-access";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { workspaceId } = await resolveKnowledgeWorkspaceReadAccess(request);

    return NextResponse.json(
      queryKnowledgeReadModel(getRegistryDatabase(), {
        workspaceId,
        q: url.searchParams.get("q")?.trim() || undefined,
        sourceId: url.searchParams.get("sourceId")?.trim() || undefined,
        jurisdiction: url.searchParams.get("jurisdiction")?.trim() || undefined,
        artifactKind: artifactKind(url.searchParams.get("artifactKind")),
        status: stagingStatus(url.searchParams.get("status")),
        offset: offsetParam(url.searchParams.get("offset")),
        limit: limitParam(url.searchParams.get("limit")),
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
