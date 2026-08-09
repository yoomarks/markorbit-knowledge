import { describe, expect, it } from "vitest";
import type {
  SourceIntelligenceObservationFlagV2,
  SourceIntelligenceObservationOwnershipEventV2,
  SourceIntelligenceObservationOwnershipRecordV2,
  SourceIntelligenceObservationReviewQueueV2,
} from "@markorbit/contracts";
import { buildSourceIntelligenceAssignmentHealthAndCapacityV2 } from "../src/source-intelligence-assignment-health";
import { buildSourceIntelligenceObservationOwnershipQueueV2 } from "../src/source-intelligence-review-ownership";

function flag(
  sourceId: string,
  kind: SourceIntelligenceObservationFlagV2["kind"],
  severity: "INFO" | "ATTENTION",
  observedAt: string,
): SourceIntelligenceObservationFlagV2 {
  return {
    sourceId,
    kind,
    severity,
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
  const fixtures = [
    {
      key: "sir_11111111111111111111111111111111",
      sourceId: "src_unassigned",
      status: "PENDING" as const,
      flag: flag(
        "src_unassigned",
        "HIGH_VALUE_UNOBSERVED",
        "ATTENTION",
        "2026-08-01T12:00:00.000Z",
      ),
    },
    {
      key: "sir_22222222222222222222222222222222",
      sourceId: "src_alice",
      status: "PENDING" as const,
      flag: flag(
        "src_alice",
        "EVIDENCE_MATURITY_REGRESSION",
        "ATTENTION",
        "2026-08-04T12:00:00.000Z",
      ),
    },
    {
      key: "sir_33333333333333333333333333333333",
      sourceId: "src_bob",
      status: "PENDING" as const,
      flag: flag("src_bob", "SOURCE_VALUE_BAND_CHANGED", "INFO", "2026-08-07T12:00:00.000Z"),
    },
    {
      key: "sir_44444444444444444444444444444444",
      sourceId: "src_bob_ack",
      status: "ACKNOWLEDGED" as const,
      flag: flag("src_bob_ack", "ACQUISITION_COST_INCREASED", "INFO", "2026-08-08T12:00:00.000Z"),
    },
  ];
  return {
    protocolVersion: "2.0",
    objectType: "SOURCE_INTELLIGENCE_OBSERVATION_REVIEW_QUEUE",
    sourceCount: 4,
    flaggedSourceCount: 4,
    itemCount: 4,
    counts: { pending: 3, acknowledged: 1, ignored: 0 },
    items: fixtures.map((fixture) => ({
      observationKey: fixture.key,
      sourceId: fixture.sourceId,
      status: fixture.status,
      flag: fixture.flag,
      review: null,
    })),
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

function ownershipRecords(): SourceIntelligenceObservationOwnershipRecordV2[] {
  return [
    {
      observationKey: "sir_22222222222222222222222222222222",
      sourceId: "src_alice",
      flagKind: "EVIDENCE_MATURITY_REGRESSION",
      owner: "alice",
      changedBy: "alice",
      assignedAt: "2026-08-05T12:00:00.000Z",
      updatedAt: "2026-08-05T12:00:00.000Z",
    },
    {
      observationKey: "sir_33333333333333333333333333333333",
      sourceId: "src_bob",
      flagKind: "SOURCE_VALUE_BAND_CHANGED",
      owner: "bob",
      changedBy: "ops-lead",
      assignedAt: "2026-08-08T12:00:00.000Z",
      updatedAt: "2026-08-08T12:00:00.000Z",
    },
    {
      observationKey: "sir_44444444444444444444444444444444",
      sourceId: "src_bob_ack",
      flagKind: "ACQUISITION_COST_INCREASED",
      owner: "bob",
      changedBy: "bob",
      assignedAt: "2026-08-08T18:00:00.000Z",
      updatedAt: "2026-08-08T18:00:00.000Z",
    },
  ];
}

function ownershipEvents(): SourceIntelligenceObservationOwnershipEventV2[] {
  return [
    {
      eventId: "sioe_1",
      observationKey: "sir_22222222222222222222222222222222",
      sourceId: "src_alice",
      flagKind: "EVIDENCE_MATURITY_REGRESSION",
      action: "CLAIMED",
      previousOwner: null,
      owner: "alice",
      actor: "alice",
      occurredAt: "2026-08-05T12:00:00.000Z",
    },
    {
      eventId: "sioe_2",
      observationKey: "sir_33333333333333333333333333333333",
      sourceId: "src_bob",
      flagKind: "SOURCE_VALUE_BAND_CHANGED",
      action: "CLAIMED",
      previousOwner: null,
      owner: "alice",
      actor: "alice",
      occurredAt: "2026-08-08T00:00:00.000Z",
    },
    {
      eventId: "sioe_3",
      observationKey: "sir_33333333333333333333333333333333",
      sourceId: "src_bob",
      flagKind: "SOURCE_VALUE_BAND_CHANGED",
      action: "TRANSFERRED",
      previousOwner: "alice",
      owner: "bob",
      actor: "ops-lead",
      occurredAt: "2026-08-08T12:00:00.000Z",
    },
    {
      eventId: "sioe_4",
      observationKey: "sir_44444444444444444444444444444444",
      sourceId: "src_bob_ack",
      flagKind: "ACQUISITION_COST_INCREASED",
      action: "CLAIMED",
      previousOwner: null,
      owner: "bob",
      actor: "bob",
      occurredAt: "2026-08-08T18:00:00.000Z",
    },
    {
      eventId: "sioe_5",
      observationKey: "sir_oldoldoldoldoldoldoldoldoldoldol",
      sourceId: "src_old",
      flagKind: "SOURCE_VALUE_BAND_CHANGED",
      action: "RELEASED",
      previousOwner: "bob",
      owner: null,
      actor: "bob",
      occurredAt: "2026-08-08T20:00:00.000Z",
    },
  ];
}

describe("D2.12 assignment health and capacity", () => {
  it("reports unassigned age, claim latency, handoffs and descriptive workload shape", () => {
    const events = ownershipEvents();
    const ownershipQueue = buildSourceIntelligenceObservationOwnershipQueueV2({
      queue: reviewQueue(),
      ownership: ownershipRecords(),
      ownershipEvents: events,
    });
    const result = buildSourceIntelligenceAssignmentHealthAndCapacityV2({
      ownershipQueue,
      ownershipEvents: events,
      generatedAt: "2026-08-09T12:00:00.000Z",
    });

    expect(result.unassignedBacklog.pendingCount).toBe(1);
    expect(result.unassignedBacklog.attentionPendingCount).toBe(1);
    expect(result.unassignedBacklog.oldestPendingAgeHours).toBe(192);
    expect(result.unassignedBacklog.ageBuckets.atLeast7Days).toBe(1);
    expect(result.assignmentTenure.assignedItemCount).toBe(3);
    expect(result.assignmentTenure.oldestAssignmentAgeHours).toBe(96);
    expect(result.firstClaimLatency.sampledCurrentOccurrenceCount).toBe(3);
    expect(result.firstClaimLatency.medianHours).toBe(12);
    expect(result.firstClaimLatency.p90Hours).toBe(24);
    expect(result.handoffs).toEqual({
      visibleEventCount: 5,
      claimCount: 3,
      transferCount: 1,
      releaseCount: 1,
    });
    expect(result.workloadShape).toEqual({
      operatorCount: 2,
      assignedPendingCount: 2,
      minPendingPerOperator: 1,
      maxPendingPerOperator: 1,
      meanPendingPerOperator: 1,
      medianPendingPerOperator: 1,
      pendingSpread: 0,
      maxPendingShare: 0.5,
      coefficientOfVariation: 0,
    });
    expect(result.operators.map((operator) => operator.operator)).toEqual(["alice", "bob"]);
    expect(result.operators[0]).toMatchObject({
      operator: "alice",
      pendingCount: 1,
      claimEventCount: 2,
      transferOutEventCount: 1,
    });
    expect(result.operators[1]).toMatchObject({
      operator: "bob",
      assignedItemCount: 2,
      pendingCount: 1,
      transferInEventCount: 1,
      releaseEventCount: 1,
    });
  });

  it("keeps assignment metrics descriptive and does not grant routing or execution authority", () => {
    const ownershipQueue = buildSourceIntelligenceObservationOwnershipQueueV2({
      queue: reviewQueue(),
      ownership: ownershipRecords(),
    });
    const result = buildSourceIntelligenceAssignmentHealthAndCapacityV2({
      ownershipQueue,
      ownershipEvents: [],
      generatedAt: "2026-08-09T12:00:00.000Z",
    });

    expect(result.semantics.capacityMetricsRepresentObservedWorkloadNotStaffingCapacity).toBe(true);
    expect(result.semantics.imbalanceMetricsAreDescriptiveNotRoutingPolicy).toBe(true);
    expect(result.boundaries.assignmentHealthDoesNotAuthorizeAction).toBe(true);
    expect(result.boundaries.automaticAssignmentApplied).toBe(false);
    expect(result.boundaries.operatorIdentityVerified).toBe(false);
    expect(result.scheduling.policyStatus).toBe("NOT_AUTHORIZED_UNCALIBRATED");
  });
});
