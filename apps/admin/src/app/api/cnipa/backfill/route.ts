import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { CollectionPlanNotFoundError } from "@markorbit/persistence/collection-plans";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiMutationAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { dispatchCnipaBackfill } from "@/server/cnipa-backfill";
import {
  getCollectionPlanRepository,
  getExecutionLedgerRepository,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RegistryValidationError(`${field} is required`);
  }
  return value.trim();
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const allowed = new Set(["planId", "fromDate", "toDate"]);
    if (Object.keys(body).some((key) => !allowed.has(key))) {
      throw new RegistryValidationError("Unknown CNIPA backfill field");
    }

    const planId = requiredString(body, "planId");
    const fromDate = requiredString(body, "fromDate");
    const toDate = requiredString(body, "toDate");

    const plan = getCollectionPlanRepository().getById(planId);
    if (!plan) throw new CollectionPlanNotFoundError(planId);

    const { principal } = await resolveAdminBrowserApiMutationAccess(
      request,
      plan.plan.workspaceId,
    );
    assertAdminBrowserResourceWorkspace(principal, plan.plan.workspaceId);

    const summary = dispatchCnipaBackfill(
      {
        plan,
        fromDate,
        toDate,
        requestedBy: { actorType: "LOCAL_ADMIN", actorId: principal.userId },
      },
      getExecutionLedgerRepository(),
    );
    return NextResponse.json(summary, { status: summary.created > 0 ? 201 : 200 });
  } catch (error) {
    return apiError(error);
  }
}
