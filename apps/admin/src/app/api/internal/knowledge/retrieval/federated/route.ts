import { NextResponse } from "next/server";
import {
  isKnowledgeFederatedRetrievalQueryV1,
} from "@markorbit/contracts";
import { apiError, readJson } from "@/server/api-errors";
import { listExpertTaskIdsForWorkspace } from "@/server/expert-api-access";
import { getExpertSourceRetrievalRepository } from "@/server/expert-source-retrieval";
import { KnowledgeFederatedCaseReader } from "@/server/knowledge-federated-case-reader";
import { retrieveKnowledgeFederated } from "@/server/knowledge-federated-retrieval";
import { authorizeKnowledgeRelationshipRequest } from "@/server/knowledge-relationship-auth";
import {
  getRegistryDatabase,
  getRetrievalIndexRepository,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    if (!isKnowledgeFederatedRetrievalQueryV1(body)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_KNOWLEDGE_FEDERATED_RETRIEVAL_QUERY",
            message: "Knowledge federated retrieval query is invalid.",
          },
        },
        { status: 400 },
      );
    }

    const principal = authorizeKnowledgeRelationshipRequest(request, body.workspaceId);
    const result = retrieveKnowledgeFederated(body, {
      canonical: getRetrievalIndexRepository(),
      expert: getExpertSourceRetrievalRepository(),
      cases: new KnowledgeFederatedCaseReader(getRegistryDatabase()),
      expertTaskIds: listExpertTaskIdsForWorkspace(principal.workspaceId),
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
