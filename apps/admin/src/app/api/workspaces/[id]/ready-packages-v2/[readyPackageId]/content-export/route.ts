import { serializeReadyPackageContentExportV2 } from "@markorbit/contracts";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getConfiguredReadyPackageV2Service } from "@/server/ready-package-v2-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; readyPackageId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id, readyPackageId } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, id);
    const exported = getConfiguredReadyPackageV2Service().exportContent(
      workspaceId,
      readyPackageId,
    );
    return new Response(serializeReadyPackageContentExportV2(exported), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
