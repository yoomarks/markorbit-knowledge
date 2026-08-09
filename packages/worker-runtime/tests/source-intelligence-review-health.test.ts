import { describe, expect, it } from "vitest";
import type {
  SourceIntelligenceObservationHistoryV2,
  SourceIntelligenceObservationPointV2,
  SourceIntelligenceObservationReviewEventV2,
} from "@markorbit/contracts";
import { buildSourceIntelligenceCrossSourceObservationSummaryV2 } from "../src/source-intelligence-cross-source-observation";
import {
  buildSourceIntelligenceObservationReviewQueueV2,
  sourceIntelligenceObservationReviewKey,
} from "../src/source-intelligence-review-queue";
import { buildSourceIntelligenceReviewQueueOperationalHealthV2 } from "../src/source-intelligence-review-health";

function point(id: string, assessedAt: string): SourceIntelligenceObservationPointV2 {
  return {
    assessmentId: `si2_${id}`,
    legacyAssessmentId: `sia_${id}`,
    assessedAt,
    inputFingerprint: id.padEnd(64, "a").slice(0, 64),
    evaluatorVersion: "2.1.0",
    sourceValue: { score: 94, band: "VERY_HIGH" },
    evidenceMaturity: { score: null, stage: "UNOBSERVED" },
    observedAcquisitionCost: { score: null, confidence: "LOW" },
  };
}

function history(): SourceIntelligenceObservationHistoryV2 {
  return {
    protocolVersion: "2.0",
    objectType: "SOURCE_INTELLIGENCE_OBSERVATION_HISTORY",
    sourceId: "src_uspto",
    observations: [
      point("a", "2026-08-01T00:00:00.000Z"),
      point("b", "2026-08-03T00:00:00.000Z"),
      point("c", "2026-08-08T00:00:00.000Z"),
    ],
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

function event(
  observationKey: string,
  eventId: string,
  status: "ACKNOWLEDGED" | "IGNORED",
  occurredAt: string,
): SourceIntelligenceObservationReviewEventV2 {
  return {
    eventId,
    observationKey,
    sourceId: "src_uspto",
    flagKind: "HIGH_VALUE_UNOBSERVED",
    action: "DISPOSITION_CHANGED",
    previousStatus: "PENDING",
    status,
    reviewer: "tester",
    occurredAt,
  };
}

describe("D2.10 review queue operational health", () => {
  it("measures current backlog and recurrence without creating scheduler authority", () => {
    const sourceHistory = history();
    const currentSummary = buildSourceIntelligenceCrossSourceObservationSummaryV2([sourceHistory]);
    const queue = buildSourceIntelligenceObservationReviewQueueV2(currentSummary, []);

    const firstSummary = buildSourceIntelligenceCrossSourceObservationSummaryV2([
      {
        sourceId: sourceHistory.sourceId,
        observations: sourceHistory.observations.slice(0, 1),
        transitions: [],
      },
    ]);
    const secondSummary = buildSourceIntelligenceCrossSourceObservationSummaryV2([
      {
        sourceId: sourceHistory.sourceId,
        observations: sourceHistory.observations.slice(0, 2),
        transitions: [],
      },
    ]);
    const firstFlag = firstSummary.flags[0]!;
    const secondFlag = secondSummary.flags[0]!;

    const health = buildSourceIntelligenceReviewQueueOperationalHealthV2({
      queue,
      histories: [sourceHistory],
      reviewEvents: [
        event(
          sourceIntelligenceObservationReviewKey(firstFlag),
          "sire_first",
          "ACKNOWLEDGED",
          "2026-08-01T02:00:00.000Z",
        ),
        event(
          sourceIntelligenceObservationReviewKey(secondFlag),
          "sire_second",
          "IGNORED",
          "2026-08-03T04:00:00.000Z",
        ),
      ],
      generatedAt: "2026-08-09T00:00:00.000Z",
    });

    expect(health.currentCounts).toEqual({ pending: 1, acknowledged: 0, ignored: 0 });
    expect(health.backlog.oldestPendingAgeHours).toBe(24);
    expect(health.backlog.ageBuckets.from24To72Hours).toBe(1);
    expect(health.recurrence.historicalOccurrenceCount).toBe(3);
    expect(health.recurrence.recurringSourceFlagPairCount).toBe(1);
    expect(health.recurrence.maxOccurrenceCount).toBe(3);
    expect(health.attention[0]?.occurrenceCount).toBe(3);
    expect(health.reviewActivity.acknowledgedEvents).toBe(1);
    expect(health.reviewActivity.ignoredEvents).toBe(1);
    expect(health.reviewActivity.medianFirstTouchLatencyHours).toBe(3);
    expect(health.semantics.pendingAgeIsOperatorBacklogAgeNotEvidenceFreshness).toBe(true);
    expect(health.semantics.attentionOrderIsDescriptiveNotSchedulerPriority).toBe(true);
    expect(health.boundaries.healthDoesNotAuthorizeAction).toBe(true);
    expect(health.scheduling.policyStatus).toBe("NOT_AUTHORIZED_UNCALIBRATED");
  });

  it("keeps Source-level operational history separate from evidence and truth judgments", () => {
    const sourceHistory = history();
    const queue = buildSourceIntelligenceObservationReviewQueueV2(
      buildSourceIntelligenceCrossSourceObservationSummaryV2([sourceHistory]),
      [],
    );
    const health = buildSourceIntelligenceReviewQueueOperationalHealthV2({
      queue,
      histories: [sourceHistory],
      reviewEvents: [],
      generatedAt: "2026-08-09T00:00:00.000Z",
    });

    expect(health.sources).toHaveLength(1);
    expect(health.sources[0]?.historicalOccurrenceCount).toBe(3);
    expect(health.sources[0]?.recurringFlagKindCount).toBe(1);
    expect(health.sources[0]?.reviewEventCount).toBe(0);
    expect(health.boundaries.legalTruthVerified).toBe(false);
    expect(health.boundaries.authorityInferred).toBe(false);
    expect(health.boundaries.grantsCollectionAuthority).toBe(false);
  });
});
