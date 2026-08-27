import { describe, expect, it } from "vitest";
import type {
  ContentFacetV1,
  ContentObjectRefV1,
  KnowledgeRelationshipQueryV1,
} from "@markorbit/contracts";
import type { ContentNeighborV1 } from "@markorbit/persistence/content-relationships";
import {
  queryKnowledgeRelationships,
  type KnowledgeRelationshipRepository,
} from "./knowledge-relationship-api";

const content: ContentObjectRefV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_OBJECT_REF",
  objectId: "doc-1",
  objectKind: "DERIVED_CONTENT",
  workspaceId: "workspace-a",
};

const neighbor: ContentObjectRefV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_OBJECT_REF",
  objectId: "doc-2",
  objectKind: "DERIVED_CONTENT",
  workspaceId: "workspace-a",
};

const facets: ContentFacetV1[] = [
  {
    protocolVersion: "1.0",
    objectType: "CONTENT_FACET",
    content,
    facetType: "TOPIC",
    value: "Trademark assignment",
    normalizedValue: "trademark assignment",
    origin: "SYSTEM_DERIVED",
    evidenceRef: "evidence:facet:1",
  },
];

const items: ContentNeighborV1[] = [
  {
    direction: "OUTGOING",
    neighbor,
    edge: {
      protocolVersion: "1.0",
      objectType: "CONTENT_EDGE",
      from: content,
      relationType: "SIMILAR_TO",
      to: neighbor,
      origin: "MACHINE_DERIVED",
      evidenceRef: "evidence:edge:1",
      algorithm: { id: "content-embedding", version: "1.0.0" },
    },
  },
];

const query: KnowledgeRelationshipQueryV1 = {
  protocolVersion: "1.0",
  objectType: "KNOWLEDGE_RELATIONSHIP_QUERY",
  content,
  limit: 25,
  offset: 0,
};

function repository(): KnowledgeRelationshipRepository {
  return {
    listFacets: () => structuredClone(facets),
    listNeighbors: (_content, limit, offset) => ({
      items: structuredClone(items),
      total: 3,
      limit: limit ?? 50,
      offset: offset ?? 0,
    }),
  };
}

describe("KG-009 knowledge relationship API model", () => {
  it("preserves objective facets, edge provenance, and repository order", () => {
    const result = queryKnowledgeRelationships(repository(), query);

    expect(result.content).toEqual(content);
    expect(result.facets).toEqual(facets);
    expect(result.relationships.items).toEqual(items);
    expect(result.relationships.items[0]?.edge).toMatchObject({
      origin: "MACHINE_DERIVED",
      evidenceRef: "evidence:edge:1",
      algorithm: { id: "content-embedding", version: "1.0.0" },
    });
    expect(result.relationships).toMatchObject({ total: 3, limit: 25, offset: 0, hasMore: true });
  });

  it("is deterministic over an unchanged relationship projection", () => {
    expect(queryKnowledgeRelationships(repository(), query)).toEqual(
      queryKnowledgeRelationships(repository(), query),
    );
  });

  it("does not decorate results with Reader or scoring fields", () => {
    const serialized = JSON.stringify(queryKnowledgeRelationships(repository(), query));
    expect(serialized).not.toContain("readerHref");
    expect(serialized).not.toContain("sourceName");
    expect(serialized).not.toContain("relevance");
    expect(serialized).not.toContain("score");
  });
});
