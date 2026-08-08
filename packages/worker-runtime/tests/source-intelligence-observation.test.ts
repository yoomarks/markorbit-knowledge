import { describe, expect, it } from "vitest";
import type { SourceIntelligenceInputSnapshot } from "@markorbit/contracts";
import {
  buildSourceIntelligenceObservationHistoryV2,
  evaluateSourceIntelligence,
  projectSourceIntelligenceV2,
} from "../src/index";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const sourceId = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";

function evaluate(assessedAt: string, snapshot: SourceIntelligenceInputSnapshot) {
  return projectSourceIntelligenceV2(
    evaluateSourceIntelligence({
      workspaceId,
      sourceId,
      assessedAt,
      snapshot,
    }),
  );
}

describe("D2.7 Source Intelligence observation history", () => {
  it("records Evidence Maturity advancement without reclassifying stable Source Value", () => {
    const initial = evaluate("2026-08-08T08:00:00.000Z", {
      sourceCategory: "OFFICIAL_AUTHORITY",
      sourceStatus: "ACTIVE",
      explicitAuthorityLevel: "PRIMARY_OFFICIAL",
      graphNodeCount: 0,
      contentNodeCount: 0,
      relevantContentNodeCount: 0,
      retainedNodeCount: 0,
      rawProvenanceNodeCount: 0,
      rawArtifactCount: 0,
      distinctArtifactHashCount: 0,
      rawArtifactBytes: 0,
    });
    const observed = evaluate("2026-08-09T08:00:00.000Z", {
      sourceCategory: "OFFICIAL_AUTHORITY",
      sourceStatus: "ACTIVE",
      explicitAuthorityLevel: "PRIMARY_OFFICIAL",
      graphNodeCount: 4,
      contentNodeCount: 3,
      relevantContentNodeCount: 3,
      retainedNodeCount: 0,
      rawProvenanceNodeCount: 4,
      rawArtifactCount: 2,
      distinctArtifactHashCount: 2,
      rawArtifactBytes: 100_000,
      latestCapturedAt: "2026-08-09T07:30:00.000Z",
      previousAssessmentId: initial.compatibility.legacyAssessmentId,
      previousGraphNodeCount: 0,
      previousDistinctArtifactHashCount: 0,
    });

    const history = buildSourceIntelligenceObservationHistoryV2(sourceId, [observed, initial]);

    expect(history.observations).toHaveLength(2);
    expect(history.observations.map((item) => item.assessmentId)).toEqual([
      initial.id,
      observed.id,
    ]);
    expect(history.observations[0]?.sourceValue).toEqual({ score: 94, band: "VERY_HIGH" });
    expect(history.observations[0]?.evidenceMaturity.stage).toBe("UNOBSERVED");
    expect(history.observations[1]?.sourceValue).toEqual({ score: 94, band: "VERY_HIGH" });
    expect(history.observations[1]?.evidenceMaturity.stage).toBe("CURRENT_TRACEABLE");

    expect(history.transitions).toHaveLength(1);
    expect(history.transitions[0]?.sourceValue).toMatchObject({
      scoreDelta: 0,
      changed: false,
      fromBand: "VERY_HIGH",
      toBand: "VERY_HIGH",
    });
    expect(history.transitions[0]?.evidenceMaturity).toMatchObject({
      fromStage: "UNOBSERVED",
      toStage: "CURRENT_TRACEABLE",
      changed: true,
      scoreDelta: null,
    });
    expect(history.transitions[0]?.observedAcquisitionCost.changed).toBe(true);
    expect(history.semantics).toEqual({
      ordering: "OLDEST_TO_NEWEST",
      observationUnit: "DISTINCT_EVIDENCE_STATE",
      sameFingerprintReassessmentsCollapsed: true,
      sourceValueAndEvidenceMaturityIndependent: true,
      acquisitionCostSeparate: true,
    });
    expect(history.scheduling.policyStatus).toBe("NOT_AUTHORIZED_UNCALIBRATED");
    expect(history.boundaries).toEqual({
      legalTruthVerified: false,
      authorityInferred: false,
      professionalQualityVerified: false,
      identityVerified: false,
      autoScheduleApplied: false,
      grantsCollectionAuthority: false,
      grantsMgsnQualification: false,
    });
  });

  it("records explicit Source Value changes independently from Evidence Maturity", () => {
    const professional = evaluate("2026-08-08T08:00:00.000Z", {
      sourceCategory: "LAW_FIRM",
      sourceStatus: "ACTIVE",
      explicitAuthorityLevel: "PROFESSIONAL",
      graphNodeCount: 0,
      contentNodeCount: 0,
      relevantContentNodeCount: 0,
      retainedNodeCount: 0,
      rawProvenanceNodeCount: 0,
      rawArtifactCount: 0,
      distinctArtifactHashCount: 0,
      rawArtifactBytes: 0,
    });
    const explicitlyReclassified = evaluate("2026-08-09T08:00:00.000Z", {
      sourceCategory: "LAW_FIRM",
      sourceStatus: "ACTIVE",
      explicitAuthorityLevel: "PRIMARY_OFFICIAL",
      graphNodeCount: 0,
      contentNodeCount: 0,
      relevantContentNodeCount: 0,
      retainedNodeCount: 0,
      rawProvenanceNodeCount: 0,
      rawArtifactCount: 0,
      distinctArtifactHashCount: 0,
      rawArtifactBytes: 0,
    });

    const history = buildSourceIntelligenceObservationHistoryV2(sourceId, [
      professional,
      explicitlyReclassified,
    ]);
    const change = history.transitions[0];

    expect(change?.sourceValue.changed).toBe(true);
    expect(change?.sourceValue.scoreDelta).toBeGreaterThan(0);
    expect(change?.evidenceMaturity).toMatchObject({
      fromStage: "UNOBSERVED",
      toStage: "UNOBSERVED",
      changed: false,
    });
  });
});
