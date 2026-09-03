import { NextResponse } from "next/server";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getConnectorRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ connectorId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    await resolveAdminBrowserApiReadAccess(request);
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
