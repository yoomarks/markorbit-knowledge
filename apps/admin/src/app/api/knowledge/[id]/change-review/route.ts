import { NextResponse } from "next/server";
import { RegistryError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import { buildDocumentChangeEvidenceFeedForStaging } from "@/server/document-change-evidence-feed-service";
import { resolveKnowledgeWorkspaceReadAccess } from "@/server/knowledge-workspace-access";
import {
  getRegistryDatabase,
  getRetrievalIndexRepository,
  getStagingContentRepository,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceId } = await resolveKnowledgeWorkspaceReadAccess(request);
    const { id } = await context.params;
    const document = getStagingContentRepository().getDocument(id, workspaceId);
    if (!document) {
      throw new RegistryError(
        "KNOWLEDGE_DOCUMENT_NOT_FOUND",
        `Knowledge document ${id} was not found`,
      );
    }

    const result = buildDocumentChangeEvidenceFeedForStaging(
      getRegistryDatabase(),
      getRetrievalIndexRepository(),
      {
        workspaceId,
        stagingDocumentId: id,
        limit: 25,
      },
    );
    return NextResponse.json({
      workspaceId,
      stagingDocumentId: id,
      documentId: result.documentId,
      evidence: result.feed.items,
      complete: result.feed.nextCursor === null,
    });
  } catch (error) {
    return apiError(error);
  }
}
