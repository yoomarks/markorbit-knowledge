import type { SourceIntelligenceObservationFlagKind } from "./source-intelligence-cross-source-observation-v2";

export const SOURCE_INTELLIGENCE_ASSIGNMENT_HEALTH_PROTOCOL_VERSION = "2.0" as const;

export type SourceIntelligenceAssignmentAgeBucketsV2 = {
  under24Hours: number;
  from24To72Hours: number;
  from72HoursTo7Days: number;
  atLeast7Days: number;
};

export type SourceIntelligenceAssignmentUnassignedItemV2 = {
  observationKey: string;
  sourceId: string;
  flagKind: SourceIntelligenceObservationFlagKind;
  severity: "INFO" | "ATTENTION";
  observedAt: string;
  ageHours: number;
};

export type SourceIntelligenceAssignmentOperatorCapacityV2 = {
  operator: string;
  assignedItemCount: number;
  pendingCount: number;
  acknowledgedCount: number;
  ignoredCount: number;
  attentionPendingCount: number;
  oldestPendingObservedAt: string | null;
  oldestPendingAgeHours: number | null;
  oldestCurrentAssignmentAt: string | null;
  oldestCurrentAssignmentAgeHours: number | null;
  claimEventCount: number;
  transferInEventCount: number;
  transferOutEventCount: number;
  releaseEventCount: number;
};

export type SourceIntelligenceAssignmentHealthAndCapacityV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_ASSIGNMENT_HEALTH_PROTOCOL_VERSION;
  objectType: "SOURCE_INTELLIGENCE_ASSIGNMENT_HEALTH_AND_CAPACITY";
  generatedAt: string;
  sourceCount: number;
  currentItemCount: number;
  unassignedBacklog: {
    itemCount: number;
    pendingCount: number;
    attentionPendingCount: number;
    oldestPendingObservedAt: string | null;
    oldestPendingAgeHours: number | null;
    ageBuckets: SourceIntelligenceAssignmentAgeBucketsV2;
    oldestItems: SourceIntelligenceAssignmentUnassignedItemV2[];
  };
  assignmentTenure: {
    assignedItemCount: number;
    oldestAssignedAt: string | null;
    oldestAssignmentAgeHours: number | null;
    medianAssignmentAgeHours: number | null;
  };
  firstClaimLatency: {
    sampledCurrentOccurrenceCount: number;
    medianHours: number | null;
    p90Hours: number | null;
  };
  handoffs: {
    visibleEventCount: number;
    claimCount: number;
    transferCount: number;
    releaseCount: number;
  };
  workloadShape: {
    operatorCount: number;
    assignedPendingCount: number;
    minPendingPerOperator: number | null;
    maxPendingPerOperator: number | null;
    meanPendingPerOperator: number | null;
    medianPendingPerOperator: number | null;
    pendingSpread: number | null;
    maxPendingShare: number | null;
    coefficientOfVariation: number | null;
  };
  operators: SourceIntelligenceAssignmentOperatorCapacityV2[];
  semantics: {
    input: "CURRENT_D2_11_OWNERSHIP_QUEUE";
    ownershipEventInput: "BOUNDED_PERSISTED_OWNERSHIP_EVENTS";
    unassignedAgeIsWorkflowAgeNotEvidenceFreshness: true;
    assignmentTenureResetsOnClaimOrTransfer: true;
    firstClaimLatencyScope: "CURRENT_OCCURRENCES_WITH_VISIBLE_FIRST_CLAIM_EVENT";
    capacityMetricsRepresentObservedWorkloadNotStaffingCapacity: true;
    imbalanceMetricsAreDescriptiveNotRoutingPolicy: true;
    ownerLabelsAreNotAuthenticatedIdentities: true;
    eventWindowMayBeIncomplete: true;
  };
  scheduling: {
    policyStatus: "NOT_AUTHORIZED_UNCALIBRATED";
  };
  boundaries: {
    assignmentHealthDoesNotAuthorizeAction: true;
    automaticAssignmentApplied: false;
    operatorIdentityVerified: false;
    permissionsInferred: false;
    legalTruthVerified: false;
    authorityInferred: false;
    professionalQualityVerified: false;
    crossSourceIdentityResolved: false;
    autoScheduleApplied: false;
    grantsCollectionAuthority: false;
    grantsMgsnQualification: false;
  };
};
