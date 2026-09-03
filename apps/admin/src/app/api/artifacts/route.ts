import { NextResponse } from "next/server";
import {
  ARTIFACT_KINDS,
  ARTIFACT_STATUSES,
  type ArtifactKind,
  type ArtifactStatus,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getRawArtifactRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function integer(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new RegistryValidationError("Pagination must be integer");
  return parsed;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const kind = params.get("artifactKind") ?? undefined;
    const status = params.get("status") ?? undefined;
    if (kind && !ARTIFACT_KINDS.includes(kind as ArtifactKind)) {
      throw new RegistryValidationError("Unknown artifactKind filter");
    }
    if (status && !ARTIFACT_STATUSES.includes(status as ArtifactStatus)) {
      throw new RegistryValidationError("Unknown status filter");
    }
    const assertedWorkspaceId = params.get("workspaceId") ?? undefined;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
    const result = getRawArtifactRepository().list({
      workspaceId,
      sourceId: params.get("sourceId") ?? undefined,
      runId: params.get("runId") ?? undefined,
      executionAttemptId: params.get("executionAttemptId") ?? undefined,
      artifactKind: kind as ArtifactKind | undefined,
      status: status as ArtifactStatus | undefined,
      mimeType: params.get("mimeType") ?? undefined,
      sha256: params.get("sha256") ?? undefined,
      q: params.get("q") ?? undefined,
      limit: integer(params.get("limit"), 25),
      offset: integer(params.get("offset"), 0),
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
