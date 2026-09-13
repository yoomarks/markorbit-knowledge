import { serializeReadyPackageContentExportV1_1 } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { buildConfiguredBrainReadyPackageExport } from "@/server/knowledge-brain-ready-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const url = new URL(request.url);
    const assertedWorkspaceId = url.searchParams.get("workspaceId")?.trim() || "";
    const knowledgeWorkspaceId = url.searchParams.get("knowledgeWorkspaceId")?.trim() || "";
    if (!assertedWorkspaceId) throw new RegistryValidationError("workspaceId is required");
    if (!knowledgeWorkspaceId) {
      throw new RegistryValidationError("knowledgeWorkspaceId is required");
    }

    const { id } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
    const exported = await buildConfiguredBrainReadyPackageExport({
      viewerWorkspaceId: workspaceId,
      knowledgeWorkspaceId,
      readyPackageId: id,
    });
    return new Response(serializeReadyPackageContentExportV1_1(exported), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${id}-brain-ready.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
