import { NextResponse } from "next/server";
import { RegistryError } from "@markorbit/persistence";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { buildDocumentChangeEvidenceFeed } from "@/server/document-change-evidence-feed-service";
import { getRegistryDatabase, getStagingContentRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const search = new URL(request.url).searchParams;
    const assertedWorkspaceId = search.get("workspaceId")?.trim();
    if (!assertedWorkspaceId) {
      throw new RegistryError(
        "KNOWLEDGE_CHANGE_REVIEW_WORKSPACE_REQUIRED",
        "workspaceId query parameter is required",
      );
    }
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
    const { id } = await context.params;
    const document = getStagingContentRepository().getDocument(id, workspaceId);
    if (!document) {
      throw new RegistryError(
        "KNOWLEDGE_DOCUMENT_NOT_FOUND",
        `Knowledge document ${id} was not found`,
      );
    }

    const feed = buildDocumentChangeEvidenceFeed(getRegistryDatabase(), {
      workspaceId,
      documentId: id,
      limit: 25,
    });
    return NextResponse.json({
      workspaceId,
      documentId: id,
      evidence: feed.items,
      complete: feed.nextCursor === null,
    });
  } catch (error) {
    return apiError(error);
  }
}
