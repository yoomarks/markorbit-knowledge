import { describe, expect, it } from "vitest";
import type {
  ContentEdgeV1,
  ContentObjectRefV1,
  KnowledgeRetrievalCompositionQueryV1,
} from "@markorbit/contracts";
import {
  KnowledgeVectorProviderUnavailableError,
  composeKnowledgeRetrieval,
  type KnowledgeGraphRetrievalReader,
  type KnowledgeLexicalRetrievalReader,
  type KnowledgeVectorRetrievalProvider,
} from "./knowledge-retrieval-composition";

const workspaceId = "workspace-a";
const seed: ContentObjectRefV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_OBJECT_REF",
  objectId: "web:seed",
  objectKind: "WEB_CONTENT",
  workspaceId,
};
const document: ContentObjectRefV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_OBJECT_REF",
  objectId: "doc:one",
  objectKind: "DOCUMENT",
  workspaceId,
};
const vectorOnly: ContentObjectRefV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_OBJECT_REF",
  objectId: "doc:two",
  objectKind: "DOCUMENT",
  workspaceId,
};
const edge: ContentEdgeV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_EDGE",
  from: seed,
  relationType: "CITES",
  to: document,
  origin: "EXPLICIT_SOURCE",
  evidenceRef: "source:line-1",
};

const query: KnowledgeRetrievalCompositionQueryV1 = {
  protocolVersion: "1.0",
  objectType: "KNOWLEDGE_RETRIEVAL_COMPOSITION_QUERY",
  workspaceId,
  queryText: "trademark assignment",
  graphSeed: seed,
};

const frozenChunkLineage = {
  chunkId: "chunk:doc-one:assignment:0",
  contentSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  indexedAt: "2026-08-27T14:00:00.000Z",
} as const;

const lexical: KnowledgeLexicalRetrievalReader = {
  search: () => [
    {
      content: document,
      indexMode: "SQLITE_FTS5_BM25",
      score: -2.75,
      snippet: "trademark assignment evidence",
      headingPath: ["Assignment"],
      ...frozenChunkLineage,
    },
  ],
};

const graph: KnowledgeGraphRetrievalReader = {
  listNeighbors: () => ({
    items: [{ direction: "OUTGOING", edge, neighbor: document }],
  }),
};

const vector: KnowledgeVectorRetrievalProvider = {
  descriptor: {
    providerId: "real-vector-provider",
    modelId: "embedding-model-v1",
    indexId: "knowledge-index-v1",
    metric: "SIMILARITY_HIGHER_IS_BETTER",
  },
  search: () => [
    { content: document, value: 0.91 },
    { content: vectorOnly, value: 0.84 },
  ],
};

describe("KG-010 retrieval composition", () => {
  it("deduplicates content while preserving exact lexical chunk lineage and graph evidence", async () => {
    const result = await composeKnowledgeRetrieval(query, lexical, graph);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].content).toEqual(document);
    expect(result.items[0].evidence.map((item) => item.channel)).toEqual(["LEXICAL", "GRAPH"]);
    expect(result.items[0].evidence[0]).toMatchObject({
      channel: "LEXICAL",
      score: -2.75,
      indexMode: "SQLITE_FTS5_BM25",
      headingPath: ["Assignment"],
      ...frozenChunkLineage,
    });
    expect(result.items[0].evidence[1]).toMatchObject({
      channel: "GRAPH",
      direction: "OUTGOING",
      edge: { evidenceRef: "source:line-1", origin: "EXPLICIT_SOURCE" },
    });
    expect(result.channels.vector).toEqual({
      available: false,
      count: 0,
      reason: "PROVIDER_UNAVAILABLE",
    });
  });

  it("fails closed when only part of lexical chunk lineage is supplied", async () => {
    const incompleteLexical: KnowledgeLexicalRetrievalReader = {
      search: () => [
        {
          content: document,
          indexMode: "SQLITE_FTS5_BM25",
          score: -2.75,
          snippet: "trademark assignment evidence",
          headingPath: ["Assignment"],
          chunkId: frozenChunkLineage.chunkId,
        },
      ],
    };

    await expect(composeKnowledgeRetrieval(query, incompleteLexical, graph)).rejects.toThrow(
      "Lexical retrieval returned incomplete chunk lineage",
    );
  });

  it("preserves real vector provider identity and native values without blending scores", async () => {
    const result = await composeKnowledgeRetrieval(query, lexical, graph, vector);
    const first = result.items.find((item) => item.content.objectId === document.objectId);
    const second = result.items.find((item) => item.content.objectId === vectorOnly.objectId);

    expect(first?.evidence.map((item) => item.channel)).toEqual(["LEXICAL", "GRAPH", "VECTOR"]);
    expect(second?.evidence).toEqual([
      {
        channel: "VECTOR",
        position: 2,
        provider: vector.descriptor,
        value: 0.84,
      },
    ]);
    expect(result.channels.vector).toEqual({
      available: true,
      count: 2,
      provider: vector.descriptor,
    });
    expect(JSON.stringify(result)).not.toContain('"blendedScore"');
    expect(JSON.stringify(result)).not.toContain('"relevanceScore"');
  });

  it("fails closed when vector retrieval is required but no provider exists", async () => {
    await expect(
      composeKnowledgeRetrieval({ ...query, vectorMode: "REQUIRED" }, lexical, graph),
    ).rejects.toBeInstanceOf(KnowledgeVectorProviderUnavailableError);
  });

  it("rejects cross-workspace vector content", async () => {
    const invalidVector: KnowledgeVectorRetrievalProvider = {
      ...vector,
      search: () => [
        {
          content: { ...vectorOnly, workspaceId: "workspace-b" },
          value: 0.5,
        },
      ],
    };

    await expect(composeKnowledgeRetrieval(query, lexical, graph, invalidVector)).rejects.toThrow(
      "VECTOR retrieval returned invalid workspace content",
    );
  });

  it("rejects graph evidence that does not connect the requested seed and neighbor", async () => {
    const inconsistentEdge: ContentEdgeV1 = {
      ...edge,
      to: vectorOnly,
    };
    const inconsistentGraph: KnowledgeGraphRetrievalReader = {
      listNeighbors: () => ({
        items: [{ direction: "OUTGOING", edge: inconsistentEdge, neighbor: document }],
      }),
    };

    await expect(composeKnowledgeRetrieval(query, lexical, inconsistentGraph)).rejects.toThrow(
      "GRAPH retrieval returned an edge inconsistent with the requested seed and neighbor",
    );
  });

  it("rejects graph evidence whose direction disagrees with the edge orientation", async () => {
    const inconsistentGraph: KnowledgeGraphRetrievalReader = {
      listNeighbors: () => ({
        items: [{ direction: "INCOMING", edge, neighbor: document }],
      }),
    };

    await expect(composeKnowledgeRetrieval(query, lexical, inconsistentGraph)).rejects.toThrow(
      "GRAPH retrieval returned an edge inconsistent with the requested seed and neighbor",
    );
  });

  it("is deterministic over unchanged channel inputs", async () => {
    const first = await composeKnowledgeRetrieval(query, lexical, graph, vector);
    const second = await composeKnowledgeRetrieval(query, lexical, graph, vector);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
