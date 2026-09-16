import { NextResponse } from "next/server";
import { RegistryValidationError, assertWorkspaceActive } from "@markorbit/persistence";
import {
  SqliteCoreWorkspaceBindingRepository,
  normalizeCanonicalCoreWorkspaceId,
} from "@markorbit/persistence/core-workspace-bindings";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { CaseProducerAccessError } from "@/server/case-producer-auth";
import {
  assertOperatorServiceWritablePrincipal,
  authenticateOperatorServicePrincipal,
} from "@/server/operator-service-api-access";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function assertBindingOwner(coreWorkspaceId: string, principalWorkspaceId: string): void {
  if (coreWorkspaceId !== normalizeCanonicalCoreWorkspaceId(principalWorkspaceId)) {
    throw new CaseProducerAccessError(
      "WORKSPACE_MISMATCH",
      403,
      "Core Workspace Principal does not own the requested Knowledge binding.",
    );
  }
}
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const principal = authenticateOperatorServicePrincipal(request);
    const repository = new SqliteCoreWorkspaceBindingRepository(getRegistryDatabase());
    const binding = repository.getByKnowledgeWorkspaceId(id);
    if (!binding) {
      throw new CaseProducerAccessError(
        "WORKSPACE_MISMATCH",
        403,
        "Core Workspace Principal does not own the requested Knowledge binding.",
      );
    }
    assertBindingOwner(binding.coreWorkspaceId, principal.workspaceId);
    return NextResponse.json({ binding });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const principal = authenticateOperatorServicePrincipal(request);
    assertOperatorServiceWritablePrincipal(principal);
    const body = requireRecord(await readJson(request));
    const suppliedCoreWorkspaceId =
      typeof body.coreWorkspaceId === "string" ? body.coreWorkspaceId.trim() : "";
    if (!suppliedCoreWorkspaceId) throw new RegistryValidationError("coreWorkspaceId is required");
    const coreWorkspaceId = normalizeCanonicalCoreWorkspaceId(suppliedCoreWorkspaceId);
    assertBindingOwner(coreWorkspaceId, principal.workspaceId);
    const { id } = await context.params;
    const database = getRegistryDatabase();
    assertWorkspaceActive(database, id);
    const repository = new SqliteCoreWorkspaceBindingRepository(database);
    return NextResponse.json({ binding: repository.bind(id, coreWorkspaceId) });
  } catch (error) {
    return apiError(error);
  }
}
