import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { inspectRawArtifactLineage } from "@markorbit/persistence/raw-artifact-lineage";
import { apiError } from "@/server/api-errors";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const workspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();
    if (!workspaceId) {
      throw new RegistryValidationError("workspaceId query parameter is required");
    }
    return NextResponse.json(
      inspectRawArtifactLineage(getRegistryDatabase(), { workspaceId, artifactId: id }),
    );
  } catch (error) {
    return apiError(error);
  }
}
