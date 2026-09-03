import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import { AcquisitionIntelligenceReadService } from "@/server/acquisition-intelligence-read-service";
import { resolveOperatorServiceReadAccess } from "@/server/operator-service-api-access";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function optionalNumber(value: string | null): number | undefined {
  return value === null ? undefined : Number(value);
}

export async function GET(request: Request, context: { params: Promise<{ sourceId: string }> }) {
  try {
    resolveOperatorServiceReadAccess(request);
    const { sourceId } = await context.params;
    const url = new URL(request.url);
    const service = new AcquisitionIntelligenceReadService(getRegistryDatabase());
    return NextResponse.json(
      service.source({
        sourceId,
        runsLimit: optionalNumber(url.searchParams.get("runsLimit")),
        lessonsLimit: optionalNumber(url.searchParams.get("lessonsLimit")),
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
