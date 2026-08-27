import { NextResponse } from "next/server";
import {
  isKnowledgeRelationshipQueryV1,
  type KnowledgeRelationshipQueryV1,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteContentRelationshipRepository } from "@markorbit/persistence/content-relationships";
import { apiError, readJson } from "@/server/api-errors";
import { authorizeKnowledgeRelationshipRequest } from "@/server/knowledge-relationship-auth";
import { queryKnowledgeRelationships } from "@/server/knowledge-relationship-api";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    if (!isKnowledgeRelationshipQueryV1(body)) {
      throw new RegistryValidationError("Knowledge relationship query is invalid");
    }
    const query: KnowledgeRelationshipQueryV1 = body;
    authorizeKnowledgeRelationshipRequest(request, query.content.workspaceId);

    const repository = new SqliteContentRelationshipRepository(getRegistryDatabase());
    return NextResponse.json(queryKnowledgeRelationships(repository, query));
  } catch (error) {
    return apiError(error);
  }
}
