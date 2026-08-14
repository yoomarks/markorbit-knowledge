import { NextResponse } from "next/server";
import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import { getSourceCoverageSnapshot } from "@/server/source-coverage-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId")?.trim() || DEFAULT_WORKSPACE.id;
    return NextResponse.json(getSourceCoverageSnapshot(workspaceId));
  } catch (error) {
    return apiError(error);
  }
}
