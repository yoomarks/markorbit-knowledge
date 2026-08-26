import { describe, expect, it } from "vitest";
import type { ContentEdgeV1, ContentFacetV1, ContentObjectRefV1 } from "@markorbit/contracts";
import { buildKnowledgeReaderRelationships } from "./knowledge-reader-relationships";

const current: ContentObjectRefV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_OBJECT_REF",
  objectId: "std_current",
  objectKind: "DERIVED_CONTENT",
  workspaceId: "workspace-a",
};
const related: ContentObjectRefV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_OBJECT_REF",
  objectId: "std_related",
  objectKind: "DERIVED_CONTENT",
  workspaceId: "workspace-a",
};
const backlink: ContentObjectRefV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_OBJECT_REF",
  objectId: "expert:reply:1",
  objectKind: "EXPERT_SOURCE",
  workspaceId: "workspace-a",
};
const outgoing: ContentEdgeV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_EDGE",
  from: current,
  relationType: "CITES",
  to: related,
  origin: "EXPLICIT_SOURCE",
  evidenceRef: "raw:current:1",
};
const incoming: ContentEdgeV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_EDGE",
  from: backlink,
  relationType: "CITES",
  to: current,
  origin: "HUMAN_CONFIRMED",
  evidenceRef: "raw:expert:1",
};
const jurisdiction: ContentFacetV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_FACET",
  content: related,
  facetType: "JURISDICTION",
  value: "US",
  normalizedValue: "us",
  origin: "EXPLICIT_SOURCE",
};

const repository = {
  listFacets(content: ContentObjectRefV1) {
    return content.objectId === related.objectId ? [jurisdiction] : [];
  },
  listNeighbors() {
    return {
      items: [
        { direction: "OUTGOING" as const, edge: outgoing, neighbor: related },
        { direction: "INCOMING" as const, edge: incoming, neighbor: backlink },
      ],
      total: 2,
      limit: 200,
      offset: 0,
    };
  },
  listBacklinks() {
    return { items: [incoming], total: 1, limit: 200, offset: 0 };
  },
};

describe("buildKnowledgeReaderRelationships", () => {
  it("separates outgoing related content from incoming backlinks and preserves provenance", () => {
    const model = buildKnowledgeReaderRelationships(repository, current, (content) =>
      content.objectId === related.objectId
        ? {
            title: "Related filing guide",
            readerHref: "/knowledge/std_related?workspaceId=workspace-a",
            version: 3,
            jurisdictions: ["CA"],
          }
        : undefined,
    );

    expect(model.related).toHaveLength(1);
    expect(model.backlinks).toHaveLength(1);
    expect(model.related[0]).toMatchObject({
      direction: "OUTGOING",
      relationType: "CITES",
      origin: "EXPLICIT_SOURCE",
      evidenceRef: "raw:current:1",
      content: {
        objectId: "std_related",
        objectKind: "DERIVED_CONTENT",
        title: "Related filing guide",
        version: 3,
        jurisdictions: ["CA", "US"],
      },
    });
    expect(model.backlinks[0]).toMatchObject({
      direction: "INCOMING",
      relationType: "CITES",
      origin: "HUMAN_CONFIRMED",
      evidenceRef: "raw:expert:1",
      content: { objectId: "expert:reply:1", objectKind: "EXPERT_SOURCE" },
    });
    expect(model.truncated).toBe(false);
  });

  it("signals a truncated neighborhood instead of implying graph completeness", () => {
    const truncated = {
      ...repository,
      listNeighbors: () => ({ items: [], total: 201, limit: 200, offset: 0 }),
      listBacklinks: () => ({ items: [], total: 0, limit: 200, offset: 0 }),
    };
    expect(buildKnowledgeReaderRelationships(truncated, current).truncated).toBe(true);
  });
});
