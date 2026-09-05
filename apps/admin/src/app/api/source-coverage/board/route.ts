import { NextResponse } from "next/server";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getSourceCoverageBoard } from "@/server/source-coverage-board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const assertedWorkspaceId = url.searchParams.get("workspaceId")?.trim() || undefined;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
    return NextResponse.json(getSourceCoverageBoard(workspaceId));
  } catch (error) {
    return apiError(error);
  }
}
