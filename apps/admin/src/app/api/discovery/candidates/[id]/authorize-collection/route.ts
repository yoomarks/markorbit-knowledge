import { NextResponse } from "next/server";
import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { resolveAdminBrowserApiMutationAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getDiscoveryCollectionService } from "@/server/discovery-collection-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { principal } = await resolveAdminBrowserApiMutationAccess(request, DEFAULT_WORKSPACE.id);
    const { id } = await context.params;
    const result = getDiscoveryCollectionService().authorizeAndDispatch(id, {
      requestedBy: principal.userId,
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
