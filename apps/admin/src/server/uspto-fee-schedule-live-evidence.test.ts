import { describe, expect, it } from "vitest";
import type {
  ContentObjectRefV1,
  KnowledgeRetrievalCompositionQueryV1,
} from "@markorbit/contracts";
import { SqliteContentRelationshipRepository } from "@markorbit/persistence/content-relationships";
import {
  composeKnowledgeRetrieval,
  type KnowledgeLexicalRetrievalReader,
} from "./knowledge-retrieval-composition";
import { runFrozenRetrievalEvaluation } from "./knowledge-retrieval-evaluation-runner";
import {
  getRegistryDatabase,
  getRetrievalIndexRepository,
  getStagingContentRepository,
} from "./source-registry";

const LIVE = process.env.MARKORBIT_USPTO_FEE_SCHEDULE_LIVE_EVIDENCE === "1";
const CANONICAL_URI =
  "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule";
const QUERY_TEXT = "base application fee 7017 trademark";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for live USPTO Fee Schedule evidence`);
  return value;
}

function canonicalText(value: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(value).replace(/\r\n?/g, "\n");
}

async function composedResult(workspaceId: string, sourceId: string) {
  const retrieval = getRetrievalIndexRepository();
  const lexical: KnowledgeLexicalRetrievalReader = {
    search: ({ workspaceId: queryWorkspaceId, queryText, limit }) =>
      retrieval
        .search({
          workspaceId: queryWorkspaceId,
          query: queryText,
          sourceId,
          jurisdiction: "US",
          authorityLevel: "PRIMARY_OFFICIAL",
          limit,
        })
        .items.map((hit) => ({
          content: {
            protocolVersion: "1.0",
            objectType: "CONTENT_OBJECT_REF",
            objectId: hit.document.documentId,
            objectKind: "DOCUMENT",
            workspaceId: hit.document.workspaceId,
          } satisfies ContentObjectRefV1,
          indexMode: "SQLITE_FTS5_BM25",
          score: hit.score,
          snippet: hit.snippet,
          headingPath: [...hit.chunk.headingPath],
          chunkId: hit.chunk.chunkId,
          contentSha256: hit.chunk.contentSha256,
          indexedAt: hit.document.indexedAt,
        })),
  };
  const graph = new SqliteContentRelationshipRepository(getRegistryDatabase());
  const query: KnowledgeRetrievalCompositionQueryV1 = {
    protocolVersion: "1.0",
    objectType: "KNOWLEDGE_RETRIEVAL_COMPOSITION_QUERY",
    workspaceId,
    queryText: QUERY_TEXT,
    lexicalLimit: 10,
    vectorMode: "DISABLED",
  };
  return composeKnowledgeRetrieval(query, lexical, graph);
}

const liveDescribe = LIVE ? describe : describe.skip;

liveDescribe("Phase 2 live USPTO Fee Schedule primary authority evidence", () => {
  it("replays the canonical fee row with complete document and chunk lineage", async () => {
    const workspaceId = required("MARKORBIT_WORKSPACE_ID");
    const sourceId = required("MARKORBIT_SOURCE_ID");
    const retrieval = getRetrievalIndexRepository();

    const direct = retrieval.search({
      workspaceId,
      query: QUERY_TEXT,
      sourceId,
      jurisdiction: "US",
      authorityLevel: "PRIMARY_OFFICIAL",
      limit: 10,
    });
    expect(direct.items.length).toBeGreaterThan(0);

    const canonicalHit = direct.items.find(
      (hit) => hit.document.sourceId === sourceId && hit.document.sourceUri === CANONICAL_URI,
    );
    expect(canonicalHit).toBeDefined();
    if (!canonicalHit) return;

    expect(canonicalHit.document.authorityLevel).toBe("PRIMARY_OFFICIAL");
    expect(canonicalHit.document.jurisdictions).toContain("US");
    expect(canonicalHit.document.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(canonicalHit.chunk.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(canonicalHit.chunk.chunkId.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(canonicalHit.document.indexedAt))).toBe(false);

    const markdown = canonicalText(
      getStagingContentRepository().readContent(
        canonicalHit.document.stagingDocumentId,
        workspaceId,
      ),
    ).toLowerCase();
    for (const anchor of ["base application, per class", "7017", "2.6(a)(1)(iii)"]) {
      expect(markdown).toContain(anchor);
    }

    const first = await composedResult(workspaceId, sourceId);
    const second = await composedResult(workspaceId, sourceId);
    expect(second).toEqual(first);

    const item = first.items.find(
      (entry) => entry.content.objectId === canonicalHit.document.documentId,
    );
    expect(item).toBeDefined();
    const lexical = item?.evidence.find(
      (evidence) =>
        evidence.channel === "LEXICAL" && evidence.chunkId === canonicalHit.chunk.chunkId,
    );
    expect(lexical?.channel).toBe("LEXICAL");
    if (!lexical || lexical.channel !== "LEXICAL") return;
    expect(lexical.contentSha256).toBe(canonicalHit.chunk.contentSha256);
    expect(lexical.indexedAt).toBe(canonicalHit.document.indexedAt);

    const evaluation = runFrozenRetrievalEvaluation(
      {
        schemaVersion: "1.0",
        fixtureId: "retrieval-uspto-fee-schedule-live",
        fixtureVersion: canonicalHit.document.contentSha256,
        queries: [
          {
            queryId: "uspto-base-application-fee-primary-authority",
            workspaceId,
            queryText: QUERY_TEXT,
            evaluation: {
              k: 10,
              expectedSources: [
                {
                  content: item!.content,
                  chunks: [
                    {
                      chunkId: lexical.chunkId!,
                      contentSha256: lexical.contentSha256!,
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
      [
        {
          queryId: "uspto-base-application-fee-primary-authority",
          result: first,
        },
      ],
    );

    expect(evaluation.aggregate.documentRecallAtK).toBe(1);
    expect(evaluation.aggregate.exactChunkHitRate).toBe(1);
    expect(evaluation.aggregate.provenanceCompletenessRate).toBe(1);
    expect(evaluation.aggregate.expectedDocumentCount).toBe(1);
    expect(evaluation.aggregate.expectedChunkCount).toBe(1);

    process.stdout.write(
      `${JSON.stringify(
        {
          event: "phase2.uspto-fee-schedule.live-evidence.accepted",
          sourceId,
          workspaceId,
          documentId: canonicalHit.document.documentId,
          artifactVersion: canonicalHit.document.artifactVersion,
          sourceUri: canonicalHit.document.sourceUri,
          documentContentSha256: canonicalHit.document.contentSha256,
          chunkId: lexical.chunkId,
          chunkContentSha256: lexical.contentSha256,
          indexedAt: lexical.indexedAt,
          evaluation: evaluation.aggregate,
          replayIdentical: true,
        },
        null,
        2,
      )}\n`,
    );
  });
});
