import { describe, expect, it } from "vitest";
import type { ContentEdgeV1, ContentFacetV1, ContentObjectRefV1 } from "@markorbit/contracts";
import {
  buildKnowledgeObsidianRelationshipNote,
  knowledgeObsidianNoteTargetPath,
  type ContentRelationshipReadRepository,
} from "./content-relationship-obsidian-export";

const article: ContentObjectRefV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_OBJECT_REF",
  objectId: "web:article:assignment-guide",
  objectKind: "WEB_CONTENT",
  workspaceId: "workspace-a",
};

const expert: ContentObjectRefV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_OBJECT_REF",
  objectId: "expert:source:assignment-reply",
  objectKind: "EXPERT_SOURCE",
  workspaceId: "workspace-a",
};

const source: ContentFacetV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_FACET",
  content: article,
  facetType: "SOURCE",
  value: "USPTO",
  normalizedValue: "uspto",
  origin: "EXPLICIT_SOURCE",
};

const topic: ContentFacetV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_FACET",
  content: article,
  facetType: "TOPIC",
  value: "Assignment",
  normalizedValue: "assignment",
  origin: "SYSTEM_DERIVED",
};

const citation: ContentEdgeV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_EDGE",
  from: expert,
  relationType: "CITES",
  to: article,
  origin: "EXPLICIT_SOURCE",
};

function repository(): ContentRelationshipReadRepository {
  return {
    listFacets: () => [source, topic],
    listNeighbors: () => ({
      items: [
        {
          direction: "INCOMING",
          edge: citation,
          neighbor: expert,
        },
      ],
      total: 1,
      limit: 200,
      offset: 0,
    }),
  };
}

describe("Knowledge Obsidian relationship export", () => {
  it("renders deterministic metadata, facets and backlinks", () => {
    const first = buildKnowledgeObsidianRelationshipNote(repository(), {
      content: article,
      title: "Assignment Guide",
      bodyMarkdown: "Canonical body.",
      sourceRef: "https://example.test/assignment",
      access: {
        authorized: true,
        workspaceId: "workspace-a",
        classification: "INTERNAL",
      },
    });
    const replay = buildKnowledgeObsidianRelationshipNote(repository(), {
      content: article,
      title: "Assignment Guide",
      bodyMarkdown: "Canonical body.",
      sourceRef: "https://example.test/assignment",
      access: {
        authorized: true,
        workspaceId: "workspace-a",
        classification: "INTERNAL",
      },
    });

    expect(replay).toEqual(first);
    expect(first.targetPath).toBe(knowledgeObsidianNoteTargetPath(article));
    expect(first.markdown).toContain('knowledge_id: "web:article:assignment-guide"');
    expect(first.markdown).toContain("- SOURCE: USPTO (EXPLICIT_SOURCE)");
    expect(first.markdown).toContain("- TOPIC: Assignment (SYSTEM_DERIVED)");
    expect(first.markdown).toContain("## Backlinks");
    expect(first.markdown).toContain("— CITES (EXPLICIT_SOURCE)");
  });

  it("fails closed without an authorized matching workspace context", () => {
    expect(() =>
      buildKnowledgeObsidianRelationshipNote(repository(), {
        content: article,
        title: "Assignment Guide",
        bodyMarkdown: "Canonical body.",
        access: {
          authorized: false,
          workspaceId: "workspace-a",
          classification: "CONFIDENTIAL",
        },
      }),
    ).toThrow(/authorized server-side context/i);

    expect(() =>
      buildKnowledgeObsidianRelationshipNote(repository(), {
        content: article,
        title: "Assignment Guide",
        bodyMarkdown: "Canonical body.",
        access: {
          authorized: true,
          workspaceId: "workspace-b",
          classification: "CONFIDENTIAL",
        },
      }),
    ).toThrow(/workspace does not match/i);
  });

  it("rejects truncated neighborhoods instead of silently omitting links", () => {
    const truncated: ContentRelationshipReadRepository = {
      listFacets: () => [],
      listNeighbors: () => ({
        items: [],
        total: 201,
        limit: 200,
        offset: 0,
      }),
    };

    expect(() =>
      buildKnowledgeObsidianRelationshipNote(truncated, {
        content: article,
        title: "Assignment Guide",
        bodyMarkdown: "Canonical body.",
        access: {
          authorized: true,
          workspaceId: "workspace-a",
          classification: "INTERNAL",
        },
      }),
    ).toThrow(/truncated relationship neighborhoods/i);
  });
});
