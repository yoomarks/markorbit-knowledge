import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import { AcquisitionStrategySelectionService } from "@/server/acquisition-strategy-selection-service";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ sourceId: string }> },
) {
  try {
    const { sourceId } = await context.params;
    const service = new AcquisitionStrategySelectionService(getRegistryDatabase());
    return NextResponse.json(service.selectAndRecord({ sourceId }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
