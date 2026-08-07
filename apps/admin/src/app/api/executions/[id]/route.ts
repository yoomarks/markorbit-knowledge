import { NextResponse } from "next/server";
import { ExecutionAttemptNotFoundError } from "@markorbit/persistence/worker-execution";
import { apiError } from "@/server/api-errors";
import { getWorkerExecutionRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const execution = getWorkerExecutionRepository().getById(id);
    if (!execution) throw new ExecutionAttemptNotFoundError(id);
    return NextResponse.json({ execution });
  } catch (error) {
    return apiError(error);
  }
}
