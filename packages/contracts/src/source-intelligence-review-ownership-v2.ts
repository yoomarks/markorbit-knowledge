import type { SourceIntelligenceObservationFlagKind } from "./source-intelligence-cross-source-observation-v2";
import type { SourceIntelligenceObservationReviewQueueItemV2 } from "./source-intelligence-review-queue-v2";

export const SOURCE_INTELLIGENCE_REVIEW_OWNERSHIP_PROTOCOL_VERSION = "2.0" as const;

export type SourceIntelligenceObservationOwnershipAction = "CLAIMED" | "TRANSFERRED" | "RELEASED";

export type SourceIntelligenceObservationOwnershipRecordV2 = {
  observationKey: string;
  sourceId: string;
  flagKind: SourceIntelligenceObservationFlagKind;
  owner: string | null;
  changedBy: string;
  assignedAt: string | null;
  updatedAt: string;
};

export type SourceIntelligenceObservationOwnershipEventV2 = {
  eventId: string;
  observationKey: string;
  sourceId: string;
  flagKind: SourceIntelligenceObservationFlagKind;
  action: SourceIntelligenceObservationOwnershipAction;
  previousOwner: string | null;
  owner: string | null;
  actor: string;
  occurredAt: string;
};

export type SourceIntelligenceObservationOwnershipQueueItemV2 =
  SourceIntelligenceObservationReviewQueueItemV2 & {
    owner: string | null;
    ownership: SourceIntelligenceObservationOwnershipRecordV2 | null;
  };

export type SourceIntelligenceOperatorWorkloadV2 = {
  operator: string;
  itemCount: number;
  pendingCount: number;
  acknowledgedCount: number;
  ignoredCount: number;
  attentionCount: number;
  oldestPendingObservedAt: string | null;
};

export type SourceIntelligenceObservationOwnershipQueueV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_REVIEW_OWNERSHIP_PROTOCOL_VERSION;
  objectType: "SOURCE_INTELLIGENCE_OBSERVATION_OWNERSHIP_QUEUE";
  sourceCount: number;
  itemCount: number;
  counts: {
    assigned: number;
    unassigned: number;
    assignedPending: number;
    unassignedPending: number;
  };
  workloads: SourceIntelligenceOperatorWorkloadV2[];
  items: SourceIntelligenceObservationOwnershipQueueItemV2[];
  recentOwnershipEvents: SourceIntelligenceObservationOwnershipEventV2[];
  semantics: {
    input: "CURRENT_D2_9_REVIEW_QUEUE";
    ownershipScope: "EXACT_OBSERVATION_OCCURRENCE";
    ownerIsWorkflowLabelNotAuthenticatedIdentity: true;
    newObservationOccurrenceStartsUnassigned: true;
    ownershipIndependentFromReviewDisposition: true;
    handoffDoesNotMutateObservationEvidence: true;
    personalViewRequiresExplicitOperatorLabel: true;
  };
  scheduling: {
    policyStatus: "NOT_AUTHORIZED_UNCALIBRATED";
  };
  boundaries: {
    ownershipDoesNotAuthorizeAction: true;
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

export type SourceIntelligenceOwnershipMutationV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_REVIEW_OWNERSHIP_PROTOCOL_VERSION;
  sourceId: string;
  observationKey: string;
  action: SourceIntelligenceObservationOwnershipAction;
  actor: string;
  owner?: string;
  expectedOwner: string | null;
};

export type SourceIntelligenceOwnershipViewFilter =
  | { view: "TEAM" }
  | { view: "UNASSIGNED" }
  | { view: "MINE"; operator: string };
