import { NextResponse } from "next/server";
import { ExecutionRunNotFoundError } from "@markorbit/persistence/execution-ledger";
import { apiError } from "@/server/api-errors";
import {
  assertOperatorServiceResourceWorkspace,
  resolveOperatorServiceReadAccess,
} from "@/server/operator-service-api-access";
import {
  getExecutionLedgerRepository,
  getWorkerExecutionRepository,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const run = getExecutionLedgerRepository().getById(id);
    if (!run) throw new ExecutionRunNotFoundError(id);
    const principal = resolveOperatorServiceReadAccess(request);
    assertOperatorServiceResourceWorkspace(principal, run.run.workspaceId);
    return NextResponse.json({ executions: getWorkerExecutionRepository().listForRun(id) });
  } catch (error) {
    return apiError(error);
  }
}
