import { NextResponse } from "next/server";
import {
  RETRIEVAL_INDEX_MODE,
  isKnowledgeRetrievalCompositionQueryV1,
  type ContentObjectRefV1,
} from "@markorbit/contracts";
import { SqliteContentRelationshipRepository } from "@markorbit/persistence/content-relationships";
import { apiError, readJson } from "@/server/api-errors";
import { authorizeKnowledgeRelationshipRequest } from "@/server/knowledge-relationship-auth";
import {
  KnowledgeVectorProviderUnavailableError,
  composeKnowledgeRetrieval,
  type KnowledgeLexicalRetrievalReader,
} from "@/server/knowledge-retrieval-composition";
import { getRegistryDatabase, getRetrievalIndexRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    if (!isKnowledgeRetrievalCompositionQueryV1(body)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_KNOWLEDGE_RETRIEVAL_COMPOSITION_QUERY",
            message: "Knowledge retrieval composition query is invalid.",
          },
        },
        { status: 400 },
      );
    }

    authorizeKnowledgeRelationshipRequest(request, body.workspaceId);

    const retrieval = getRetrievalIndexRepository();
    const lexical: KnowledgeLexicalRetrievalReader = {
      search: ({ workspaceId, queryText, limit }) =>
        retrieval.search({ workspaceId, query: queryText, limit }).items.map((hit) => {
          const content: ContentObjectRefV1 = {
            protocolVersion: "1.0",
            objectType: "CONTENT_OBJECT_REF",
            objectId: hit.document.documentId,
            objectKind: "DOCUMENT",
            workspaceId: hit.document.workspaceId,
          };
          return {
            content,
            indexMode: RETRIEVAL_INDEX_MODE,
            score: hit.score,
            snippet: hit.snippet,
            headingPath: [...hit.chunk.headingPath],
            chunkId: hit.chunk.chunkId,
            contentSha256: hit.chunk.contentSha256,
            indexedAt: hit.document.indexedAt,
          };
        }),
    };
    const graph = new SqliteContentRelationshipRepository(getRegistryDatabase());
    const result = await composeKnowledgeRetrieval(body, lexical, graph);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof KnowledgeVectorProviderUnavailableError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.httpStatus },
      );
    }
    return apiError(error);
  }
}
