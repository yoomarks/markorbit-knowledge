import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import { getConnectorRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ connectorId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { connectorId } = await context.params;
    return NextResponse.json({
      connectorId,
      items: getConnectorRepository().listVersions(connectorId),
      runtimeHealthEvidence: "NOT_EVALUATED",
    });
  } catch (error) {
    return apiError(error);
  }
}
