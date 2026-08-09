import type { SourceIntelligenceObservationFlagKind } from "./source-intelligence-cross-source-observation-v2";

export const SOURCE_INTELLIGENCE_MANUAL_SLA_PROTOCOL_VERSION = "2.0" as const;
export const SOURCE_INTELLIGENCE_MANUAL_SLA_POLICY_ID =
  "source-intelligence-review-workflow" as const;

export type SourceIntelligenceManualSlaPolicyV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_MANUAL_SLA_PROTOCOL_VERSION;
  policyId: typeof SOURCE_INTELLIGENCE_MANUAL_SLA_POLICY_ID;
  claimTargetHours: number | null;
  reviewTargetHours: number | null;
  updatedBy: string;
  updatedAt: string;
};

export type SourceIntelligenceManualEscalationAction = "ESCALATED" | "CLEARED";

export type SourceIntelligenceManualEscalationRecordV2 = {
  observationKey: string;
  sourceId: string;
  flagKind: SourceIntelligenceObservationFlagKind;
  escalated: boolean;
  actor: string;
  note?: string;
  updatedAt: string;
};

export type SourceIntelligenceManualEscalationEventV2 = {
  eventId: string;
  observationKey: string;
  sourceId: string;
  flagKind: SourceIntelligenceObservationFlagKind;
  action: SourceIntelligenceManualEscalationAction;
  previousEscalated: boolean;
  escalated: boolean;
  actor: string;
  note?: string;
  occurredAt: string;
};

export type SourceIntelligenceManualSlaState =
  "DISABLED" | "NOT_STARTED" | "WITHIN_TARGET" | "OVER_TARGET" | "COMPLETED";

export type SourceIntelligenceManualSlaClockV2 = {
  state: SourceIntelligenceManualSlaState;
  targetHours: number | null;
  elapsedHours: number | null;
  overdueHours: number | null;
  startedAt: string | null;
};

export type SourceIntelligenceManualSlaItemV2 = {
  observationKey: string;
  sourceId: string;
  flagKind: SourceIntelligenceObservationFlagKind;
  severity: "INFO" | "ATTENTION";
  reviewStatus: "PENDING" | "ACKNOWLEDGED" | "IGNORED";
  owner: string | null;
  observedAt: string;
  assignedAt: string | null;
  claim: SourceIntelligenceManualSlaClockV2;
  review: SourceIntelligenceManualSlaClockV2;
  escalated: boolean;
  escalation: SourceIntelligenceManualEscalationRecordV2 | null;
};

export type SourceIntelligenceManualSlaAndEscalationV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_MANUAL_SLA_PROTOCOL_VERSION;
  objectType: "SOURCE_INTELLIGENCE_MANUAL_SLA_AND_ESCALATION";
  generatedAt: string;
  policy: SourceIntelligenceManualSlaPolicyV2 | null;
  sourceCount: number;
  itemCount: number;
  counts: {
    unassignedPending: number;
    claimOverTarget: number;
    reviewOverTarget: number;
    escalated: number;
    overTargetAndNotEscalated: number;
  };
  items: SourceIntelligenceManualSlaItemV2[];
  recentEscalationEvents: SourceIntelligenceManualEscalationEventV2[];
  semantics: {
    policyConfiguredByHuman: true;
    nullTargetDisablesClock: true;
    claimClockScope: "CURRENT_UNASSIGNED_PENDING_OCCURRENCE";
    claimClockStartsAtObservation: true;
    claimClockCompletesWhenAssigned: true;
    reviewClockScope: "CURRENT_OWNER_PENDING_REVIEW";
    reviewClockStartsAtCurrentAssignment: true;
    transferResetsReviewClock: true;
    workflowTargetsAreNotEvidenceFreshness: true;
    workflowTargetsAreNotLegalOrContractualSla: true;
    escalationIsExplicitHumanWorkflowState: true;
    overTargetDoesNotAutoEscalate: true;
    escalationDoesNotMutateReviewDisposition: true;
    escalationDoesNotMutateObservationEvidence: true;
    ownerLabelsAreNotAuthenticatedIdentities: true;
  };
  scheduling: {
    policyStatus: "NOT_AUTHORIZED_UNCALIBRATED";
  };
  boundaries: {
    manualSlaDoesNotAuthorizeAction: true;
    automaticEscalationApplied: false;
    automaticNotificationApplied: false;
    automaticAssignmentApplied: false;
    automaticRemediationApplied: false;
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

export type SourceIntelligenceManualSlaPolicyMutationV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_MANUAL_SLA_PROTOCOL_VERSION;
  actor: string;
  claimTargetHours: number | null;
  reviewTargetHours: number | null;
  expectedUpdatedAt: string | null;
};

export type SourceIntelligenceManualEscalationMutationV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_MANUAL_SLA_PROTOCOL_VERSION;
  sourceId: string;
  observationKey: string;
  action: SourceIntelligenceManualEscalationAction;
  actor: string;
  note?: string;
  expectedEscalated: boolean;
};
