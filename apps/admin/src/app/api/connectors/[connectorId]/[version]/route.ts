import { NextResponse } from "next/server";
import { ConnectorNotFoundError } from "@markorbit/persistence/connectors";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getConnectorRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ connectorId: string; version: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    await resolveAdminBrowserApiReadAccess(request);
    const { connectorId, version } = await context.params;
    const connector = getConnectorRepository().get(connectorId, version);
    if (!connector) throw new ConnectorNotFoundError(connectorId, version);
    return NextResponse.json({ connector });
  } catch (error) {
    return apiError(error);
  }
}
