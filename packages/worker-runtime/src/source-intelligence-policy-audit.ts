import {
  SOURCE_INTELLIGENCE_POLICY_AUDIT_PROTOCOL_VERSION,
  type SourceIntelligencePolicyAuditEventV2,
  type SourceIntelligencePolicyAuditHistoryV2,
} from "@markorbit/contracts";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(value)));
}

export function buildSourceIntelligencePolicyAuditHistoryV2(input: {
  globalPolicyEvents?: SourceIntelligencePolicyAuditEventV2[];
  cohortEvents?: SourceIntelligencePolicyAuditEventV2[];
  membershipEvents?: SourceIntelligencePolicyAuditEventV2[];
  generatedAt: string;
  limit?: number;
}): SourceIntelligencePolicyAuditHistoryV2 {
  const byId = new Map<string, SourceIntelligencePolicyAuditEventV2>();
  for (const event of [
    ...(input.globalPolicyEvents ?? []),
    ...(input.cohortEvents ?? []),
    ...(input.membershipEvents ?? []),
  ]) {
    byId.set(event.eventId, event);
  }

  const events = [...byId.values()]
    .sort((left, right) => {
      const time = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
      if (time !== 0) return time;
      return right.eventId.localeCompare(left.eventId);
    })
    .slice(0, normalizeLimit(input.limit));

  return {
    protocolVersion: SOURCE_INTELLIGENCE_POLICY_AUDIT_PROTOCOL_VERSION,
    objectType: "SOURCE_INTELLIGENCE_POLICY_AUDIT_HISTORY",
    generatedAt: input.generatedAt,
    eventCount: events.length,
    counts: {
      globalPolicyEvents: events.filter((event) => event.scope === "GLOBAL_POLICY").length,
      cohortEvents: events.filter((event) => event.scope === "COHORT").length,
      membershipEvents: events.filter((event) => event.scope === "MEMBERSHIP").length,
      snapshotBackfills: events.filter(
        (event) => event.historicalCompleteness === "SNAPSHOT_BACKFILL",
      ).length,
    },
    events,
    semantics: {
      appendOnlyWorkflowAudit: true,
      currentSnapshotsMayBeBackfilledOnce: true,
      snapshotBackfillDoesNotReconstructMissingHistory: true,
      actorLabelsAreRecordedWorkflowLabelsNotAuthenticatedIdentities: true,
      changeSetsDescribeWorkflowConfigurationOnly: true,
      historyDoesNotChangeEffectivePolicyPrecedence: true,
      historyDoesNotMutateReviewDispositionOrOwnership: true,
      historyDoesNotChangeEvidenceMaturityOrSourceValue: true,
    },
    scheduling: {
      policyStatus: "NOT_AUTHORIZED_UNCALIBRATED",
    },
    boundaries: {
      auditDoesNotAuthorizeAction: true,
      automaticCohortAssignmentApplied: false,
      automaticRoutingApplied: false,
      automaticEscalationApplied: false,
      automaticNotificationApplied: false,
      automaticCollectionApplied: false,
      operatorIdentityVerified: false,
      permissionsInferred: false,
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
