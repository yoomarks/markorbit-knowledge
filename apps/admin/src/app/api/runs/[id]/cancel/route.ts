import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { ExecutionRunNotFoundError } from "@markorbit/persistence/execution-ledger";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiMutationAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getExecutionLedgerRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const existing = getExecutionLedgerRepository().getById(id);
    if (!existing) throw new ExecutionRunNotFoundError(id);
    const { principal } = await resolveAdminBrowserApiMutationAccess(
      request,
      existing.run.workspaceId,
    );
    assertAdminBrowserResourceWorkspace(principal, existing.run.workspaceId);
    const body = requireRecord(await readJson(request));
    const allowed = new Set(["expectedUpdatedAt", "reason"]);
    if (Object.keys(body).some((key) => !allowed.has(key))) {
      throw new RegistryValidationError("Unknown cancellation field");
    }
    if (typeof body.expectedUpdatedAt !== "string") {
      throw new RegistryValidationError("expectedUpdatedAt is required");
    }
    if (body.reason !== undefined && typeof body.reason !== "string") {
      throw new RegistryValidationError("reason must be a string");
    }
    const run = getExecutionLedgerRepository().cancel(id, {
      expectedUpdatedAt: body.expectedUpdatedAt,
      reason: body.reason,
    });
    return NextResponse.json({ run });
  } catch (error) {
    return apiError(error);
  }
}
