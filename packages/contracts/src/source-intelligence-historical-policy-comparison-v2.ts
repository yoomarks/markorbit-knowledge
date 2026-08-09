import type {
  SourceIntelligenceHistoricalEffectivePolicyV2,
  SourceIntelligenceHistoricalPolicyResolutionItemV2,
} from "./source-intelligence-historical-policy-resolution-v2";

export const SOURCE_INTELLIGENCE_HISTORICAL_POLICY_COMPARISON_PROTOCOL_VERSION = "2.0" as const;

export type SourceIntelligenceHistoricalPolicyFieldChangeV2 = {
  field:
    | "scope"
    | "cohortId"
    | "cohortName"
    | "priority"
    | "claimTargetHours"
    | "reviewTargetHours"
    | "matchedCohortIds";
  before: string | number | string[] | null;
  after: string | number | string[] | null;
};

export type SourceIntelligenceHistoricalPolicyComparisonItemV2 = {
  sourceId: string;
  from: Pick<
    SourceIntelligenceHistoricalPolicyResolutionItemV2,
    "asOf" | "status" | "completeness" | "resolvedPolicy" | "observedPolicy" | "unknownReasons"
  >;
  to: Pick<
    SourceIntelligenceHistoricalPolicyResolutionItemV2,
    "asOf" | "status" | "completeness" | "resolvedPolicy" | "observedPolicy" | "unknownReasons"
  >;
  status: "RESOLVED" | "PARTIAL" | "UNKNOWN";
  changeStatus: "CHANGED" | "UNCHANGED" | "INDETERMINATE";
  beforePolicy: SourceIntelligenceHistoricalEffectivePolicyV2 | null;
  afterPolicy: SourceIntelligenceHistoricalEffectivePolicyV2 | null;
  fieldChanges: SourceIntelligenceHistoricalPolicyFieldChangeV2[];
  newlyObservedEventIds: string[];
  explanation: string[];
};

export type SourceIntelligenceHistoricalPolicyComparisonV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_HISTORICAL_POLICY_COMPARISON_PROTOCOL_VERSION;
  objectType: "SOURCE_INTELLIGENCE_HISTORICAL_POLICY_COMPARISON";
  generatedAt: string;
  fromAsOf: string;
  toAsOf: string;
  checkpointAt: string;
  items: SourceIntelligenceHistoricalPolicyComparisonItemV2[];
  counts: {
    sourceCount: number;
    changed: number;
    unchanged: number;
    indeterminate: number;
    resolved: number;
    partial: number;
    unknown: number;
  };
  semantics: {
    comparesTwoD217EndpointResolutionsOnly: true;
    endpointCompletenessIsNeverUpgraded: true;
    changedRequiresBothEndpointsResolved: true;
    newlyObservedEventsAreTraceDeltaNotCausalityProof: true;
    sourceMembershipRemainsExplicitStoredOnly: true;
    operatorLabelsAreNotAuthenticatedIdentities: true;
  };
  scheduling: { policyStatus: "NOT_AUTHORIZED_UNCALIBRATED" };
  boundaries: {
    comparisonDoesNotAuthorizeAction: true;
    automaticRollbackApplied: false;
    automaticPolicyApplied: false;
    automaticCohortAssignmentApplied: false;
    automaticRoutingApplied: false;
    automaticEscalationApplied: false;
    automaticNotificationApplied: false;
    automaticCollectionApplied: false;
    sourceClassificationInferred: false;
    operatorIdentityVerified: false;
    permissionsInferred: false;
    legalTruthVerified: false;
    authorityInferred: false;
    crossSourceIdentityResolved: false;
    autoScheduleApplied: false;
    grantsCollectionAuthority: false;
    grantsMgsnQualification: false;
  };
};
