import { NextResponse } from "next/server";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiMutationAccess,
} from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import {
  ensureConversionFailureRecovery,
  retryConversionRecoveryCaseNow,
} from "@/server/conversion-failure-recovery";
import { getConversionRunLedgerRepository, getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    getConversionRunLedgerRepository();
    const database = getRegistryDatabase();
    ensureConversionFailureRecovery(database);
    const stored = database
      .prepare("SELECT workspace_id FROM conversion_recovery_cases WHERE id = ?")
      .get(id) as { workspace_id: string } | undefined;
    const { principal, workspaceId } = await resolveAdminBrowserApiMutationAccess(
      request,
      stored?.workspace_id,
    );
    if (stored) assertAdminBrowserResourceWorkspace(principal, stored.workspace_id);
    return NextResponse.json(
      retryConversionRecoveryCaseNow(id, {
        workspaceId,
        actorId: principal.userId,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
