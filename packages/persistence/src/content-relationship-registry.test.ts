import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { ContentEdgeV1, ContentFacetV1, ContentObjectRefV1 } from "@markorbit/contracts";
import { SqliteContentRelationshipRepository } from "./content-relationship-registry";

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

const topic: ContentFacetV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_FACET",
  content: article,
  facetType: "TOPIC",
  value: "US Trademark Assignment",
  normalizedValue: "us trademark assignment",
  origin: "SYSTEM_DERIVED",
};

const source: ContentFacetV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_FACET",
  content: article,
  facetType: "SOURCE",
  value: "USPTO",
  normalizedValue: "uspto",
  origin: "EXPLICIT_SOURCE",
  evidenceRef: "raw:article:1",
};

const citation: ContentEdgeV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_EDGE",
  from: expert,
  relationType: "CITES",
  to: article,
  origin: "EXPLICIT_SOURCE",
  evidenceRef: "raw:expert:1",
};

function repository() {
  const database = new DatabaseSync(":memory:");
  return {
    database,
    repo: new SqliteContentRelationshipRepository(
      database,
      () => new Date("2026-08-26T12:00:00.000Z"),
    ),
  };
}

describe("SqliteContentRelationshipRepository", () => {
  it("persists facets and edges idempotently", () => {
    const { database, repo } = repository();
    try {
      repo.upsertFacet(topic);
      repo.upsertFacet(topic);
      repo.upsertEdge(citation);
      repo.upsertEdge(citation);

      expect(repo.listFacets(article)).toEqual([topic]);
      expect(repo.listBacklinks(article).items).toEqual([citation]);
      expect(
        database.prepare("SELECT COUNT(*) AS count FROM content_relationship_facets").get(),
      ).toMatchObject({ count: 1 });
      expect(
        database.prepare("SELECT COUNT(*) AS count FROM content_relationship_edges").get(),
      ).toMatchObject({ count: 1 });
    } finally {
      database.close();
    }
  });

  it("rebuilds one content projection without mutating incoming backlinks", () => {
    const { database, repo } = repository();
    try {
      repo.upsertEdge(citation);
      repo.replaceProjection(article, [topic, source], []);
      expect(repo.listFacets(article)).toEqual([source, topic]);
      expect(repo.listBacklinks(article)).toMatchObject({
        total: 1,
        items: [citation],
      });

      repo.replaceProjection(article, [topic], []);
      expect(repo.listFacets(article)).toEqual([topic]);
      expect(repo.listBacklinks(article).total).toBe(1);
    } finally {
      database.close();
    }
  });

  it("retrieves backlinks, local neighbors and objective facet matches deterministically", () => {
    const { database, repo } = repository();
    try {
      repo.upsertFacet(topic);
      repo.upsertEdge(citation);

      expect(repo.listBacklinks(article)).toMatchObject({
        total: 1,
        items: [citation],
      });
      expect(repo.listNeighbors(article).items).toMatchObject([
        { direction: "INCOMING", neighbor: expert },
      ]);
      expect(repo.listNeighbors(expert).items).toMatchObject([
        { direction: "OUTGOING", neighbor: article },
      ]);
      expect(repo.findContentByFacet("workspace-a", "TOPIC", "us trademark assignment")).toEqual({
        items: [article],
        total: 1,
        limit: 50,
        offset: 0,
      });
      expect(repo.findContentByFacet("workspace-b", "TOPIC", "us trademark assignment").total).toBe(
        0,
      );
    } finally {
      database.close();
    }
  });
});
