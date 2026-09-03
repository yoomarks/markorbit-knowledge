import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import { resolveOperatorServiceMutationAccess } from "@/server/operator-service-api-access";
import { getWorkerExecutionRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    resolveOperatorServiceMutationAccess(request);
    const reconciled = getWorkerExecutionRepository().reconcileExpired();
    return NextResponse.json({ reconciled });
  } catch (error) {
    return apiError(error);
  }
}
