import { NextResponse } from "next/server";
import { RegistryNotFoundError } from "@markorbit/persistence";
import { apiError } from "../../../../../server/api-errors";
import { AcquisitionIntelligenceReadService } from "../../../../../server/acquisition-intelligence-read-service";
import { resolveOperatorServiceReadAccess } from "../../../../../server/operator-service-api-access";
import { getRegistryDatabase, getSourceRepository } from "../../../../../server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function optionalNumber(value: string | null): number | undefined {
  return value === null ? undefined : Number(value);
}

export async function GET(request: Request, context: { params: Promise<{ sourceId: string }> }) {
  try {
    const access = resolveOperatorServiceReadAccess(request);
    const { sourceId } = await context.params;
    const source = getSourceRepository().getById(sourceId);
    if (!source || source.workspaceId !== access.workspaceId) {
      throw new RegistryNotFoundError(sourceId);
    }
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
