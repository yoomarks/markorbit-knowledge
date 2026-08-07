import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import { getWorkerExecutionRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ executions: getWorkerExecutionRepository().listForRun(id) });
  } catch (error) {
    return apiError(error);
  }
}
