import { NextResponse } from "next/server";
import { RegistryNotFoundError } from "@markorbit/persistence";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getCollectionPlanRepository, getSourceRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const source = getSourceRepository().getById(id);
    if (!source) throw new RegistryNotFoundError(id);
    const { principal } = await resolveAdminBrowserApiReadAccess(request, source.workspaceId);
    assertAdminBrowserResourceWorkspace(principal, source.workspaceId);
    return NextResponse.json({ items: getCollectionPlanRepository().listForSource(id) });
  } catch (error) {
    return apiError(error);
  }
}
