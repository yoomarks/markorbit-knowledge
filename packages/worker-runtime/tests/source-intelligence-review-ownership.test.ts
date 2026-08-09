import { describe, expect, it } from "vitest";
import type {
  SourceIntelligenceObservationFlagV2,
  SourceIntelligenceObservationOwnershipEventV2,
  SourceIntelligenceObservationOwnershipRecordV2,
  SourceIntelligenceObservationReviewQueueV2,
} from "@markorbit/contracts";
import { buildSourceIntelligenceObservationOwnershipQueueV2 } from "../src/source-intelligence-review-ownership";

function flag(sourceId: string, kind: SourceIntelligenceObservationFlagV2["kind"], severity: "INFO" | "ATTENTION", assessedAt: string): SourceIntelligenceObservationFlagV2 {
  return {
    sourceId,
    kind,
    severity,
    observedAt: assessedAt,
    reasonCodes: ["TEST"],
    current: {
      assessmentId: `si2_${sourceId}_${kind}`,
      legacyAssessmentId: `sia_${sourceId}_${kind}`,
      assessedAt,
      inputFingerprint: "a".repeat(64),
      evaluatorVersion: "2.1.0",
      sourceValue: { score: 90, band: "VERY_HIGH" },
      evidenceMaturity: { score: null, stage: "UNOBSERVED" },
      observedAcquisitionCost: { score: null, confidence: "LOW" },
    },
  };
}

function queue(): SourceIntelligenceObservationReviewQueueV2 {
  const firstFlag = flag("src_a", "HIGH_VALUE_UNOBSERVED", "ATTENTION", "2026-08-09T00:00:00.000Z");
  const secondFlag = flag("src_b", "SOURCE_VALUE_BAND_CHANGED", "INFO", "2026-08-09T01:00:00.000Z");
  return {
    protocolVersion: "2.0",
    objectType: "SOURCE_INTELLIGENCE_OBSERVATION_REVIEW_QUEUE",
    sourceCount: 2,
    flaggedSourceCount: 2,
    itemCount: 2,
    counts: { pending: 1, acknowledged: 1, ignored: 0 },
    items: [
      {
        observationKey: "sir_11111111111111111111111111111111",
        sourceId: "src_a",
        status: "PENDING",
        flag: firstFlag,
        review: null,
      },
      {
        observationKey: "sir_22222222222222222222222222222222",
        sourceId: "src_b",
        status: "ACKNOWLEDGED",
        flag: secondFlag,
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

describe("D2.11 review ownership queue", () => {
  it("joins exact ownership and reports team workload without granting authority", () => {
    const ownership: SourceIntelligenceObservationOwnershipRecordV2[] = [
      {
        observationKey: "sir_11111111111111111111111111111111",
        sourceId: "src_a",
        flagKind: "HIGH_VALUE_UNOBSERVED",
        owner: "alice",
        changedBy: "ops-lead",
        assignedAt: "2026-08-09T00:05:00.000Z",
        updatedAt: "2026-08-09T00:05:00.000Z",
      },
    ];
    const events: SourceIntelligenceObservationOwnershipEventV2[] = [
      {
        eventId: "sioe_1",
        observationKey: ownership[0]!.observationKey,
        sourceId: "src_a",
        flagKind: "HIGH_VALUE_UNOBSERVED",
        action: "CLAIMED",
        previousOwner: null,
        owner: "alice",
        actor: "ops-lead",
        occurredAt: "2026-08-09T00:05:00.000Z",
      },
    ];
    const result = buildSourceIntelligenceObservationOwnershipQueueV2({
      queue: queue(),
      ownership,
      ownershipEvents: events,
    });

    expect(result.counts).toEqual({
      assigned: 1,
      unassigned: 1,
      assignedPending: 1,
      unassignedPending: 0,
    });
    expect(result.items.map((item) => item.owner)).toEqual(["alice", null]);
    expect(result.workloads).toEqual([
      {
        operator: "alice",
        itemCount: 1,
        pendingCount: 1,
        acknowledgedCount: 0,
        ignoredCount: 0,
        attentionCount: 1,
        oldestPendingObservedAt: "2026-08-09T00:00:00.000Z",
      },
    ]);
    expect(result.boundaries.ownershipDoesNotAuthorizeAction).toBe(true);
    expect(result.boundaries.operatorIdentityVerified).toBe(false);
    expect(result.scheduling.policyStatus).toBe("NOT_AUTHORIZED_UNCALIBRATED");
  });

  it("does not carry ownership from a different occurrence key", () => {
    const staleOwnership: SourceIntelligenceObservationOwnershipRecordV2 = {
      observationKey: "sir_33333333333333333333333333333333",
      sourceId: "src_a",
      flagKind: "HIGH_VALUE_UNOBSERVED",
      owner: "alice",
      changedBy: "ops-lead",
      assignedAt: "2026-08-08T23:00:00.000Z",
      updatedAt: "2026-08-08T23:00:00.000Z",
    };
    const result = buildSourceIntelligenceObservationOwnershipQueueV2({
      queue: queue(),
      ownership: [staleOwnership],
    });
    expect(result.items[0]?.owner).toBeNull();
    expect(result.semantics.newObservationOccurrenceStartsUnassigned).toBe(true);
  });
});
