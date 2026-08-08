import { describe, expect, it } from "vitest";
import { isSourceIntelligenceAssessment } from "@markorbit/contracts";
import { evaluateSourceIntelligence } from "../src/source-intelligence-evaluator";

const base = {
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  profileId: "sgp_aaaaaaaaaaaaaaaaaaaaaaaa",
  assessedAt: "2026-08-08T08:00:00.000Z",
} as const;

describe("source intelligence evaluator", () => {
  it("keeps operational value separate from explicit authority", () => {
    const assessment = evaluateSourceIntelligence({
      ...base,
      snapshot: {
        sourceCategory: "OTHER",
        sourceStatus: "ACTIVE",
        explicitAuthorityLevel: "UNKNOWN",
        graphNodeCount: 100,
        contentNodeCount: 80,
        relevantContentNodeCount: 75,
        retainedNodeCount: 8,
        rawProvenanceNodeCount: 90,
        rawArtifactCount: 20,
        distinctArtifactHashCount: 18,
        rawArtifactBytes: 2_000_000,
        latestCapturedAt: "2026-08-08T07:00:00.000Z",
      },
    });
    expect(assessment.operationalTier).toBe("A");
    expect(assessment.dimensions.AUTHORITY_SIGNAL.score).toBeNull();
    expect(assessment.boundaries).toEqual({
      legalTruthVerified: false,
      authorityInferred: false,
      autoScheduleApplied: false,
    });
    expect(isSourceIntelligenceAssessment(assessment)).toBe(true);
  });

  it("uses explicit authority without inferring it", () => {
    const assessment = evaluateSourceIntelligence({
      ...base,
      snapshot: {
        sourceCategory: "OFFICIAL_AUTHORITY",
        sourceStatus: "ACTIVE",
        explicitAuthorityLevel: "PRIMARY_OFFICIAL",
        graphNodeCount: 60,
        contentNodeCount: 40,
        relevantContentNodeCount: 36,
        retainedNodeCount: 2,
        rawProvenanceNodeCount: 55,
        rawArtifactCount: 12,
        distinctArtifactHashCount: 12,
        rawArtifactBytes: 1_200_000,
        latestCapturedAt: "2026-08-08T07:30:00.000Z",
      },
    });
    expect(assessment.dimensions.AUTHORITY_SIGNAL.score).toBe(100);
    expect(assessment.dimensions.AUTHORITY_SIGNAL.reasonCodes).toContain(
      "EXPLICIT_AUTHORITY_PRIMARY_OFFICIAL",
    );
    expect(assessment.boundaries.authorityInferred).toBe(false);
  });

  it("recommends manual review for weak sources rather than auto rejecting them", () => {
    const assessment = evaluateSourceIntelligence({
      ...base,
      snapshot: {
        sourceCategory: "OTHER",
        sourceStatus: "ACTIVE",
        explicitAuthorityLevel: "UNKNOWN",
        graphNodeCount: 1,
        contentNodeCount: 0,
        relevantContentNodeCount: 0,
        retainedNodeCount: 0,
        rawProvenanceNodeCount: 0,
        rawArtifactCount: 0,
        distinctArtifactHashCount: 0,
        rawArtifactBytes: 0,
      },
    });
    expect(assessment.operationalTier).toBe("D");
    expect(assessment.recommendedRescan.mode).toBe("MANUAL");
    expect(assessment.boundaries.autoScheduleApplied).toBe(false);
  });

  it("is deterministic for the same evidence snapshot", () => {
    const snapshot = {
      sourceCategory: "LAW_FIRM" as const,
      sourceStatus: "ACTIVE" as const,
      explicitAuthorityLevel: "PROFESSIONAL" as const,
      graphNodeCount: 12,
      contentNodeCount: 10,
      relevantContentNodeCount: 7,
      retainedNodeCount: 1,
      rawProvenanceNodeCount: 8,
      rawArtifactCount: 4,
      distinctArtifactHashCount: 4,
      rawArtifactBytes: 400_000,
      latestCapturedAt: "2026-08-01T00:00:00.000Z",
    };
    const first = evaluateSourceIntelligence({ ...base, snapshot });
    const second = evaluateSourceIntelligence({ ...base, snapshot });
    expect(second.inputFingerprint).toBe(first.inputFingerprint);
    expect(second.id).toBe(first.id);
    expect(second.priorityScore).toBe(first.priorityScore);
  });
});
