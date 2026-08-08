import { describe, expect, it } from "vitest";
import type {
  SourceIntelligenceCrossSourceObservationSummaryV2,
  SourceIntelligenceObservationFlagV2,
  SourceIntelligenceObservationPointV2,
  SourceIntelligenceObservationReviewRecordV2,
} from "@markorbit/contracts";
import {
  buildSourceIntelligenceObservationReviewQueueV2,
  sourceIntelligenceObservationReviewKey,
} from "../src/source-intelligence-review-queue";

function point(id: string): SourceIntelligenceObservationPointV2 {
  return {
    assessmentId: `si2_${id}`,
    legacyAssessmentId: `sia_${id}`,
    assessedAt: "2026-08-09T03:00:00.000Z",
    inputFingerprint: id.padEnd(64, "a").slice(0, 64),
    evaluatorVersion: "2.1.0",
    sourceValue: { score: 94, band: "VERY_HIGH" },
    evidenceMaturity: { score: null, stage: "UNOBSERVED" },
    observedAcquisitionCost: { score: null, confidence: "LOW" },
  };
}

function flag(currentId: string, previousId?: string): SourceIntelligenceObservationFlagV2 {
  return {
    sourceId: "src_uspto",
    kind: "HIGH_VALUE_UNOBSERVED",
    severity: "ATTENTION",
    observedAt: "2026-08-09T03:00:00.000Z",
    reasonCodes: ["SOURCE_VALUE_HIGH_OR_VERY_HIGH", "EVIDENCE_MATURITY_UNOBSERVED"],
    current: point(currentId),
    ...(previousId ? { previous: point(previousId) } : {}),
  };
}

function summary(flags: SourceIntelligenceObservationFlagV2[]): SourceIntelligenceCrossSourceObservationSummaryV2 {
  return {
    protocolVersion: "2.0",
    objectType: "SOURCE_INTELLIGENCE_CROSS_SOURCE_OBSERVATION_SUMMARY",
    summarizedThrough: "2026-08-09T03:00:00.000Z",
    sourceCount: 1,
    assessedSourceCount: 1,
    flaggedSourceCount: flags.length > 0 ? 1 : 0,
    counts: {
      highValueUnobserved: flags.filter((item) => item.kind === "HIGH_VALUE_UNOBSERVED").length,
      evidenceMaturityRegressions: 0,
      sourceValueBandChanges: flags.filter((item) => item.kind === "SOURCE_VALUE_BAND_CHANGED").length,
      acquisitionCostIncreases: 0,
    },
    flags,
    semantics: {
      input: "DISTINCT_EVIDENCE_STATE_HISTORIES",
      comparisonScope: "LATEST_DISTINCT_STATE_PER_SOURCE",
      observationFlagsAreDeterministicRules: true,
      observationFlagsAreNotTruthOrQualityJudgments: true,
      sourceValueAndEvidenceMaturityIndependent: true,
      acquisitionCostSeparate: true,
    },
    scheduling: { policyStatus: "NOT_AUTHORIZED_UNCALIBRATED" },
    boundaries: {
      legalTruthVerified: false,
      authorityInferred: false,
      professionalQualityVerified: false,
      crossSourceIdentityResolved: false,
      autoScheduleApplied: false,
      grantsCollectionAuthority: false,
      grantsMgsnQualification: false,
    },
  };
}

function review(
  item: SourceIntelligenceObservationFlagV2,
  status: "ACKNOWLEDGED" | "IGNORED",
): SourceIntelligenceObservationReviewRecordV2 {
  return {
    observationKey: sourceIntelligenceObservationReviewKey(item),
    sourceId: item.sourceId,
    flagKind: item.kind,
    currentAssessmentId: item.current.assessmentId,
    ...(item.previous?.assessmentId ? { previousAssessmentId: item.previous.assessmentId } : {}),
    status,
    reviewer: "tester",
    createdAt: "2026-08-09T03:05:00.000Z",
    updatedAt: "2026-08-09T03:05:00.000Z",
  };
}

describe("D2.9 review queue", () => {
  it("scopes review keys to one exact observation occurrence", () => {
    const first = flag("current-a", "previous-a");
    const same = flag("current-a", "previous-a");
    const changed = flag("current-b", "current-a");
    expect(sourceIntelligenceObservationReviewKey(first)).toBe(sourceIntelligenceObservationReviewKey(same));
    expect(sourceIntelligenceObservationReviewKey(changed)).not.toBe(sourceIntelligenceObservationReviewKey(first));
  });

  it("joins exact reviews and preserves the no-automation boundary", () => {
    const acknowledged = flag("ack-current");
    const ignored: SourceIntelligenceObservationFlagV2 = {
      ...flag("ignored-current", "ignored-previous"),
      kind: "SOURCE_VALUE_BAND_CHANGED",
      severity: "INFO",
    };
    const queue = buildSourceIntelligenceObservationReviewQueueV2(
      summary([acknowledged, ignored]),
      [review(acknowledged, "ACKNOWLEDGED"), review(ignored, "IGNORED")],
    );
    expect(queue.counts).toEqual({ pending: 0, acknowledged: 1, ignored: 1 });
    expect(queue.items.map((item) => item.status)).toEqual(["ACKNOWLEDGED", "IGNORED"]);
    expect(queue.boundaries.reviewDoesNotAuthorizeAction).toBe(true);
    expect(queue.scheduling.policyStatus).toBe("NOT_AUTHORIZED_UNCALIBRATED");
  });

  it("resets a changed occurrence to pending instead of carrying an old disposition forward", () => {
    const oldOccurrence = flag("old-current", "old-previous");
    const newOccurrence = flag("new-current", "old-current");
    const queue = buildSourceIntelligenceObservationReviewQueueV2(
      summary([newOccurrence]),
      [review(oldOccurrence, "IGNORED")],
    );
    expect(queue.counts).toEqual({ pending: 1, acknowledged: 0, ignored: 0 });
    expect(queue.items[0]?.status).toBe("PENDING");
    expect(queue.items[0]?.review).toBeNull();
    expect(queue.semantics.newObservationOccurrenceResetsToPending).toBe(true);
  });
});
