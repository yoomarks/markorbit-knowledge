import { NextResponse } from "next/server";
import { converterAccepts, mimePatternMatches } from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import { RawArtifactNotFoundError } from "@markorbit/persistence/raw-artifacts";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getConverterRegistryRepository, getRawArtifactRepository } from "@/server/source-registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const assertedWorkspaceId = url.searchParams.get("workspaceId")?.trim();
    if (!assertedWorkspaceId) {
      throw new RegistryValidationError("workspaceId query parameter is required");
    }
    const view = getRawArtifactRepository().getArtifact(id);
    if (!view) throw new RawArtifactNotFoundError(id);
    const artifact = view.artifact;
    const { principal, workspaceId } = await resolveAdminBrowserApiReadAccess(
      request,
      assertedWorkspaceId,
    );
    assertAdminBrowserResourceWorkspace(principal, artifact.workspaceId);
    if (artifact.status !== "READY_FOR_CONVERSION")
      throw new RegistryConflictError(
        "CONVERSION_ARTIFACT_NOT_AVAILABLE",
        "RawArtifact is not available for conversion",
      );
    const converters = getConverterRegistryRepository();
    const profiles = converters.listProfiles({ workspaceId, status: "ACTIVE", limit: 100 }).items;
    const items = profiles.flatMap((profile) => {
      const manifest = converters.getManifest(
        profile.converter.converterId,
        profile.converter.version,
      )?.manifest;
      if (!manifest || manifest.status !== "ACTIVE") return [];
      if (profile.sourceId && profile.sourceId !== artifact.sourceId) return [];
      if (!profile.input.artifactKinds.includes(artifact.artifactKind)) return [];
      if (
        !profile.input.mimePatterns.some((pattern) =>
          mimePatternMatches(pattern, artifact.mimeType),
        )
      )
        return [];
      if (!converterAccepts(manifest, artifact.artifactKind, artifact.mimeType)) return [];
      if (profile.outputFormat !== "MARKDOWN" || manifest.outputFormat !== profile.outputFormat)
        return [];
      return [
        {
          profileId: profile.id,
          name: profile.name,
          converterId: profile.converter.converterId,
          converterVersion: profile.converter.version,
          outputFormat: profile.outputFormat,
          targetPathTemplate: profile.targetPathTemplate,
        },
      ];
    });
    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    return apiError(error);
  }
}
