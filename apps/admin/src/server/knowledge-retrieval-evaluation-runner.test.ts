import { describe, expect, it } from "vitest";
import type {
  ContentObjectRefV1,
  KnowledgeRetrievalCompositionResultV1,
} from "@markorbit/contracts";
import {
  runFrozenRetrievalEvaluation,
  type FrozenRetrievalFixtureV1,
} from "./knowledge-retrieval-evaluation-runner";

const workspaceId = "workspace-runner";
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

const expectedA = content("doc:runner-a");
const expectedB = content("doc:runner-b");
const irrelevantGraph = content("doc:runner-graph-noise");

const fixture: FrozenRetrievalFixtureV1 = {
  schemaVersion: "1.0",
  fixtureId: "retrieval-us-trademark-baseline",
  fixtureVersion: "2026-08-28.1",
  queries: [
    {
      queryId: "filing-basics",
      workspaceId,
      queryText: "What evidence explains the filing basis?",
      evaluation: {
        k: 2,
        expectedSources: [
          {
            content: expectedA,
            chunks: [{ chunkId: "chunk:a:0", contentSha256: shaA }],
          },
        ],
      },
    },
    {
      queryId: "section-8",
      workspaceId,
      queryText: "What evidence explains Section 8 maintenance?",
      evaluation: {
        k: 2,
        expectedSources: [
          {
            content: expectedB,
            chunks: [{ chunkId: "chunk:b:0", contentSha256: shaB }],
          },
        ],
      },
    },
  ],
};

function result(
  queryText: string,
  contentRef: ContentObjectRefV1,
  chunkId: string,
  contentSha256: string,
  graphTarget?: ContentObjectRefV1,
): KnowledgeRetrievalCompositionResultV1 {
  return {
    protocolVersion: "1.0",
    objectType: "KNOWLEDGE_RETRIEVAL_COMPOSITION_RESULT",
    workspaceId,
    queryText,
    channels: {
      lexical: { available: true, count: 1 },
      graph: { available: Boolean(graphTarget), count: graphTarget ? 1 : 0 },
      vector: { available: false, count: 0, reason: "PROVIDER_UNAVAILABLE" },
    },
    items: [
      {
        content: contentRef,
        evidence: [
          {
            channel: "LEXICAL",
            position: 1,
            indexMode: "SQLITE_FTS5_BM25",
            score: -1,
            snippet: "frozen lexical evidence",
            headingPath: ["Frozen"],
            chunkId,
            contentSha256,
            indexedAt: "2026-08-28T00:00:00.000Z",
          },
        ],
      },
      ...(graphTarget
        ? [
            {
              content: graphTarget,
              evidence: [
                {
                  channel: "GRAPH" as const,
                  position: 1,
                  seed: contentRef,
                  direction: "OUTGOING" as const,
                  edge: {
                    protocolVersion: "1.0" as const,
                    objectType: "CONTENT_EDGE" as const,
                    from: contentRef,
                    relationType: "SIMILAR_TO" as const,
                    to: graphTarget,
                    origin: "SYSTEM_DERIVED" as const,
                  },
                },
              ],
            },
          ]
        : []),
    ],
  };
}

const results = [
  {
    queryId: "filing-basics",
    result: result(fixture.queries[0].queryText, expectedA, "chunk:a:0", shaA, irrelevantGraph),
  },
  {
    queryId: "section-8",
    result: result(fixture.queries[1].queryText, expectedB, "chunk:b:0", shaB),
  },
];

