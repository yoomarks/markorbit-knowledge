import { NextResponse } from "next/server";
import { ExecutionRunNotFoundError } from "@markorbit/persistence/execution-ledger";
import { apiError } from "../../../../../server/api-errors";
import { AcquisitionIntelligenceReadService } from "../../../../../server/acquisition-intelligence-read-service";
import { resolveOperatorServiceReadAccess } from "../../../../../server/operator-service-api-access";
import {
  getExecutionLedgerRepository,
  getRegistryDatabase,
  getSourceRepository,
} from "../../../../../server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const access = resolveOperatorServiceReadAccess(request);
    const { runId } = await context.params;
    const run = getExecutionLedgerRepository().getById(runId);
    const source = run ? getSourceRepository().getById(run.run.sourceId) : null;
    if (
      !run ||
      !source ||
      source.workspaceId !== access.workspaceId ||
      run.run.workspaceId !== source.workspaceId
    ) {
      throw new ExecutionRunNotFoundError(runId);
    }
    const service = new AcquisitionIntelligenceReadService(getRegistryDatabase());
    return NextResponse.json(service.run(runId));
  } catch (error) {
    return apiError(error);
  }
}
