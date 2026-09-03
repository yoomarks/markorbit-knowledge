import { NextResponse } from "next/server";
import { CONNECTOR_STATUSES, type ConnectorStatus } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { resolveAdminBrowserApiMutationAccess } from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getConnectorRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ connectorId: string; version: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await resolveAdminBrowserApiMutationAccess(request);
    const { connectorId, version } = await context.params;
    const body = requireRecord(await readJson(request));
    if (
      typeof body.status !== "string" ||
      !CONNECTOR_STATUSES.includes(body.status as ConnectorStatus)
    ) {
      throw new RegistryValidationError("A valid connector status is required");
    }
    const connector = getConnectorRepository().updateStatus(
      connectorId,
      version,
      body.status as ConnectorStatus,
    );
    return NextResponse.json({ connector });
  } catch (error) {
    return apiError(error);
  }
}
