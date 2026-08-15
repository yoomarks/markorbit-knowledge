import { NextResponse } from "next/server";
import { DEFAULT_WORKSPACE, RegistryValidationError } from "@markorbit/persistence";
import { queueSourceCoverageGapForDiscovery } from "@markorbit/persistence/source-coverage-discovery-intake";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import {
  getSourceDiscoveryRepository,
  getSourceRepository,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = requireRecord(await readJson(request));
    const workspaceId =
      body.workspaceId === undefined
        ? DEFAULT_WORKSPACE.id
        : typeof body.workspaceId === "string" && body.workspaceId.trim()
          ? body.workspaceId.trim()
          : null;
    if (!workspaceId) throw new RegistryValidationError("workspaceId must be a non-empty string");

    const result = queueSourceCoverageGapForDiscovery(
      { workspaceId, targetId: id },
      {
        sources: getSourceRepository(),
        discovery: getSourceDiscoveryRepository(),
      },
    );
    return NextResponse.json(result, { status: result.state === "QUEUED" ? 201 : 200 });
  } catch (error) {
    return apiError(error);
  }
}
