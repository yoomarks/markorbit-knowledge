import { describe, expect, it } from "vitest";
import type {
  EvidenceMaturityStage,
  SourceIntelligenceObservationHistoryV2,
  SourceIntelligenceObservationPointV2,
  SourceValuePriorityBand,
} from "@markorbit/contracts";
import { buildSourceIntelligenceCrossSourceObservationSummaryV2 } from "../src/source-intelligence-cross-source-observation";

function point(input: {
  id: string;
  at: string;
  band: SourceValuePriorityBand;
  value: number;
  maturity: EvidenceMaturityStage;
  maturityScore: number | null;
  cost: number | null;
}): SourceIntelligenceObservationPointV2 {
  return {
    assessmentId: `si2_${input.id}`,
    legacyAssessmentId: `sia_${input.id}`,
    assessedAt: input.at,
    inputFingerprint: input.id.padEnd(64, "a").slice(0, 64),
    evaluatorVersion: "2.1.0",
    sourceValue: { score: input.value, band: input.band },
    evidenceMaturity: { score: input.maturityScore, stage: input.maturity },
    observedAcquisitionCost: { score: input.cost, confidence: input.cost === null ? "LOW" : "MEDIUM" },
  };
}

function history(
  sourceId: string,
  observations: SourceIntelligenceObservationPointV2[],
): SourceIntelligenceObservationHistoryV2 {
  return {
    protocolVersion: "2.0",
    objectType: "SOURCE_INTELLIGENCE_OBSERVATION_HISTORY",
    sourceId,
    observations,
    transitions: [],
    semantics: {
      ordering: "OLDEST_TO_NEWEST",
      observationUnit: "DISTINCT_EVIDENCE_STATE",
      sameFingerprintReassessmentsCollapsed: true,
      sourceValueAndEvidenceMaturityIndependent: true,
      acquisitionCostSeparate: true,
    },
    scheduling: { policyStatus: "NOT_AUTHORIZED_UNCALIBRATED" },
    boundaries: {
      legalTruthVerified: false,
      authorityInferred: false,
      professionalQualityVerified: false,
      identityVerified: false,
      autoScheduleApplied: false,
      grantsCollectionAuthority: false,
      grantsMgsnQualification: false,
    },
  };
}

describe("buildSourceIntelligenceCrossSourceObservationSummaryV2", () => {
  it("summarizes deterministic cross-source observation flags without granting authority", () => {
    const summary = buildSourceIntelligenceCrossSourceObservationSummaryV2([
      history("src_high_unobserved", [
        point({
          id: "high-unobserved",
          at: "2026-08-09T00:00:00.000Z",
          band: "VERY_HIGH",
          value: 94,
          maturity: "UNOBSERVED",
          maturityScore: null,
          cost: null,
        }),
      ]),
      history("src_maturity_regressed", [
        point({
          id: "maturity-before",
          at: "2026-08-08T00:00:00.000Z",
          band: "MEDIUM",
          value: 55,
          maturity: "CURRENT_TRACEABLE",
          maturityScore: 84,
          cost: 18,
        }),
        point({
          id: "maturity-after",
          at: "2026-08-09T01:00:00.000Z",
          band: "MEDIUM",
          value: 55,
          maturity: "CAPTURED",
          maturityScore: 32,
          cost: 20,
        }),
      ]),
      history("src_value_and_cost_changed", [
        point({
          id: "value-before",
          at: "2026-08-08T02:00:00.000Z",
          band: "MEDIUM",
          value: 58,
          maturity: "TRACEABLE",
          maturityScore: 65,
          cost: 10,
        }),
        point({
          id: "value-after",
          at: "2026-08-09T02:00:00.000Z",
          band: "HIGH",
          value: 70,
          maturity: "TRACEABLE",
          maturityScore: 65,
          cost: 35,
        }),
      ]),
      history("src_unassessed", []),
    ]);

    expect(summary.protocolVersion).toBe("2.0");
    expect(summary.sourceCount).toBe(4);
    expect(summary.assessedSourceCount).toBe(3);
    expect(summary.flaggedSourceCount).toBe(3);
    expect(summary.summarizedThrough).toBe("2026-08-09T02:00:00.000Z");
    expect(summary.counts).toEqual({
      highValueUnobserved: 1,
      evidenceMaturityRegressions: 1,
      sourceValueBandChanges: 1,
      acquisitionCostIncreases: 1,
    });
    expect(summary.flags.map((flag) => flag.kind)).toEqual([
      "EVIDENCE_MATURITY_REGRESSION",
      "HIGH_VALUE_UNOBSERVED",
      "SOURCE_VALUE_BAND_CHANGED",
      "ACQUISITION_COST_INCREASED",
    ]);
    expect(summary.boundaries.authorityInferred).toBe(false);
    expect(summary.boundaries.legalTruthVerified).toBe(false);
    expect(summary.boundaries.crossSourceIdentityResolved).toBe(false);
    expect(summary.boundaries.autoScheduleApplied).toBe(false);
    expect(summary.boundaries.grantsCollectionAuthority).toBe(false);
    expect(summary.boundaries.grantsMgsnQualification).toBe(false);
    expect(summary.scheduling.policyStatus).toBe("NOT_AUTHORIZED_UNCALIBRATED");
  });

  it("does not flag small cost changes or stable dual-axis states", () => {
    const summary = buildSourceIntelligenceCrossSourceObservationSummaryV2([
      history("src_stable", [
        point({
          id: "stable-before",
          at: "2026-08-08T00:00:00.000Z",
          band: "MEDIUM",
          value: 55,
          maturity: "TRACEABLE",
          maturityScore: 60,
          cost: 20,
        }),
        point({
          id: "stable-after",
          at: "2026-08-09T00:00:00.000Z",
          band: "MEDIUM",
          value: 57,
          maturity: "TRACEABLE",
          maturityScore: 62,
          cost: 39,
        }),
      ]),
    ]);

    expect(summary.flaggedSourceCount).toBe(0);
    expect(summary.flags).toEqual([]);
  });
});
