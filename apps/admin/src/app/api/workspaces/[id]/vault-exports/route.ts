import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getConfiguredVaultExportService } from "@/server/vault-export-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, id);
    return NextResponse.json(getConfiguredVaultExportService().overview(workspaceId));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = requireRecord(await readJson(request));
    const stagingDocumentId =
      typeof body.stagingDocumentId === "string" ? body.stagingDocumentId.trim() : "";
    if (!stagingDocumentId) {
      throw new RegistryValidationError("stagingDocumentId is required");
    }
    const { id } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiMutationAccess(request, id);
    return NextResponse.json({
      run: getConfiguredVaultExportService().submit(workspaceId, stagingDocumentId),
    });
  } catch (error) {
    return apiError(error);
  }
}
