import { describe, expect, it } from "vitest";
import {
  isKnowledgeRelationshipQueryV1,
  type KnowledgeRelationshipQueryV1,
} from "./knowledge-relationship-query-v1";

const validQuery: KnowledgeRelationshipQueryV1 = {
  protocolVersion: "1.0",
  objectType: "KNOWLEDGE_RELATIONSHIP_QUERY",
  content: {
    protocolVersion: "1.0",
    objectType: "CONTENT_OBJECT_REF",
    objectId: "doc-1",
    objectKind: "DERIVED_CONTENT",
    workspaceId: "workspace-a",
  },
  limit: 25,
  offset: 0,
};

describe("knowledge relationship query v1", () => {
  it("accepts a provider-neutral content relationship query", () => {
    expect(isKnowledgeRelationshipQueryV1(validQuery)).toBe(true);
  });

  it("rejects invalid pagination", () => {
    expect(isKnowledgeRelationshipQueryV1({ ...validQuery, limit: 0 })).toBe(false);
    expect(isKnowledgeRelationshipQueryV1({ ...validQuery, limit: 1.5 })).toBe(false);
    expect(isKnowledgeRelationshipQueryV1({ ...validQuery, offset: -1 })).toBe(false);
    expect(isKnowledgeRelationshipQueryV1({ ...validQuery, offset: 1.5 })).toBe(false);
  });

  it("rejects malformed content references and protocol drift", () => {
    expect(
      isKnowledgeRelationshipQueryV1({
        ...validQuery,
        content: { ...validQuery.content, workspaceId: " workspace-a" },
      }),
    ).toBe(false);
    expect(isKnowledgeRelationshipQueryV1({ ...validQuery, protocolVersion: "2.0" })).toBe(false);
  });
});
