import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { getReadyPackageRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const assertedWorkspaceId = search.get("workspaceId")?.trim();
    const conversionRunId = search.get("conversionRunId")?.trim();
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);

    const repository = getReadyPackageRepository();
    if (!conversionRunId) {
      return NextResponse.json({ readyPackages: repository.list(workspaceId) });
    }

    const readyPackage = repository.getByConversionRun(conversionRunId, workspaceId);
    return NextResponse.json({ readyPackage });
  } catch (error) {
    return apiError(error);
  }
}
