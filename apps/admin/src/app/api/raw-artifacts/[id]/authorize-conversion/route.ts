import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { RawArtifactNotFoundError } from "@markorbit/persistence/raw-artifacts";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import {
  assertOperatorServiceResourceWorkspace,
  resolveOperatorServiceMutationAccess,
} from "@/server/operator-service-api-access";
import { authorizeRawArtifactForConversion } from "@/server/raw-artifact-conversion-authorization";
import { getRawArtifactRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = requireRecord(await readJson(request));
    const assertedWorkspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    if (!assertedWorkspaceId) throw new RegistryValidationError("workspaceId is required");
    const { id } = await context.params;
    const view = getRawArtifactRepository().getArtifact(id);
    if (!view) throw new RawArtifactNotFoundError(id);
    const principal = resolveOperatorServiceMutationAccess(request, assertedWorkspaceId);
    assertOperatorServiceResourceWorkspace(principal, view.artifact.workspaceId);
    return NextResponse.json({
      result: authorizeRawArtifactForConversion(id, principal.workspaceId),
    });
  } catch (error) {
    return apiError(error);
  }
}
