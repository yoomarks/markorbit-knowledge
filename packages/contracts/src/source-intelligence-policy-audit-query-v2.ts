import type {
  SourceIntelligencePolicyAuditAction,
  SourceIntelligencePolicyAuditEventV2,
  SourceIntelligencePolicyAuditScope,
} from "./source-intelligence-policy-audit-v2";

export const SOURCE_INTELLIGENCE_POLICY_AUDIT_QUERY_PROTOCOL_VERSION = "2.0" as const;
export const SOURCE_INTELLIGENCE_POLICY_AUDIT_EXPORT_MAX_EVENTS = 5000 as const;

export type SourceIntelligencePolicyAuditCursorV2 = {
  occurredAt: string;
  eventId: string;
};

export type SourceIntelligencePolicyAuditQueryFiltersV2 = {
  scopes: SourceIntelligencePolicyAuditScope[];
  actions: SourceIntelligencePolicyAuditAction[];
  actorLabels: string[];
  sourceIds: string[];
  cohortIds: string[];
  occurredFromInclusive: string | null;
  occurredToExclusive: string | null;
};

export type SourceIntelligencePolicyAuditQueryV2 = SourceIntelligencePolicyAuditQueryFiltersV2 & {
  pageSize: number;
  cursor: string | null;
};

export type SourceIntelligencePolicyAuditQueryResultV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_POLICY_AUDIT_QUERY_PROTOCOL_VERSION;
  objectType: "SOURCE_INTELLIGENCE_POLICY_AUDIT_QUERY_RESULT";
  generatedAt: string;
  query: SourceIntelligencePolicyAuditQueryV2;
  events: SourceIntelligencePolicyAuditEventV2[];
  page: {
    eventCount: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  semantics: {
    filtersMatchStoredAuditFieldsOnly: true;
    sourceFilterDoesNotInferAffectedSources: true;
    actorFilterMatchesRecordedLabelExactly: true;
    occurredFromIsInclusive: true;
    occurredToIsExclusive: true;
    cursorUsesOccurredAtAndEventIdOrdering: true;
    paginationIsReadOnly: true;
    exportUsesSameNormalizedFilters: true;
  };
  scheduling: {
    policyStatus: "NOT_AUTHORIZED_UNCALIBRATED";
  };
  boundaries: {
    queryDoesNotAuthorizeAction: true;
    exportDoesNotAuthorizeAction: true;
    auditStateMutated: false;
    effectivePolicyMutated: false;
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

export type SourceIntelligencePolicyAuditExportV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_POLICY_AUDIT_QUERY_PROTOCOL_VERSION;
  objectType: "SOURCE_INTELLIGENCE_POLICY_AUDIT_EXPORT";
  filters: SourceIntelligencePolicyAuditQueryFiltersV2;
  eventCount: number;
  truncated: boolean;
  maxEvents: typeof SOURCE_INTELLIGENCE_POLICY_AUDIT_EXPORT_MAX_EVENTS;
  events: SourceIntelligencePolicyAuditEventV2[];
  semantics: {
    deterministicForSameStoredEventsAndNormalizedFilters: true;
    generatedAtExcludedFromExportPayload: true;
    newestFirstOrdering: true;
    sourceFilterMatchesEventSourceIdOnly: true;
    actorLabelsAreRecordedWorkflowLabelsNotAuthenticatedIdentities: true;
  };
  scheduling: {
    policyStatus: "NOT_AUTHORIZED_UNCALIBRATED";
  };
  boundaries: SourceIntelligencePolicyAuditQueryResultV2["boundaries"];
};
