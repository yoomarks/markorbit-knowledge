import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import { getReadyPackageRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const workspaceId = search.get("workspaceId")?.trim();
    const conversionRunId = search.get("conversionRunId")?.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId query parameter is required");
    if (!conversionRunId) {
      throw new RegistryValidationError("conversionRunId query parameter is required");
    }
    const readyPackage = getReadyPackageRepository().getByConversionRun(
      conversionRunId,
      workspaceId,
    );
    return NextResponse.json({ readyPackage });
  } catch (error) {
    return apiError(error);
  }
}
