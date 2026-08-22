import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import { AcquisitionIntelligenceReadService } from "@/server/acquisition-intelligence-read-service";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await context.params;
    const service = new AcquisitionIntelligenceReadService(getRegistryDatabase());
    return NextResponse.json(service.run(runId));
  } catch (error) {
    return apiError(error);
  }
}
