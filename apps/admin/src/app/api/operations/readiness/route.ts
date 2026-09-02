import { NextResponse } from "next/server";
import { SqliteOperationsReadinessRepository } from "@markorbit/persistence/operations-readiness";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const assertedWorkspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(
      request,
      assertedWorkspaceId,
    );
    const repository = new SqliteOperationsReadinessRepository(getRegistryDatabase());
    return NextResponse.json(repository.inspect(workspaceId));
  } catch (error) {
    return apiError(error);
  }
}
