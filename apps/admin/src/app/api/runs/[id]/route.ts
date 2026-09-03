import { NextResponse } from "next/server";
import { ExecutionRunNotFoundError } from "@markorbit/persistence/execution-ledger";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getExecutionLedgerRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const record = getExecutionLedgerRepository().getById(id);
    if (!record) throw new ExecutionRunNotFoundError(id);
    const { principal } = await resolveAdminBrowserApiReadAccess(request, record.run.workspaceId);
    assertAdminBrowserResourceWorkspace(principal, record.run.workspaceId);
    return NextResponse.json({ run: record });
  } catch (error) {
    return apiError(error);
  }
}
