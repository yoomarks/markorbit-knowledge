import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteCoreWorkspaceBindingRepository } from "@markorbit/persistence/core-workspace-bindings";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import {
  resolveOperatorServiceMutationAccess,
  resolveOperatorServiceReadAccess,
} from "@/server/operator-service-api-access";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const principal = resolveOperatorServiceReadAccess(request, id);
    const repository = new SqliteCoreWorkspaceBindingRepository(getRegistryDatabase());
    return NextResponse.json({
      binding: repository.getByKnowledgeWorkspaceId(principal.workspaceId),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const body = requireRecord(await readJson(request));
    const coreWorkspaceId =
      typeof body.coreWorkspaceId === "string" ? body.coreWorkspaceId.trim() : "";
    if (!coreWorkspaceId) throw new RegistryValidationError("coreWorkspaceId is required");
    const { id } = await context.params;
    const principal = resolveOperatorServiceMutationAccess(request, id);
    const repository = new SqliteCoreWorkspaceBindingRepository(getRegistryDatabase());
    return NextResponse.json({ binding: repository.bind(principal.workspaceId, coreWorkspaceId) });
  } catch (error) {
    return apiError(error);
  }
}
