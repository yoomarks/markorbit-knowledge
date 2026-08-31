import type {
  ContentObjectRefV1,
  KnowledgeRetrievalCompositionResultV1,
} from "@markorbit/contracts";
import type { KnowledgeRetrievalRegressionFixtureV1 } from "../knowledge-retrieval-regression";

const workspaceId = "workspace-retrieval-regression-v1";
const indexedAt = "2026-08-28T00:00:00.000Z";

const sha = {
  filingBasis: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  filingSpecimen: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  section8Use: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  section8Timing: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  ttabProcedure: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  ttabEvidence: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
} as const;

function content(objectId: string): ContentObjectRefV1 {
  return {
    protocolVersion: "1.0",
    objectType: "CONTENT_OBJECT_REF",
    objectId,
    objectKind: "DOCUMENT",
    workspaceId,
  };
}

function result(
  queryText: string,
  items: KnowledgeRetrievalCompositionResultV1["items"],
): KnowledgeRetrievalCompositionResultV1 {
  const lexicalCount = items.filter((item) =>
    item.evidence.some((evidence) => evidence.channel === "LEXICAL"),
  ).length;
  const graphCount = items.filter((item) =>
    item.evidence.some((evidence) => evidence.channel === "GRAPH"),
  ).length;
  return {
    protocolVersion: "1.0",
    objectType: "KNOWLEDGE_RETRIEVAL_COMPOSITION_RESULT",
    workspaceId,
    queryText,
    channels: {
      lexical: { available: true, count: lexicalCount },
      graph: { available: true, count: graphCount },
      vector: { available: false, count: 0, reason: "PROVIDER_UNAVAILABLE" },
    },
    items,
  };
}

const filingBasis = content("corpus:us-trademark:filing-basis");
const filingSpecimen = content("corpus:us-trademark:use-specimen");
const filingRelated = content("corpus:us-trademark:filing-related-procedure");
const filingNoise = content("corpus:us-trademark:renewal-unrelated");

const section8Use = content("corpus:us-trademark:section-8-use");
const section8Timing = content("corpus:us-trademark:section-8-timing");
const section8Noise = content("corpus:us-trademark:ttab-unrelated");

const ttabProcedure = content("corpus:us-trademark:ttab-procedure");
const ttabEvidence = content("corpus:us-trademark:ttab-evidence");
const ttabRelated = content("corpus:us-trademark:ttab-related-deadline");
const ttabNoise = content("corpus:us-trademark:filing-unrelated");

