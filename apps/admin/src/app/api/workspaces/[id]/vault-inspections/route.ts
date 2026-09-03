import { NextResponse } from "next/server";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getConfiguredVaultInspectionService } from "@/server/vault-inspection-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, id);
    return NextResponse.json(getConfiguredVaultInspectionService().overview(workspaceId));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiMutationAccess(request, id);
    return NextResponse.json(
      { run: getConfiguredVaultInspectionService().inspect(workspaceId) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
