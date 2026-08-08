import { describe, expect, it } from "vitest";
import {
  isSourceIntelligenceAssessment,
  isSourceIntelligenceAssessmentV2,
} from "@markorbit/contracts";
import {
  evaluateSourceIntelligence,
  projectSourceIntelligenceV2,
} from "../src/source-intelligence-evaluator";

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

  it("projects an unobserved high-value source without treating missing evidence as low value", () => {
    const legacy = evaluateSourceIntelligence({
      ...base,
      snapshot: {
        sourceCategory: "OFFICIAL_AUTHORITY",
        sourceStatus: "ACTIVE",
        explicitAuthorityLevel: "PRIMARY_OFFICIAL",
        graphNodeCount: 20,
        contentNodeCount: 10,
        relevantContentNodeCount: 8,
        retainedNodeCount: 0,
        rawProvenanceNodeCount: 0,
        rawArtifactCount: 0,
        distinctArtifactHashCount: 0,
        rawArtifactBytes: 0,
      },
    });
    const projected = projectSourceIntelligenceV2(legacy);

    expect(projected.protocolVersion).toBe("2.0");
    expect(projected.sourceValuePriority.score).toBeGreaterThanOrEqual(80);
    expect(projected.sourceValuePriority.band).toBe("VERY_HIGH");
    expect(projected.evidenceMaturity).toMatchObject({
      score: null,
      stage: "UNOBSERVED",
      confidence: "LOW",
    });
    expect(projected.scheduling.policyStatus).toBe("NOT_AUTHORIZED_UNCALIBRATED");
    expect(isSourceIntelligenceAssessmentV2(projected)).toBe(true);
  });

  it("keeps Source Value stable when only evidence maturity changes", () => {
    const before = evaluateSourceIntelligence({
      ...base,
      snapshot: {
        sourceCategory: "OFFICIAL_AUTHORITY",
        sourceStatus: "ACTIVE",
        explicitAuthorityLevel: "PRIMARY_OFFICIAL",
        graphNodeCount: 30,
        contentNodeCount: 20,
        relevantContentNodeCount: 12,
        retainedNodeCount: 0,
        rawProvenanceNodeCount: 0,
        rawArtifactCount: 0,
        distinctArtifactHashCount: 0,
        rawArtifactBytes: 0,
      },
    });
    const after = evaluateSourceIntelligence({
      ...base,
      snapshot: {
        sourceCategory: "OFFICIAL_AUTHORITY",
        sourceStatus: "ACTIVE",
        explicitAuthorityLevel: "PRIMARY_OFFICIAL",
        graphNodeCount: 30,
        contentNodeCount: 20,
        relevantContentNodeCount: 12,
        retainedNodeCount: 0,
        rawProvenanceNodeCount: 25,
        rawArtifactCount: 2,
        distinctArtifactHashCount: 2,
        rawArtifactBytes: 200_000,
        latestCapturedAt: "2026-08-08T07:30:00.000Z",
        previousGraphNodeCount: 30,
        previousDistinctArtifactHashCount: 0,
      },
    });

    const beforeV2 = projectSourceIntelligenceV2(before);
    const afterV2 = projectSourceIntelligenceV2(after);

    expect(after.priorityScore).not.toBe(before.priorityScore);
    expect(afterV2.sourceValuePriority.score).toBe(beforeV2.sourceValuePriority.score);
    expect(afterV2.sourceValuePriority.band).toBe(beforeV2.sourceValuePriority.band);
    expect(beforeV2.evidenceMaturity.stage).toBe("UNOBSERVED");
    expect(beforeV2.evidenceMaturity.score).toBeNull();
    expect(afterV2.evidenceMaturity.stage).toBe("CURRENT_TRACEABLE");
    expect(afterV2.evidenceMaturity.score).not.toBeNull();
    expect(afterV2.evidenceMaturity.score).toBeGreaterThan(70);
  });

  it("projects v2 without mutating the persisted v1 assessment", () => {
    const legacy = evaluateSourceIntelligence({
      ...base,
      snapshot: {
        sourceCategory: "LAW_FIRM",
        sourceStatus: "ACTIVE",
        explicitAuthorityLevel: "PROFESSIONAL",
        graphNodeCount: 12,
        contentNodeCount: 10,
        relevantContentNodeCount: 7,
        retainedNodeCount: 1,
        rawProvenanceNodeCount: 8,
        rawArtifactCount: 4,
        distinctArtifactHashCount: 4,
        rawArtifactBytes: 400_000,
        latestCapturedAt: "2026-08-01T00:00:00.000Z",
      },
    });
    const serialized = JSON.stringify(legacy);
    const first = projectSourceIntelligenceV2(legacy);
    const second = projectSourceIntelligenceV2(legacy);

    expect(JSON.stringify(legacy)).toBe(serialized);
    expect(second).toEqual(first);
    expect(first.compatibility).toMatchObject({
      projectionMode: "V1_READ_COMPATIBLE",
      legacyProtocolVersion: "1.0",
      legacyAssessmentId: legacy.id,
      legacyPriorityScore: legacy.priorityScore,
      legacyOperationalTier: legacy.operationalTier,
    });
    expect(first.boundaries).toEqual({
      legalTruthVerified: false,
      authorityInferred: false,
      professionalQualityVerified: false,
      identityVerified: false,
      autoScheduleApplied: false,
      grantsCollectionAuthority: false,
      grantsMgsnQualification: false,
    });
    expect(isSourceIntelligenceAssessment(legacy)).toBe(true);
    expect(isSourceIntelligenceAssessmentV2(first)).toBe(true);
  });
});