export const knowledgeRetrievalRegressionCorpusV1 = {
  schemaVersion: 1,
  fixtureId: "knowledge-retrieval-us-trademark-representative-v1",
  corpusVersion: "us-trademark-representative-2026-08-28.v1",
  cases: [
    {
      caseId: "us-filing-basis",
      result: result(
        "Which source lineage should support a US trademark filing-basis research answer?",
        [
          {
            content: filingBasis,
            evidence: [
              {
                channel: "LEXICAL",
                position: 1,
                indexMode: "SQLITE_FTS5_BM25",
                score: -8.4,
                snippet: "filing basis source snapshot",
                headingPath: ["Filing basis"],
                chunkId: "chunk:filing-basis:0",
                contentSha256: sha.filingBasis,
                indexedAt,
              },
            ],
          },
          {
            content: filingSpecimen,
            evidence: [
              {
                channel: "LEXICAL",
                position: 2,
                indexMode: "SQLITE_FTS5_BM25",
                score: -6.1,
                snippet: "use specimen source snapshot",
                headingPath: ["Use evidence"],
                chunkId: "chunk:filing-specimen:0",
                contentSha256: sha.filingSpecimen,
                indexedAt,
              },
            ],
          },
          { content: filingRelated, evidence: [{ channel: "GRAPH", position: 1 }] },
          { content: filingNoise, evidence: [{ channel: "GRAPH", position: 2 }] },
        ],
      ),
      evaluation: {
        k: 2,
        expectedSources: [
          {
            content: filingBasis,
            chunks: [{ chunkId: "chunk:filing-basis:0", contentSha256: sha.filingBasis }],
          },
          {
            content: filingSpecimen,
            chunks: [{ chunkId: "chunk:filing-specimen:0", contentSha256: sha.filingSpecimen }],
          },
          { content: filingRelated },
        ],
      },
      thresholds: {
        minDocumentRecallAtK: 2 / 3,
        minExactChunkHitRate: 1,
        minProvenanceCompletenessRate: 1,
        minRelationshipExpansionContributionRate: 0.5,
        maxRelationshipExpansionNoiseRate: 0.5,
      },
    },
    {
      caseId: "us-section-8-maintenance",
      result: result("Which maintained source should support Section 8 use and timing research?", [
        {
          content: section8Use,
          evidence: [
            {
              channel: "LEXICAL",
              position: 1,
              indexMode: "SQLITE_FTS5_BM25",
              score: -7.2,
              snippet: "section 8 use source snapshot",
              headingPath: ["Maintenance", "Use"],
              chunkId: "chunk:section-8-use:0",
              contentSha256: sha.section8Use,
              indexedAt,
            },
          ],
        },
        {
          content: section8Noise,
          evidence: [
            {
              channel: "LEXICAL",
              position: 2,
              indexMode: "SQLITE_FTS5_BM25",
              score: -2.2,
              snippet: "unrelated procedural source",
              headingPath: ["Other"],
              chunkId: "chunk:section-8-noise:0",
              contentSha256: sha.section8Timing,
              indexedAt,
            },
          ],
        },
        { content: section8Timing, evidence: [{ channel: "GRAPH", position: 1 }] },
      ]),
      evaluation: {
        k: 3,
        expectedSources: [
          {
            content: section8Use,
            chunks: [{ chunkId: "chunk:section-8-use:0", contentSha256: sha.section8Use }],
          },
          { content: section8Timing },
        ],
      },
      thresholds: {
        minDocumentRecallAtK: 0.5,
        minExactChunkHitRate: 1,
        minProvenanceCompletenessRate: 1,
        minRelationshipExpansionContributionRate: 1,
        maxRelationshipExpansionNoiseRate: 0,
      },
    },
    {
      caseId: "us-ttab-procedure",
      result: result(
        "Which source lineage supports a TTAB procedure and evidence research answer?",
        [
          {
            content: ttabProcedure,
            evidence: [
              {
                channel: "LEXICAL",
                position: 1,
                indexMode: "SQLITE_FTS5_BM25",
                score: -9.1,
                snippet: "ttab procedure source snapshot",
                headingPath: ["TTAB", "Procedure"],
                chunkId: "chunk:ttab-procedure:0",
                contentSha256: sha.ttabProcedure,
                indexedAt,
              },
            ],
          },
          {
            content: ttabEvidence,
            evidence: [
              {
                channel: "LEXICAL",
                position: 4,
                indexMode: "SQLITE_FTS5_BM25",
                score: -3.8,
                snippet: "ttab evidence source snapshot",
                headingPath: ["TTAB", "Evidence"],
                chunkId: "chunk:ttab-evidence:0",
                contentSha256: sha.ttabEvidence,
                indexedAt,
              },
            ],
          },
          { content: ttabRelated, evidence: [{ channel: "GRAPH", position: 1 }] },
          { content: ttabNoise, evidence: [{ channel: "GRAPH", position: 2 }] },
        ],
      ),
      evaluation: {
        k: 3,
        expectedSources: [
          {
            content: ttabProcedure,
            chunks: [{ chunkId: "chunk:ttab-procedure:0", contentSha256: sha.ttabProcedure }],
          },
          {
            content: ttabEvidence,
            chunks: [{ chunkId: "chunk:ttab-evidence:0", contentSha256: sha.ttabEvidence }],
          },
          { content: ttabRelated },
        ],
      },
      thresholds: {
        minDocumentRecallAtK: 1 / 3,
        minExactChunkHitRate: 1,
        minProvenanceCompletenessRate: 1,
        minRelationshipExpansionContributionRate: 0.5,
        maxRelationshipExpansionNoiseRate: 0.5,
      },
    },
  ],
} satisfies KnowledgeRetrievalRegressionFixtureV1;
