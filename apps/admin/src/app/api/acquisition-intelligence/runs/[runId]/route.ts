import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import { AcquisitionIntelligenceReadService } from "@/server/acquisition-intelligence-read-service";
import { resolveOperatorServiceReadAccess } from "@/server/operator-service-api-access";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    resolveOperatorServiceReadAccess(request);
    const { runId } = await context.params;
    const service = new AcquisitionIntelligenceReadService(getRegistryDatabase());
    return NextResponse.json(service.run(runId));
  } catch (error) {
    return apiError(error);
  }
}
