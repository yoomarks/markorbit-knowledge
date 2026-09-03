import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  CollectionPlanNotFoundError,
  type UpdateCollectionPlanInput,
} from "@markorbit/persistence/collection-plans";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getCollectionPlanRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const plan = getCollectionPlanRepository().getById(id);
    if (!plan) throw new CollectionPlanNotFoundError(id);
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, plan.plan.workspaceId);
    assertAdminBrowserResourceWorkspace(workspaceId, plan.plan.workspaceId);
    return NextResponse.json({ plan });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const existing = getCollectionPlanRepository().getById(id);
    if (!existing) throw new CollectionPlanNotFoundError(id);
    const { workspaceId } = await resolveAdminBrowserApiMutationAccess(
      request,
      existing.plan.workspaceId,
    );
    assertAdminBrowserResourceWorkspace(workspaceId, existing.plan.workspaceId);
    const body = requireRecord(await readJson(request));
    const expectedUpdatedAt = body.expectedUpdatedAt;
    if (typeof expectedUpdatedAt !== "string") {
      throw new RegistryValidationError("expectedUpdatedAt is required");
    }
    const input = { ...body };
    delete input.expectedUpdatedAt;
    delete input.status;
    delete input.sourceId;
    delete input.workspaceId;
    const plan = getCollectionPlanRepository().update(
      id,
      input as UpdateCollectionPlanInput,
      expectedUpdatedAt,
    );
    return NextResponse.json({ plan });
  } catch (error) {
    return apiError(error);
  }
}
