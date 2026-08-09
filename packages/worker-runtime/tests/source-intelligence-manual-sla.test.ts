import { describe, expect, it } from "vitest";
import type {
  SourceIntelligenceManualEscalationRecordV2,
  SourceIntelligenceManualSlaPolicyV2,
  SourceIntelligenceObservationFlagV2,
  SourceIntelligenceObservationOwnershipRecordV2,
  SourceIntelligenceObservationReviewQueueV2,
} from "@markorbit/contracts";
import { buildSourceIntelligenceManualSlaAndEscalationV2 } from "../src/source-intelligence-manual-sla";
import { buildSourceIntelligenceObservationOwnershipQueueV2 } from "../src/source-intelligence-review-ownership";

function flag(
  sourceId: string,
  kind: SourceIntelligenceObservationFlagV2["kind"],
  observedAt: string,
): SourceIntelligenceObservationFlagV2 {
  return {
    sourceId,
    kind,
    severity: "ATTENTION",
    observedAt,
    reasonCodes: ["TEST"],
    current: {
      assessmentId: `si2_${sourceId}_${kind}`,
      legacyAssessmentId: `sia_${sourceId}_${kind}`,
      assessedAt: observedAt,
      inputFingerprint: "a".repeat(64),
      evaluatorVersion: "2.1.0",
      sourceValue: { score: 90, band: "VERY_HIGH" },
      evidenceMaturity: { score: null, stage: "UNOBSERVED" },
      observedAcquisitionCost: { score: null, confidence: "LOW" },
    },
  };
}

function reviewQueue(): SourceIntelligenceObservationReviewQueueV2 {
  return {
    protocolVersion: "2.0",
    objectType: "SOURCE_INTELLIGENCE_OBSERVATION_REVIEW_QUEUE",
    sourceCount: 3,
    flaggedSourceCount: 3,
    itemCount: 3,
    counts: { pending: 2, acknowledged: 1, ignored: 0 },
    items: [
      {
        observationKey: "sir_11111111111111111111111111111111",
        sourceId: "src_unassigned",
        status: "PENDING",
        flag: flag("src_unassigned", "HIGH_VALUE_UNOBSERVED", "2026-08-07T12:00:00.000Z"),
        review: null,
      },
      {
        observationKey: "sir_22222222222222222222222222222222",
        sourceId: "src_alice",
        status: "PENDING",
        flag: flag(
          "src_alice",
          "EVIDENCE_MATURITY_REGRESSION",
          "2026-08-05T12:00:00.000Z",
        ),
        review: null,
      },
      {
        observationKey: "sir_33333333333333333333333333333333",
        sourceId: "src_done",
        status: "ACKNOWLEDGED",
        flag: flag("src_done", "SOURCE_VALUE_BAND_CHANGED", "2026-08-04T12:00:00.000Z"),
        review: null,
      },
    ],
    semantics: {
      input: "CURRENT_CROSS_SOURCE_OBSERVATION_FLAGS",
      reviewScope: "EXACT_OBSERVATION_OCCURRENCE",
      missingReviewDefaultsToPending: true,
      newObservationOccurrenceResetsToPending: true,
      reviewsDoNotMutateObservationEvidence: true,
      reviewsDoNotMutateSourceValue: true,
      reviewsDoNotMutateEvidenceMaturity: true,
    },
    scheduling: { policyStatus: "NOT_AUTHORIZED_UNCALIBRATED" },
    boundaries: {
      reviewDoesNotAuthorizeAction: true,
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

function ownership(): SourceIntelligenceObservationOwnershipRecordV2[] {
  return [
    {
      observationKey: "sir_22222222222222222222222222222222",
      sourceId: "src_alice",
      flagKind: "EVIDENCE_MATURITY_REGRESSION",
      owner: "alice",
      changedBy: "ops-lead",
      assignedAt: "2026-08-06T12:00:00.000Z",
      updatedAt: "2026-08-06T12:00:00.000Z",
    },
    {
      observationKey: "sir_33333333333333333333333333333333",
      sourceId: "src_done",
      flagKind: "SOURCE_VALUE_BAND_CHANGED",
      owner: "bob",
      changedBy: "ops-lead",
      assignedAt: "2026-08-08T12:00:00.000Z",
      updatedAt: "2026-08-08T12:00:00.000Z",
    },
  ];
}

const policy: SourceIntelligenceManualSlaPolicyV2 = {
  protocolVersion: "2.0",
  policyId: "source-intelligence-review-workflow",
  claimTargetHours: 24,
  reviewTargetHours: 48,
  updatedBy: "ops-lead",
  updatedAt: "2026-08-09T00:00:00.000Z",
};

const escalation: SourceIntelligenceManualEscalationRecordV2 = {
  observationKey: "sir_11111111111111111111111111111111",
  sourceId: "src_unassigned",
  flagKind: "HIGH_VALUE_UNOBSERVED",
  escalated: true,
  actor: "ops-lead",
  note: "Manual attention required",
  updatedAt: "2026-08-09T10:00:00.000Z",
};

describe("D2.13 manual SLA and escalation", () => {
  it("shows human-configured target breaches and independent escalation state", () => {
    const ownershipQueue = buildSourceIntelligenceObservationOwnershipQueueV2({
      queue: reviewQueue(),
      ownership: ownership(),
    });
    const result = buildSourceIntelligenceManualSlaAndEscalationV2({
      ownershipQueue,
      policy,
      escalations: [escalation],
      generatedAt: "2026-08-09T12:00:00.000Z",
    });

    expect(result.counts).toEqual({
      unassignedPending: 1,
      claimOverTarget: 1,
      reviewOverTarget: 1,
      escalated: 1,
      overTargetAndNotEscalated: 1,
    });
    expect(result.items[0]).toMatchObject({
      observationKey: escalation.observationKey,
      owner: null,
      escalated: true,
      claim: { state: "OVER_TARGET", elapsedHours: 48, overdueHours: 24 },
      review: { state: "NOT_STARTED" },
    });
    const alice = result.items.find((item) => item.sourceId === "src_alice");
    expect(alice).toMatchObject({
      owner: "alice",
      escalated: false,
      claim: { state: "COMPLETED" },
      review: { state: "OVER_TARGET", elapsedHours: 72, overdueHours: 24 },
    });
    const done = result.items.find((item) => item.sourceId === "src_done");
    expect(done?.claim.state).toBe("COMPLETED");
    expect(done?.review.state).toBe("COMPLETED");
    expect(result.semantics.overTargetDoesNotAutoEscalate).toBe(true);
  });

  it("disables clocks without a policy and preserves no-automation boundaries", () => {
    const ownershipQueue = buildSourceIntelligenceObservationOwnershipQueueV2({
      queue: reviewQueue(),
      ownership: ownership(),
    });
    const result = buildSourceIntelligenceManualSlaAndEscalationV2({
      ownershipQueue,
      policy: null,
      escalations: [],
      generatedAt: "2026-08-09T12:00:00.000Z",
    });

    expect(result.items.every((item) => item.claim.state === "DISABLED")).toBe(true);
    expect(result.items.every((item) => item.review.state === "DISABLED")).toBe(true);
    expect(result.counts.escalated).toBe(0);
    expect(result.boundaries.automaticEscalationApplied).toBe(false);
    expect(result.boundaries.automaticNotificationApplied).toBe(false);
    expect(result.boundaries.automaticAssignmentApplied).toBe(false);
    expect(result.boundaries.manualSlaDoesNotAuthorizeAction).toBe(true);
    expect(result.scheduling.policyStatus).toBe("NOT_AUTHORIZED_UNCALIBRATED");
  });
});
