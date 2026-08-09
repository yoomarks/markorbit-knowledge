export const SOURCE_INTELLIGENCE_POLICY_SCOPE_PROTOCOL_VERSION = "2.0" as const;

export type SourceIntelligencePolicyScopeType = "COHORT" | "GLOBAL" | "UNCONFIGURED";

export type SourceIntelligencePolicyCohortV2 = {
  cohortId: string;
  name: string;
  description?: string;
  priority: number;
  enabled: boolean;
  claimTargetHours: number | null;
  reviewTargetHours: number | null;
  updatedBy: string;
  updatedAt: string;
};

export type SourceIntelligencePolicyCohortMembershipV2 = {
  cohortId: string;
  sourceId: string;
  addedBy: string;
  addedAt: string;
};

export type SourceIntelligenceEffectivePolicyV2 = {
  sourceId: string;
  scope: SourceIntelligencePolicyScopeType;
  cohortId: string | null;
  cohortName: string | null;
  priority: number | null;
  claimTargetHours: number | null;
  reviewTargetHours: number | null;
  matchedCohortIds: string[];
};

export type SourceIntelligencePolicyScopeAndCohortsV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_POLICY_SCOPE_PROTOCOL_VERSION;
  objectType: "SOURCE_INTELLIGENCE_POLICY_SCOPE_AND_COHORTS";
  generatedAt: string;
  globalPolicy: {
    claimTargetHours: number | null;
    reviewTargetHours: number | null;
    updatedBy: string;
    updatedAt: string;
  } | null;
  cohorts: SourceIntelligencePolicyCohortV2[];
  memberships: SourceIntelligencePolicyCohortMembershipV2[];
  effectivePolicies: SourceIntelligenceEffectivePolicyV2[];
  counts: {
    sourceCount: number;
    cohortCount: number;
    enabledCohortCount: number;
    membershipCount: number;
    cohortScopedSourceCount: number;
    globalFallbackSourceCount: number;
    unconfiguredSourceCount: number;
    multiCohortSourceCount: number;
  };
  semantics: {
    cohortMembershipIsExplicitHumanMetadata: true;
    sourceAttributesDoNotInferMembership: true;
    enabledCohortsOnlyParticipateInPrecedence: true;
    higherNumericPriorityWins: true;
    enabledCohortPrioritiesAreUnique: true;
    cohortPolicyOverridesGlobalAsWholePolicy: true;
    nullCohortTargetExplicitlyDisablesThatClock: true;
    globalPolicyIsFallbackOnly: true;
    policyScopeDoesNotChangeEvidenceMaturity: true;
    policyScopeDoesNotChangeSourceValue: true;
    policyScopeDoesNotAuthorizeRoutingOrExecution: true;
  };
  scheduling: {
    policyStatus: "NOT_AUTHORIZED_UNCALIBRATED";
  };
  boundaries: {
    automaticCohortAssignmentApplied: false;
    sourceClassificationInferred: false;
    automaticRoutingApplied: false;
    automaticEscalationApplied: false;
    automaticNotificationApplied: false;
    automaticCollectionApplied: false;
    legalTruthVerified: false;
    authorityInferred: false;
    professionalQualityVerified: false;
    crossSourceIdentityResolved: false;
    grantsCollectionAuthority: false;
    grantsMgsnQualification: false;
    operatorIdentityVerified: false;
    permissionsInferred: false;
  };
};

export type SourceIntelligencePolicyCohortMutationV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_POLICY_SCOPE_PROTOCOL_VERSION;
  cohortId?: string;
  name: string;
  description?: string;
  priority: number;
  enabled: boolean;
  claimTargetHours: number | null;
  reviewTargetHours: number | null;
  actor: string;
  expectedUpdatedAt: string | null;
};

export type SourceIntelligencePolicyCohortMembershipMutationV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_POLICY_SCOPE_PROTOCOL_VERSION;
  cohortId: string;
  sourceId: string;
  action: "ADDED" | "REMOVED";
  actor: string;
  expectedPresent: boolean;
};
