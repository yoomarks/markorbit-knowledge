import { NextResponse } from "next/server";
import { ExecutionAttemptNotFoundError } from "@markorbit/persistence/worker-execution";
import { apiError } from "@/server/api-errors";
import { resolveOperatorServiceReadAccess } from "@/server/operator-service-api-access";
import { getWorkerExecutionRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    resolveOperatorServiceReadAccess(request);
    const { id } = await context.params;
    const execution = getWorkerExecutionRepository().getById(id);
    if (!execution) throw new ExecutionAttemptNotFoundError(id);
    return NextResponse.json({ execution });
  } catch (error) {
    return apiError(error);
  }
}
