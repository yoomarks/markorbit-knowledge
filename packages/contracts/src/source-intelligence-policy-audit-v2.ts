export const SOURCE_INTELLIGENCE_POLICY_AUDIT_PROTOCOL_VERSION = "2.0" as const;

export type SourceIntelligencePolicyAuditScope = "GLOBAL_POLICY" | "COHORT" | "MEMBERSHIP";

export type SourceIntelligencePolicyAuditAction =
  | "SNAPSHOT_BACKFILL"
  | "GLOBAL_POLICY_CHANGED"
  | "COHORT_CREATED"
  | "COHORT_UPDATED"
  | "MEMBERSHIP_ADDED"
  | "MEMBERSHIP_REMOVED";

export type SourceIntelligencePolicyAuditField =
  | "claimTargetHours"
  | "reviewTargetHours"
  | "name"
  | "description"
  | "priority"
  | "enabled"
  | "membershipPresent";

export type SourceIntelligencePolicyAuditValue = string | number | boolean | null;

export type SourceIntelligencePolicyAuditChangeV2 = {
  field: SourceIntelligencePolicyAuditField;
  before: SourceIntelligencePolicyAuditValue;
  after: SourceIntelligencePolicyAuditValue;
};

export type SourceIntelligencePolicyAuditEventV2 = {
  eventId: string;
  scope: SourceIntelligencePolicyAuditScope;
  action: SourceIntelligencePolicyAuditAction;
  actorLabel: string;
  occurredAt: string;
  policyId: string | null;
  cohortId: string | null;
  sourceId: string | null;
  changes: SourceIntelligencePolicyAuditChangeV2[];
  historicalCompleteness: "EVENT_SOURCED" | "SNAPSHOT_BACKFILL";
};

export type SourceIntelligencePolicyAuditHistoryV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_POLICY_AUDIT_PROTOCOL_VERSION;
  objectType: "SOURCE_INTELLIGENCE_POLICY_AUDIT_HISTORY";
  generatedAt: string;
  eventCount: number;
  counts: {
    globalPolicyEvents: number;
    cohortEvents: number;
    membershipEvents: number;
    snapshotBackfills: number;
  };
  events: SourceIntelligencePolicyAuditEventV2[];
  semantics: {
    appendOnlyWorkflowAudit: true;
    currentSnapshotsMayBeBackfilledOnce: true;
    snapshotBackfillDoesNotReconstructMissingHistory: true;
    actorLabelsAreRecordedWorkflowLabelsNotAuthenticatedIdentities: true;
    changeSetsDescribeWorkflowConfigurationOnly: true;
    historyDoesNotChangeEffectivePolicyPrecedence: true;
    historyDoesNotMutateReviewDispositionOrOwnership: true;
    historyDoesNotChangeEvidenceMaturityOrSourceValue: true;
  };
  scheduling: {
    policyStatus: "NOT_AUTHORIZED_UNCALIBRATED";
  };
  boundaries: {
    auditDoesNotAuthorizeAction: true;
    automaticCohortAssignmentApplied: false;
    automaticRoutingApplied: false;
    automaticEscalationApplied: false;
    automaticNotificationApplied: false;
    automaticCollectionApplied: false;
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