describe("Frozen retrieval evaluation runner", () => {
  it("scores a versioned frozen query set and aggregates channel-native metrics", () => {
    expect(runFrozenRetrievalEvaluation(fixture, results)).toEqual({
      schemaVersion: "1.0",
      fixtureId: "retrieval-us-trademark-baseline",
      fixtureVersion: "2026-08-28.1",
      queries: [
        {
          queryId: "filing-basics",
          metrics: {
            expectedDocumentCount: 1,
            lexicalDocumentHitsAtK: 1,
            documentRecallAtK: 1,
            expectedChunkCount: 1,
            exactChunkHits: 1,
            exactChunkHitRate: 1,
            lexicalEvidenceCount: 1,
            lexicalProvenanceCompleteCount: 1,
            provenanceCompletenessRate: 1,
            graphExpandedOnlyCount: 1,
            graphExpandedExpectedCount: 0,
            graphExpandedIrrelevantCount: 1,
            relationshipExpansionContributionRate: 0,
            relationshipExpansionNoiseRate: 1,
          },
        },
        {
          queryId: "section-8",
          metrics: {
            expectedDocumentCount: 1,
            lexicalDocumentHitsAtK: 1,
            documentRecallAtK: 1,
            expectedChunkCount: 1,
            exactChunkHits: 1,
            exactChunkHitRate: 1,
            lexicalEvidenceCount: 1,
            lexicalProvenanceCompleteCount: 1,
            provenanceCompletenessRate: 1,
            graphExpandedOnlyCount: 0,
            graphExpandedExpectedCount: 0,
            graphExpandedIrrelevantCount: 0,
            relationshipExpansionContributionRate: null,
            relationshipExpansionNoiseRate: null,
          },
        },
      ],
      aggregate: {
        queryCount: 2,
        expectedDocumentCount: 2,
        lexicalDocumentHitsAtK: 2,
        documentRecallAtK: 1,
        expectedChunkCount: 2,
        exactChunkHits: 2,
        exactChunkHitRate: 1,
        lexicalEvidenceCount: 2,
        lexicalProvenanceCompleteCount: 2,
        provenanceCompletenessRate: 1,
        graphExpandedOnlyCount: 1,
        graphExpandedExpectedCount: 0,
        graphExpandedIrrelevantCount: 1,
        relationshipExpansionContributionRate: 0,
        relationshipExpansionNoiseRate: 1,
      },
    });
  });

  it("measures useful relationship expansion separately from noise and groups by source/query class", () => {
    const multisourceFixture: FrozenRetrievalFixtureV1 = {
      schemaVersion: "1.0",
      fixtureId: "retrieval-multisource-phase2",
      fixtureVersion: "2026-08-28.1",
      queries: [
        {
          queryId: "official-cross-reference",
          workspaceId,
          queryText: "Which official source provides the related applicability context?",
          sourceFamily: "OFFICIAL_WEB",
          queryClass: "RELATIONSHIP_ASSISTED",
          evaluation: {
            k: 1,
            expectedSources: [{ content: expectedA }, { content: expectedB }],
          },
        },
        {
          queryId: "expert-direct",
          workspaceId,
          queryText: "What did the expert source say?",
          sourceFamily: "EXPERT",
          queryClass: "LEXICAL_DIRECT",
          evaluation: {
            k: 1,
            expectedSources: [{ content: expectedB }],
          },
        },
      ],
    };
    const multisourceResults = [
      {
        queryId: "official-cross-reference",
        result: result(
          multisourceFixture.queries[0].queryText,
          expectedA,
          "chunk:a:0",
          shaA,
          expectedB,
        ),
      },
      {
        queryId: "expert-direct",
        result: result(multisourceFixture.queries[1].queryText, expectedB, "chunk:b:0", shaB),
      },
    ];

    const measured = runFrozenRetrievalEvaluation(multisourceFixture, multisourceResults);
    expect(measured.queries[0].metrics.graphExpandedExpectedCount).toBe(1);
    expect(measured.queries[0].metrics.relationshipExpansionContributionRate).toBe(1);
    expect(measured.queries[0].metrics.relationshipExpansionNoiseRate).toBe(0);
    expect(measured.bySourceFamily?.map(({ dimension }) => dimension)).toEqual([
      "EXPERT",
      "OFFICIAL_WEB",
    ]);
    expect(measured.byQueryClass?.map(({ dimension }) => dimension)).toEqual([
      "LEXICAL_DIRECT",
      "RELATIONSHIP_ASSISTED",
    ]);
    expect(measured.byQueryClass?.[1]?.metrics.graphExpandedExpectedCount).toBe(1);
  });

  it("is deterministic for unchanged fixture and result identities", () => {
    const first = runFrozenRetrievalEvaluation(fixture, results);
    const second = runFrozenRetrievalEvaluation(fixture, results);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("fails closed when a result does not match the frozen query identity", () => {
    const mismatched = [
      results[0],
      {
        queryId: "section-8",
        result: result("different query text", expectedB, "chunk:b:0", shaB),
      },
    ];

    expect(() => runFrozenRetrievalEvaluation(fixture, mismatched)).toThrow(
      "Retrieval result identity does not match the frozen query fixture",
    );
  });

  it("fails closed on invalid Phase 2 dimensions", () => {
    expect(() =>
      runFrozenRetrievalEvaluation(
        {
          ...fixture,
          queries: [{ ...fixture.queries[0], sourceFamily: " OFFICIAL_WEB" }, fixture.queries[1]],
        },
        results,
      ),
    ).toThrow("Retrieval fixture source family must be a non-empty trimmed string");
  });

  it("fails closed on duplicate fixture query ids", () => {
    expect(() =>
      runFrozenRetrievalEvaluation(
        {
          ...fixture,
          queries: [fixture.queries[0], { ...fixture.queries[1], queryId: "filing-basics" }],
        },
        results,
      ),
    ).toThrow("Retrieval fixture contains duplicate query ids");
  });

  it("fails closed on duplicate or unknown result ids", () => {
    expect(() => runFrozenRetrievalEvaluation(fixture, [results[0], results[0]])).toThrow(
      "Retrieval evaluation contains duplicate query results",
    );

    expect(() =>
      runFrozenRetrievalEvaluation(fixture, [
        ...results,
        { queryId: "unknown", result: results[0].result },
      ]),
    ).toThrow("Retrieval evaluation contains an unknown query result");
  });

  it("fails closed when a frozen query result is missing", () => {
    expect(() => runFrozenRetrievalEvaluation(fixture, [results[0]])).toThrow(
      "Retrieval evaluation is missing a frozen query result",
    );
  });
});
