import { NextResponse } from "next/server";
import { RawArtifactNotFoundError } from "@markorbit/persistence/raw-artifacts";
import { apiError } from "@/server/api-errors";
import {
  assertOperatorServiceResourceWorkspace,
  resolveOperatorServiceMutationAccess,
} from "@/server/operator-service-api-access";
import { extractRawArtifactIntoSourceGraph } from "@/server/raw-artifact-source-graph";
import { getRawArtifactRepository, getSourceGraphRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const artifacts = getRawArtifactRepository();
    const view = artifacts.getArtifact(id);
    if (!view) throw new RawArtifactNotFoundError(id);
    const principal = resolveOperatorServiceMutationAccess(request);
    assertOperatorServiceResourceWorkspace(principal, view.artifact.workspaceId);
    const result = await extractRawArtifactIntoSourceGraph(
      id,
      artifacts,
      getSourceGraphRepository(),
    );
    return NextResponse.json({ result });
  } catch (error) {
    return apiError(error);
  }
}
