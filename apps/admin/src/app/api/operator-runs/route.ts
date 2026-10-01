import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { CollectionPlanNotFoundError } from "@markorbit/persistence/collection-plans";
import { apiError, readJson, requireRecord } from "../../../server/api-errors";
import { parseCnipaManualRunExtensions } from "../../../server/cnipa-run-override";
import {
  assertOperatorServiceResourceWorkspace,
  resolveOperatorServiceMutationAccess,
} from "../../../server/operator-service-api-access";
import {
  getCollectionPlanRepository,
  getExecutionLedgerRepository,
} from "../../../server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const allowed = new Set(["planId", "extensions"]);
    if (Object.keys(body).some((key) => !allowed.has(key))) {
      throw new RegistryValidationError("Unknown manual dispatch field");
    }
    if (typeof body.planId !== "string") {
      throw new RegistryValidationError("planId is required");
    }

    const plan = getCollectionPlanRepository().getById(body.planId);
    if (!plan) throw new CollectionPlanNotFoundError(body.planId);

    const access = resolveOperatorServiceMutationAccess(request, plan.plan.workspaceId);
    assertOperatorServiceResourceWorkspace(access, plan.plan.workspaceId);

    const idempotencyKey = request.headers.get("Idempotency-Key");
    const extensions = parseCnipaManualRunExtensions({
      rawExtensions: body.extensions,
      planExtensions: plan.plan.extensions,
      idempotencyKey,
    });
    const result = getExecutionLedgerRepository().dispatchManual({
      planId: body.planId,
      requestedBy: { actorType: "API_CLIENT", actorId: access.principal.userId },
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(extensions ? { extensions } : {}),
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
