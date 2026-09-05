import { NextResponse } from "next/server";
import type { ContentObjectRefV1 } from "@markorbit/contracts";
import { RegistryError } from "@markorbit/persistence";
import { SqliteContentRelationshipRepository } from "@markorbit/persistence/content-relationships";
import { knowledgeWorkspaceHref } from "@/lib/knowledge-workspace-model";
import { apiError } from "@/server/api-errors";
import {
  buildKnowledgeReaderGraph,
  type KnowledgeReaderGraphDepth,
} from "@/server/knowledge-reader-graph";
import { resolveKnowledgeWorkspaceReadAccess } from "@/server/knowledge-workspace-access";
import {
  getRawArtifactRepository,
  getRegistryDatabase,
  getSourceRepository,
  getStagingContentRepository,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function graphDepth(request: Request): KnowledgeReaderGraphDepth {
  const raw = new URL(request.url).searchParams.get("depth")?.trim() || "2";
  if (raw === "1") return 1;
  if (raw === "2") return 2;
  throw new RegistryError("KNOWLEDGE_GRAPH_DEPTH_INVALID", "Knowledge graph depth must be 1 or 2");
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { workspaceId } = await resolveKnowledgeWorkspaceReadAccess(request);
    const depth = graphDepth(request);
    const staging = getStagingContentRepository();
    const record = staging.getDocument(id, workspaceId);
    if (!record) {
      throw new RegistryError(
        "KNOWLEDGE_DOCUMENT_NOT_FOUND",
        `Knowledge document ${id} was not found`,
      );
    }

    const relationships = new SqliteContentRelationshipRepository(getRegistryDatabase());
    const sources = getSourceRepository();
    const artifacts = getRawArtifactRepository();
    const content: ContentObjectRefV1 = {
      protocolVersion: "1.0",
      objectType: "CONTENT_OBJECT_REF",
      objectId: record.descriptor.id,
      objectKind: "DERIVED_CONTENT",
      workspaceId,
    };

    const model = buildKnowledgeReaderGraph(relationships, content, {
      depth,
      resolveMetadata: (neighbor) => {
        if (neighbor.objectKind !== "DERIVED_CONTENT") return undefined;
        const neighborRecord = staging.getDocument(neighbor.objectId, workspaceId);
        if (!neighborRecord) return undefined;
        const source = sources.getById(neighborRecord.descriptor.sourceId);
        const artifact =
          artifacts.getArtifact(neighborRecord.descriptor.rawArtifactId)?.artifact ?? null;
        return {
          title: neighborRecord.descriptor.title,
          ...(source?.name ? { sourceName: source.name } : {}),
          ...(artifact ? { version: artifact.version } : {}),
          ...(source?.jurisdictions ? { jurisdictions: source.jurisdictions } : {}),
          readerHref: knowledgeWorkspaceHref(
            `/knowledge/${encodeURIComponent(neighbor.objectId)}`,
            workspaceId,
          ),
        };
      },
    });

    return NextResponse.json(model);
  } catch (error) {
    return apiError(error);
  }
}
