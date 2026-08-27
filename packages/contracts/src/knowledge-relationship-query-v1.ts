import {
  isContentObjectRefV1,
  type ContentEdgeV1,
  type ContentFacetV1,
  type ContentObjectRefV1,
} from "./content-relationship-v1";

export const KNOWLEDGE_RELATIONSHIP_QUERY_PROTOCOL_VERSION = "1.0" as const;

export type KnowledgeRelationshipQueryV1 = {
  protocolVersion: typeof KNOWLEDGE_RELATIONSHIP_QUERY_PROTOCOL_VERSION;
  objectType: "KNOWLEDGE_RELATIONSHIP_QUERY";
  content: ContentObjectRefV1;
  limit?: number;
  offset?: number;
};

export type KnowledgeRelationshipItemV1 = {
  direction: "OUTGOING" | "INCOMING";
  edge: ContentEdgeV1;
  neighbor: ContentObjectRefV1;
};

export type KnowledgeRelationshipResultV1 = {
  protocolVersion: typeof KNOWLEDGE_RELATIONSHIP_QUERY_PROTOCOL_VERSION;
  objectType: "KNOWLEDGE_RELATIONSHIP_RESULT";
  content: ContentObjectRefV1;
  facets: ContentFacetV1[];
  relationships: {
    items: KnowledgeRelationshipItemV1[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isKnowledgeRelationshipQueryV1(value: unknown): value is KnowledgeRelationshipQueryV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const query = value as Record<string, unknown>;
  return (
    query.protocolVersion === KNOWLEDGE_RELATIONSHIP_QUERY_PROTOCOL_VERSION &&
    query.objectType === "KNOWLEDGE_RELATIONSHIP_QUERY" &&
    isContentObjectRefV1(query.content) &&
    (query.limit === undefined || positiveInteger(query.limit)) &&
    (query.offset === undefined || nonNegativeInteger(query.offset))
  );
}
