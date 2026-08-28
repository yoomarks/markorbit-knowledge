import { describe, expect, it } from "vitest";
import { KNOWLEDGE_RETRIEVAL_PHASE2_CORPUS_V1 } from "./knowledge-retrieval-phase2-corpus";

const SHA256 = /^[a-f0-9]{64}$/u;
const ARTIFACT_DIGEST = /^sha256:[a-f0-9]{64}$/u;

describe("Knowledge retrieval Phase 2 corpus", () => {
  it("binds live official-web evidence to exact accepted #559 lineage", () => {
    const live = KNOWLEDGE_RETRIEVAL_PHASE2_CORPUS_V1.evidence.filter(
      (entry) => entry.evidenceKind === "LIVE_ACCEPTED",
    );

    expect(live).toHaveLength(3);
    expect(new Set(live.map((entry) => entry.sourceFamily))).toEqual(new Set(["OFFICIAL_WEB"]));
    for (const entry of live) {
      expect(entry.repositoryRef).toBe("yoomarks/markorbit-knowledge#559");
      expect(entry.workflowRunId).toBe(33141319142);
      expect(entry.workflowArtifactId).toBe(9674079242);
      expect(entry.workflowArtifactDigest).toMatch(ARTIFACT_DIGEST);
      expect(entry.documentId).toMatch(/^art_/u);
      expect(entry.documentContentSha256).toMatch(SHA256);
      expect(entry.canonicalUri).toMatch(/^https:\/\/www\.uspto\.gov\//u);
      expect(entry.chunks?.length).toBeGreaterThan(0);
      for (const chunk of entry.chunks ?? []) {
        expect(chunk.chunkId).toMatch(/^rch_/u);
        expect(chunk.chunkContentSha256).toMatch(SHA256);
        expect(Number.isNaN(Date.parse(chunk.indexedAt))).toBe(false);
      }
    }
  });

  it("labels Expert and Case corpus evidence as replay fixtures rather than live evidence", () => {
    const replay = KNOWLEDGE_RETRIEVAL_PHASE2_CORPUS_V1.evidence.filter(
      (entry) => entry.evidenceKind === "DURABLE_REPLAY_FIXTURE",
    );

    expect(replay.map((entry) => entry.sourceFamily).sort()).toEqual(["CASE", "EXPERT"]);
    for (const entry of replay) {
      expect(entry.workflowRunId).toBeUndefined();
      expect(entry.workflowArtifactId).toBeUndefined();
      expect(entry.documentId).toBeUndefined();
      expect(entry.repositoryRef).toContain(".test.ts#");
    }
  });

  it("keeps corpus identity deterministic and spans multiple source families", () => {
    expect(KNOWLEDGE_RETRIEVAL_PHASE2_CORPUS_V1.schemaVersion).toBe("1.0");
    expect(KNOWLEDGE_RETRIEVAL_PHASE2_CORPUS_V1.corpusVersion).toBe("2026-08-28.1");
    expect(KNOWLEDGE_RETRIEVAL_PHASE2_CORPUS_V1.acceptedKnowledgeMainSha).toBe(
      "d3a264255e5c45fc0ef6b548916d1bf57425fd9f",
    );
    expect(
      new Set(KNOWLEDGE_RETRIEVAL_PHASE2_CORPUS_V1.evidence.map((entry) => entry.sourceFamily)),
    ).toEqual(new Set(["OFFICIAL_WEB", "EXPERT", "CASE"]));
  });
});
