import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { SourceIntelligenceAssessment } from "@markorbit/contracts";
import { SqliteSourceIntelligenceRepository } from "../src/source-intelligence-registry";

function assessment(input: {
  id: string;
  fingerprint: string;
  assessedAt: string;
  nodeCount: number;
}): SourceIntelligenceAssessment {
  return {
    protocolVersion: "1.0",
    objectType: "SOURCE_INTELLIGENCE_ASSESSMENT",
    id: input.id,
    workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    assessedAt: input.assessedAt,
    evaluator: { name: "test-evaluator", version: "1.0.0" },
    inputFingerprint: input.fingerprint,
    input: {
      sourceCategory: "LAW_FIRM",
      sourceStatus: "ACTIVE",
      explicitAuthorityLevel: "UNKNOWN",
      graphNodeCount: input.nodeCount,
      contentNodeCount: 6,
      relevantContentNodeCount: 4,
      retainedNodeCount: 1,
      rawProvenanceNodeCount: 4,
      rawArtifactCount: 2,
      distinctArtifactHashCount: 2,
      rawArtifactBytes: 200_000,
      latestCapturedAt: "2026-08-08T07:00:00.000Z",
    },
    dimensions: {
      RELEVANCE: { score: 70, confidence: "HIGH", reasonCodes: ["TEST"] },
      AUTHORITY_SIGNAL: { score: null, confidence: "LOW", reasonCodes: ["TEST"] },
      FRESHNESS: { score: 90, confidence: "HIGH", reasonCodes: ["TEST"] },
      EVIDENCEABILITY: { score: 80, confidence: "HIGH", reasonCodes: ["TEST"] },
      NOVELTY: { score: null, confidence: "LOW", reasonCodes: ["TEST"] },
      ACQUISITION_COST: { score: 20, confidence: "MEDIUM", reasonCodes: ["TEST"] },
    },
    priorityScore: 72,
    operationalTier: "B",
    recommendedRescan: { mode: "DAYS", intervalDays: 30, reasonCodes: ["TIER_B_MONTHLY_REVIEW"] },
    reasonCodes: ["OPERATIONAL_TIER_B", "RECOMMENDATION_REQUIRES_OPERATOR_ACTION"],
    boundaries: { legalTruthVerified: false, authorityInferred: false, autoScheduleApplied: false },
  };
}

describe("SqliteSourceIntelligenceRepository", () => {
  it("persists history and reuses the same evidence fingerprint idempotently", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteSourceIntelligenceRepository(database);
    const first = assessment({
      id: "sia_aaaaaaaaaaaaaaaaaaaaaaaa",
      fingerprint: "a".repeat(64),
      assessedAt: "2026-08-08T08:00:00.000Z",
      nodeCount: 8,
    });
    expect(repository.save(first)).toEqual(first);

    const replay = {
      ...first,
      id: "sia_bbbbbbbbbbbbbbbbbbbbbbbb",
      assessedAt: "2026-08-08T09:00:00.000Z",
    };
    expect(repository.save(replay).id).toBe(first.id);
    expect(repository.latestForSource(first.sourceId)?.id).toBe(first.id);

    const changed = assessment({
      id: "sia_cccccccccccccccccccccccc",
      fingerprint: "c".repeat(64),
      assessedAt: "2026-08-09T08:00:00.000Z",
      nodeCount: 10,
    });
    repository.save(changed);
    expect(repository.latestForSource(first.sourceId)?.id).toBe(changed.id);
    expect(repository.listLatest(first.workspaceId)).toHaveLength(1);
    database.close();
  });
});
