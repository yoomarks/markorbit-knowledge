import { describe, expect, it } from "vitest";
import { isKnowledgeRetrievalCompositionQueryV1 } from "./knowledge-retrieval-composition-v1";

const base = {
  protocolVersion: "1.0",
  objectType: "KNOWLEDGE_RETRIEVAL_COMPOSITION_QUERY",
  workspaceId: "workspace-a",
  queryText: "trademark assignment",
} as const;

describe("knowledge retrieval composition v1", () => {
  it("accepts a provider-neutral query with an objective graph seed", () => {
    expect(
      isKnowledgeRetrievalCompositionQueryV1({
        ...base,
        graphSeed: {
          protocolVersion: "1.0",
          objectType: "CONTENT_OBJECT_REF",
          objectId: "doc:one",
          objectKind: "DOCUMENT",
          workspaceId: "workspace-a",
        },
        vectorMode: "OPTIONAL",
        lexicalLimit: 25,
        graphLimit: 10,
        vectorLimit: 20,
      }),
    ).toBe(true);
  });

  it("rejects a graph seed from another workspace", () => {
    expect(
      isKnowledgeRetrievalCompositionQueryV1({
        ...base,
        graphSeed: {
          protocolVersion: "1.0",
          objectType: "CONTENT_OBJECT_REF",
          objectId: "doc:one",
          objectKind: "DOCUMENT",
          workspaceId: "workspace-b",
        },
      }),
    ).toBe(false);
  });

  it("rejects unsupported vector modes and unsafe limits", () => {
    expect(isKnowledgeRetrievalCompositionQueryV1({ ...base, vectorMode: "FAKE_VECTOR" })).toBe(
      false,
    );
    expect(isKnowledgeRetrievalCompositionQueryV1({ ...base, lexicalLimit: 0 })).toBe(false);
    expect(isKnowledgeRetrievalCompositionQueryV1({ ...base, graphLimit: 201 })).toBe(false);
  });
});
