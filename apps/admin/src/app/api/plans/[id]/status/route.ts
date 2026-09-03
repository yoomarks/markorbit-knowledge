import { NextResponse } from "next/server";
import { COLLECTION_PLAN_STATUSES, type CollectionPlanStatus } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { CollectionPlanNotFoundError } from "@markorbit/persistence/collection-plans";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiMutationAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getCollectionPlanRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const existing = getCollectionPlanRepository().getById(id);
    if (!existing) throw new CollectionPlanNotFoundError(id);
    const { principal } = await resolveAdminBrowserApiMutationAccess(
      request,
      existing.plan.workspaceId,
    );
    assertAdminBrowserResourceWorkspace(principal, existing.plan.workspaceId);
    const body = requireRecord(await readJson(request));
    if (
      typeof body.status !== "string" ||
      !COLLECTION_PLAN_STATUSES.includes(body.status as CollectionPlanStatus)
    ) {
      throw new RegistryValidationError("A valid collection plan status is required");
    }
    if (typeof body.expectedUpdatedAt !== "string") {
      throw new RegistryValidationError("expectedUpdatedAt is required");
    }
    const plan = getCollectionPlanRepository().updateStatus(
      id,
      body.status as CollectionPlanStatus,
      body.expectedUpdatedAt,
    );
    return NextResponse.json({ plan });
  } catch (error) {
    return apiError(error);
  }
}
