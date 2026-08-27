import {
  isKnowledgeRelationshipQueryV1,
  type ContentFacetV1,
  type ContentObjectRefV1,
  type KnowledgeRelationshipQueryV1,
  type KnowledgeRelationshipResultV1,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import type { ContentNeighborV1 } from "@markorbit/persistence/content-relationships";

export interface KnowledgeRelationshipRepository {
  listFacets(content: ContentObjectRefV1): ContentFacetV1[];
  listNeighbors(
    content: ContentObjectRefV1,
    limit?: number,
    offset?: number,
  ): {
    items: ContentNeighborV1[];
    total: number;
    limit: number;
    offset: number;
  };
}

export function queryKnowledgeRelationships(
  repository: KnowledgeRelationshipRepository,
  query: KnowledgeRelationshipQueryV1,
): KnowledgeRelationshipResultV1 {
  if (!isKnowledgeRelationshipQueryV1(query)) {
    throw new RegistryValidationError("Knowledge relationship query is invalid");
  }

  const page = repository.listNeighbors(query.content, query.limit, query.offset);
  return {
    protocolVersion: "1.0",
    objectType: "KNOWLEDGE_RELATIONSHIP_RESULT",
    content: structuredClone(query.content),
    facets: structuredClone(repository.listFacets(query.content)),
    relationships: {
      items: structuredClone(page.items),
      total: page.total,
      limit: page.limit,
      offset: page.offset,
      hasMore: page.offset + page.items.length < page.total,
    },
  };
}
