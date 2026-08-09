import { describe, expect, it } from "vitest";
import type {
  SourceIntelligenceObservationFlagV2,
  SourceIntelligenceObservationReviewQueueV2,
} from "@markorbit/contracts";
import { buildSourceIntelligenceManualSlaAndEscalationV2 } from "../src/source-intelligence-manual-sla";
import { buildSourceIntelligenceObservationOwnershipQueueV2 } from "../src/source-intelligence-review-ownership";

function flag(): SourceIntelligenceObservationFlagV2 {
  return {
    sourceId: "src_cohort",
    kind: "HIGH_VALUE_UNOBSERVED",
    severity: "ATTENTION",
    observedAt: "2026-08-09T00:00:00.000Z",
    reasonCodes: ["TEST"],
    current: {
      assessmentId: "si2_cohort",
      legacyAssessmentId: "sia_cohort",
      assessedAt: "2026-08-09T00:00:00.000Z",
      inputFingerprint: "a".repeat(64),
      evaluatorVersion: "2.1.0",
      sourceValue: { score: 90, band: "VERY_HIGH" },
      evidenceMaturity: { score: null, stage: "UNOBSERVED" },
      observedAcquisitionCost: { score: null, confidence: "LOW" },
    },
  };
}

function queue(): SourceIntelligenceObservationReviewQueueV2 {
  return {
    protocolVersion: "2.0",
    objectType: "SOURCE_INTELLIGENCE_OBSERVATION_REVIEW_QUEUE",
    sourceCount: 1,
    flaggedSourceCount: 1,
    itemCount: 1,
    counts: { pending: 1, acknowledged: 0, ignored: 0 },
    items: [
      {
        observationKey: "sir_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        sourceId: "src_cohort",
        status: "PENDING",
        flag: flag(),
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

describe("D2.14 effective policy integration", () => {
  it("overrides the global D2.13 clock target for an explicitly scoped source", () => {
    const ownershipQueue = buildSourceIntelligenceObservationOwnershipQueueV2({
      queue: queue(),
      ownership: [],
    });
    const result = buildSourceIntelligenceManualSlaAndEscalationV2({
      ownershipQueue,
      policy: {
        protocolVersion: "2.0",
        policyId: "source-intelligence-review-workflow",
        claimTargetHours: 24,
        reviewTargetHours: 48,
        updatedBy: "ops-lead",
        updatedAt: "2026-08-09T00:00:00.000Z",
      },
      effectivePolicies: [
        {
          sourceId: "src_cohort",
          scope: "COHORT",
          cohortId: "sic_11111111111111111111111111111111",
          cohortName: "Fast lane",
          priority: 100,
          claimTargetHours: 4,
          reviewTargetHours: 12,
          matchedCohortIds: ["sic_11111111111111111111111111111111"],
        },
      ],
      escalations: [],
      generatedAt: "2026-08-09T06:00:00.000Z",
    });

    expect(result.items[0]?.claim).toMatchObject({
      targetHours: 4,
      state: "OVER_TARGET",
      elapsedHours: 6,
      overdueHours: 2,
    });
  });
});
