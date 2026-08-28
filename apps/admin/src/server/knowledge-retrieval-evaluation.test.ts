import { describe, expect, it } from "vitest";
import type {
  ContentObjectRefV1,
  KnowledgeRetrievalCompositionResultV1,
} from "@markorbit/contracts";
import { evaluateKnowledgeRetrieval } from "./knowledge-retrieval-evaluation";

const workspaceId = "workspace-eval";
const shaA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const shaB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function content(objectId: string): ContentObjectRefV1 {
  return {
    protocolVersion: "1.0",
    objectType: "CONTENT_OBJECT_REF",
    objectId,
    objectKind: "DOCUMENT",
    workspaceId,
  };
}

const expectedLexical = content("doc:expected-lexical");
const expectedLate = content("doc:expected-late");
const expectedGraph = content("doc:expected-graph");
const irrelevantGraph = content("doc:irrelevant-graph");

const frozenResult = {
  protocolVersion: "1.0",
  objectType: "KNOWLEDGE_RETRIEVAL_COMPOSITION_RESULT",
  workspaceId,
  queryText: "frozen representative research question",
  channels: {
    lexical: { available: true, count: 2 },
    graph: { available: true, count: 2 },
    vector: { available: false, count: 0, reason: "PROVIDER_UNAVAILABLE" },
  },
  items: [
    {
      content: expectedLexical,
      evidence: [
        {
          channel: "LEXICAL",
          position: 1,
          indexMode: "SQLITE_FTS5_BM25",
          score: -4.2,
          snippet: "expected lexical source",
          headingPath: ["Expected"],
          chunkId: "chunk:expected:0",
          contentSha256: shaA,
          indexedAt: "2026-08-27T15:00:00.000Z",
        },
      ],
    },
    {
      content: expectedLate,
      evidence: [
        {
          channel: "LEXICAL",
          position: 3,
          indexMode: "SQLITE_FTS5_BM25",
          score: -2.1,
          snippet: "late expected source",
          headingPath: ["Late"],
        },
      ],
    },
    {
      content: expectedGraph,
      evidence: [{ channel: "GRAPH", position: 1 }],
    },
    {
      content: irrelevantGraph,
      evidence: [{ channel: "GRAPH", position: 2 }],
    },
  ],
} as KnowledgeRetrievalCompositionResultV1;

const frozenEvaluation = {
  k: 2,
  expectedSources: [
    {
      content: expectedLexical,
      chunks: [{ chunkId: "chunk:expected:0", contentSha256: shaA }],
    },
    {
      content: expectedLate,
      chunks: [{ chunkId: "chunk:late:0", contentSha256: shaB }],
    },
    { content: expectedGraph },
  ],
};

describe("Knowledge retrieval evaluation", () => {
  it("scores frozen channel-native evidence without blending relevance", () => {
    expect(evaluateKnowledgeRetrieval(frozenResult, frozenEvaluation)).toEqual({
      expectedDocumentCount: 3,
      lexicalDocumentHitsAtK: 1,
      documentRecallAtK: 1 / 3,
      expectedChunkCount: 2,
      exactChunkHits: 1,
      exactChunkHitRate: 0.5,
      lexicalEvidenceCount: 2,
      lexicalProvenanceCompleteCount: 1,
      provenanceCompletenessRate: 0.5,
      graphExpandedOnlyCount: 2,
      graphExpandedExpectedCount: 1,
      graphExpandedIrrelevantCount: 1,
      relationshipExpansionContributionRate: 0.5,
      relationshipExpansionNoiseRate: 0.5,
    });
  });

  it("is deterministic over an unchanged frozen result and expectation", () => {
    const first = evaluateKnowledgeRetrieval(frozenResult, frozenEvaluation);
    const second = evaluateKnowledgeRetrieval(frozenResult, frozenEvaluation);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("matches exact chunk identity and hash rather than chunk id alone", () => {
    const wrongHash = {
      ...frozenEvaluation,
      expectedSources: [
        {
          content: expectedLexical,
          chunks: [{ chunkId: "chunk:expected:0", contentSha256: shaB }],
        },
      ],
    };

    expect(evaluateKnowledgeRetrieval(frozenResult, wrongHash).exactChunkHitRate).toBe(0);
  });

  it("fails closed on duplicate expected source identities", () => {
    expect(() =>
      evaluateKnowledgeRetrieval(frozenResult, {
        k: 2,
        expectedSources: [{ content: expectedLexical }, { content: expectedLexical }],
      }),
    ).toThrow("Retrieval evaluation contains duplicate expected sources");
  });

  it("fails closed on invalid expected chunk lineage", () => {
    expect(() =>
      evaluateKnowledgeRetrieval(frozenResult, {
        k: 2,
        expectedSources: [
          {
            content: expectedLexical,
            chunks: [{ chunkId: "chunk:expected:0", contentSha256: "not-a-sha" }],
          },
        ],
      }),
    ).toThrow("Retrieval evaluation contains invalid expected chunk lineage");
  });
});
