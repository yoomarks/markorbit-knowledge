import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { CollectionPlanNotFoundError } from "@markorbit/persistence/collection-plans";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import {
  getCollectionPlanRepository,
  getExecutionLedgerRepository,
} from "@/server/source-registry";

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
    const url = new URL(request.url);
    const rawLimit = url.searchParams.get("limit");
    const limit = rawLimit ? Number(rawLimit) : 20;
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new RegistryValidationError("limit must be a positive integer");
    }
    return NextResponse.json({ runs: getExecutionLedgerRepository().listForPlan(id, limit) });
  } catch (error) {
    return apiError(error);
  }
}
