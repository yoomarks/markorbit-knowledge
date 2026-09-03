import { NextResponse } from "next/server";
import { RegistryError, RegistryValidationError } from "@markorbit/persistence";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getReadyPackageRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const assertedWorkspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();
    if (!assertedWorkspaceId) {
      throw new RegistryValidationError("workspaceId query parameter is required");
    }
    const { principal, workspaceId } = await resolveAdminBrowserApiReadAccess(
      request,
      assertedWorkspaceId,
    );
    const { id } = await context.params;
    const readyPackage = getReadyPackageRepository().getById(id, workspaceId);
    if (!readyPackage) {
      throw new RegistryError("READY_PACKAGE_NOT_FOUND", `ReadyPackage ${id} was not found`);
    }
    assertAdminBrowserResourceWorkspace(principal, readyPackage.workspaceId);
    return NextResponse.json({ readyPackage });
  } catch (error) {
    return apiError(error);
  }
}
