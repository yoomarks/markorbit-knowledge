import { NextResponse } from "next/server";
import { RegistryError, RegistryValidationError } from "@markorbit/persistence";
import { createCoreIntakeRequest } from "@markorbit/worker-runtime";
import { apiError } from "@/server/api-errors";
import { getReadyPackageRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId query parameter is required");
    const { id } = await context.params;
    const readyPackage = getReadyPackageRepository().getById(id, workspaceId);
    if (!readyPackage) throw new RegistryError("READY_PACKAGE_NOT_FOUND", `ReadyPackage ${id} was not found`);
    return NextResponse.json({
      readyPackageStatus: readyPackage.status,
      coreIntakeRequest: createCoreIntakeRequest(readyPackage),
      transportStatus: "NOT_SUBMITTED",
      note: "Knowledge prepares the handoff envelope but does not invent a Core acceptance receipt.",
    });
  } catch (error) {
    return apiError(error);
  }
}
