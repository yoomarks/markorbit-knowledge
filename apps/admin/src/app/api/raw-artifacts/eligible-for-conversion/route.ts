import { NextResponse } from "next/server";
import { isRawArtifact } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getRawArtifactRepository } from "@/server/source-registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const assertedWorkspaceId = url.searchParams.get("workspaceId")?.trim();
    if (!assertedWorkspaceId) {
      throw new RegistryValidationError("workspaceId query parameter is required");
    }
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
    const result = getRawArtifactRepository().list({
      workspaceId,
      status: "READY_FOR_CONVERSION",
      limit: Number(url.searchParams.get("limit") ?? 50),
      offset: Number(url.searchParams.get("offset") ?? 0),
    });
    return NextResponse.json({
      ...result,
      items: result.items
        .filter(
          (item) => isRawArtifact(item.artifact) && item.artifact.status === "READY_FOR_CONVERSION",
        )
        .map((item) => ({
          id: item.artifact.id,
          sourceId: item.artifact.sourceId,
          artifactKind: item.artifact.artifactKind,
          mimeType: item.artifact.mimeType,
          sha256: item.artifact.binaryHash.value,
          sizeBytes: item.artifact.sizeBytes,
          capturedAt: item.artifact.capturedAt,
          createdAt: item.artifact.createdAt,
          version: item.artifact.version,
          supersedesArtifactId: item.artifact.supersedesArtifactId,
        })),
    });
  } catch (error) {
    return apiError(error);
  }
}
