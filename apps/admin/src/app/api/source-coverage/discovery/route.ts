import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { queueSourceCoverageGapsForDiscovery } from "@markorbit/persistence/source-coverage-discovery-intake";
import { resolveAdminBrowserApiMutationAccess } from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getSourceDiscoveryRepository, getSourceRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const assertedWorkspaceId =
      body.workspaceId === undefined
        ? undefined
        : typeof body.workspaceId === "string" && body.workspaceId.trim()
          ? body.workspaceId.trim()
          : null;
    if (assertedWorkspaceId === null) {
      throw new RegistryValidationError("workspaceId must be a non-empty string");
    }
    if (
      !Array.isArray(body.targetIds) ||
      !body.targetIds.every((item) => typeof item === "string")
    ) {
      throw new RegistryValidationError("targetIds must be an array of strings");
    }

    const { workspaceId } = await resolveAdminBrowserApiMutationAccess(
      request,
      assertedWorkspaceId,
    );
    const result = queueSourceCoverageGapsForDiscovery(
      { workspaceId, targetIds: body.targetIds },
      {
        sources: getSourceRepository(),
        discovery: getSourceDiscoveryRepository(),
      },
    );
    return NextResponse.json(result, { status: result.summary.QUEUED > 0 ? 201 : 200 });
  } catch (error) {
    return apiError(error);
  }
}
