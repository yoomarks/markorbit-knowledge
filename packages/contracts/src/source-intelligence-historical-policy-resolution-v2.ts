import type {
  SourceIntelligencePolicyCohortMembershipV2,
  SourceIntelligencePolicyCohortV2,
} from "./source-intelligence-policy-scope-v2";

export const SOURCE_INTELLIGENCE_HISTORICAL_POLICY_RESOLUTION_PROTOCOL_VERSION = "2.0" as const;

export type SourceIntelligencePolicyResolutionCheckpointV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_HISTORICAL_POLICY_RESOLUTION_PROTOCOL_VERSION;
  checkpointId: "source-intelligence-policy-resolution-baseline";
  checkpointAt: string;
  globalPolicy: {
    claimTargetHours: number | null;
    reviewTargetHours: number | null;
    updatedBy: string;
    updatedAt: string;
  } | null;
  cohorts: SourceIntelligencePolicyCohortV2[];
  memberships: SourceIntelligencePolicyCohortMembershipV2[];
};

export type SourceIntelligenceHistoricalEffectivePolicyV2 = {
  sourceId: string;
  scope: "COHORT" | "GLOBAL" | "UNCONFIGURED";
  cohortId: string | null;
  cohortName: string | null;
  priority: number | null;
  claimTargetHours: number | null;
  reviewTargetHours: number | null;
  matchedCohortIds: string[];
};

export type SourceIntelligenceHistoricalPolicyTraceStepV2 = {
  kind: "CHECKPOINT_BASELINE" | "GLOBAL_EVENT" | "COHORT_EVENT" | "MEMBERSHIP_EVENT" | "PRECEDENCE";
  occurredAt: string;
  eventId: string | null;
  summary: string;
};

export type SourceIntelligenceHistoricalPolicyResolutionItemV2 = {
  sourceId: string;
  asOf: string;
  status: "RESOLVED" | "PARTIAL" | "UNKNOWN";
  completeness:
    | "COMPLETE_FROM_CHECKPOINT"
    | "PARTIAL_PRE_CHECKPOINT"
    | "EVENT_WINDOW_TRUNCATED"
    | "AMBIGUOUS_CHECKPOINT_BOUNDARY"
    | "AMBIGUOUS_SAME_TIMESTAMP";
  resolvedPolicy: SourceIntelligenceHistoricalEffectivePolicyV2 | null;
  observedPolicy: SourceIntelligenceHistoricalEffectivePolicyV2 | null;
  trace: SourceIntelligenceHistoricalPolicyTraceStepV2[];
  unknownReasons: string[];
  appliedEventIds: string[];
  snapshotBackfillEventIds: string[];
};

export type SourceIntelligenceHistoricalPolicyResolutionV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_HISTORICAL_POLICY_RESOLUTION_PROTOCOL_VERSION;
  objectType: "SOURCE_INTELLIGENCE_HISTORICAL_POLICY_RESOLUTION";
  generatedAt: string;
  asOf: string;
  checkpoint: SourceIntelligencePolicyResolutionCheckpointV2;
  items: SourceIntelligenceHistoricalPolicyResolutionItemV2[];
  counts: {
    sourceCount: number;
    resolved: number;
    partial: number;
    unknown: number;
  };
  semantics: {
    checkpointIsImmutableReadModelCoverageMetadata: true;
    afterCheckpointMayBeStrictlyReplayed: true;
    beforeCheckpointNeverClaimsCompleteHistoricalCoverage: true;
    snapshotBackfillDoesNotReconstructMissingHistory: true;
    policyResolutionUsesExplicitStoredMembershipOnly: true;
    higherNumericEnabledCohortPriorityWins: true;
    cohortPolicyOverridesGlobalAsWholePolicy: true;
    nullCohortTargetExplicitlyDisablesThatClock: true;
    traceExplainsObservedWorkflowConfigurationOnly: true;
    operatorLabelsAreNotAuthenticatedIdentities: true;
  };
  scheduling: {
    policyStatus: "NOT_AUTHORIZED_UNCALIBRATED";
  };
  boundaries: {
    historicalResolutionDoesNotAuthorizeAction: true;
    automaticCohortAssignmentApplied: false;
    automaticRoutingApplied: false;
    automaticEscalationApplied: false;
    automaticNotificationApplied: false;
    automaticCollectionApplied: false;
    effectivePolicyMutated: false;
    auditStateMutated: false;
    sourceClassificationInferred: false;
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
