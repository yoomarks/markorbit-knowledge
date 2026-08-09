import {
  SOURCE_INTELLIGENCE_HISTORICAL_POLICY_RESOLUTION_PROTOCOL_VERSION,
  SOURCE_INTELLIGENCE_MANUAL_SLA_POLICY_ID,
  SOURCE_INTELLIGENCE_MANUAL_SLA_PROTOCOL_VERSION,
  type SourceIntelligenceHistoricalEffectivePolicyV2,
  type SourceIntelligenceHistoricalPolicyResolutionItemV2,
  type SourceIntelligenceHistoricalPolicyResolutionV2,
  type SourceIntelligenceHistoricalPolicyTraceStepV2,
  type SourceIntelligenceManualSlaPolicyV2,
  type SourceIntelligencePolicyAuditEventV2,
  type SourceIntelligencePolicyCohortMembershipV2,
  type SourceIntelligencePolicyCohortV2,
  type SourceIntelligencePolicyResolutionCheckpointV2,
} from "@markorbit/contracts";
import { buildSourceIntelligencePolicyScopeAndCohortsV2 } from "./source-intelligence-policy-scope";

const MAX_REPLAY_EVENTS_PER_STREAM = 5000;

type ReplayState = {
  globalPolicy: SourceIntelligenceManualSlaPolicyV2 | null;
  cohorts: Map<string, SourceIntelligencePolicyCohortV2>;
  memberships: Map<string, SourceIntelligencePolicyCohortMembershipV2>;
};

function rawCompare(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function chronological(
  left: SourceIntelligencePolicyAuditEventV2,
  right: SourceIntelligencePolicyAuditEventV2,
): number {
  const time = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
  return time !== 0 ? time : rawCompare(left.eventId, right.eventId);
}

function membershipKey(cohortId: string, sourceId: string): string {
  return `${cohortId}\u0000${sourceId}`;
}

function checkpointState(checkpoint: SourceIntelligencePolicyResolutionCheckpointV2): ReplayState {
  return {
    globalPolicy: checkpoint.globalPolicy
      ? {
          protocolVersion: SOURCE_INTELLIGENCE_MANUAL_SLA_PROTOCOL_VERSION,
          policyId: SOURCE_INTELLIGENCE_MANUAL_SLA_POLICY_ID,
          claimTargetHours: checkpoint.globalPolicy.claimTargetHours,
          reviewTargetHours: checkpoint.globalPolicy.reviewTargetHours,
          updatedBy: checkpoint.globalPolicy.updatedBy,
          updatedAt: checkpoint.globalPolicy.updatedAt,
        }
      : null,
    cohorts: new Map(checkpoint.cohorts.map((cohort) => [cohort.cohortId, { ...cohort }])),
    memberships: new Map(
      checkpoint.memberships.map((membership) => [
        membershipKey(membership.cohortId, membership.sourceId),
        { ...membership },
      ]),
    ),
  };
}

function emptyState(): ReplayState {
  return { globalPolicy: null, cohorts: new Map(), memberships: new Map() };
}

function changeValue(event: SourceIntelligencePolicyAuditEventV2, field: string) {
  return event.changes.find((change) => change.field === field)?.after;
}

function applyEvent(state: ReplayState, event: SourceIntelligencePolicyAuditEventV2): void {
  if (event.scope === "GLOBAL_POLICY") {
    const existing = state.globalPolicy;
    const claim = changeValue(event, "claimTargetHours");
    const review = changeValue(event, "reviewTargetHours");
    state.globalPolicy = {
      protocolVersion: SOURCE_INTELLIGENCE_MANUAL_SLA_PROTOCOL_VERSION,
      policyId: SOURCE_INTELLIGENCE_MANUAL_SLA_POLICY_ID,
      claimTargetHours:
        claim === undefined ? (existing?.claimTargetHours ?? null) : (claim as number | null),
      reviewTargetHours:
        review === undefined ? (existing?.reviewTargetHours ?? null) : (review as number | null),
      updatedBy: event.actorLabel,
      updatedAt: event.occurredAt,
    };
    return;
  }

  if (event.scope === "COHORT" && event.cohortId) {
    const existing = state.cohorts.get(event.cohortId);
    const get = <T>(field: string, fallback: T): T => {
      const value = changeValue(event, field);
      return (value === undefined ? fallback : value) as T;
    };
    state.cohorts.set(event.cohortId, {
      cohortId: event.cohortId,
      name: get("name", existing?.name ?? "Unknown cohort"),
      ...(() => {
        const description = get<string | null>("description", existing?.description ?? null);
        return description ? { description } : {};
      })(),
      priority: get("priority", existing?.priority ?? 0),
      enabled: get("enabled", existing?.enabled ?? false),
      claimTargetHours: get<number | null>("claimTargetHours", existing?.claimTargetHours ?? null),
      reviewTargetHours: get<number | null>(
        "reviewTargetHours",
        existing?.reviewTargetHours ?? null,
      ),
      updatedBy: event.actorLabel,
      updatedAt: event.occurredAt,
    });
    return;
  }

  if (event.scope === "MEMBERSHIP" && event.cohortId && event.sourceId) {
    const key = membershipKey(event.cohortId, event.sourceId);
    const present = changeValue(event, "membershipPresent") === true;
    if (present) {
      state.memberships.set(key, {
        cohortId: event.cohortId,
        sourceId: event.sourceId,
        addedBy: event.actorLabel,
        addedAt: event.occurredAt,
      });
    } else {
      state.memberships.delete(key);
    }
  }
}

function eventIdentity(event: SourceIntelligencePolicyAuditEventV2): string {
  if (event.scope === "GLOBAL_POLICY") return "GLOBAL_POLICY";
  if (event.scope === "COHORT") return `COHORT:${event.cohortId ?? ""}`;
  return `MEMBERSHIP:${event.cohortId ?? ""}:${event.sourceId ?? ""}`;
}

function ambiguousSameTimestamp(events: SourceIntelligencePolicyAuditEventV2[]): boolean {
  const seen = new Set<string>();
  for (const event of events) {
    const key = `${event.occurredAt}\u0000${eventIdentity(event)}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function effectivePolicy(
  sourceId: string,
  state: ReplayState,
  generatedAt: string,
): SourceIntelligenceHistoricalEffectivePolicyV2 {
  const projection = buildSourceIntelligencePolicyScopeAndCohortsV2({
    sourceIds: [sourceId],
    globalPolicy: state.globalPolicy,
    cohorts: [...state.cohorts.values()],
    memberships: [...state.memberships.values()].filter((item) => item.sourceId === sourceId),
    generatedAt,
  });
  const policy = projection.effectivePolicies[0];
  if (!policy) throw new Error(`Missing effective policy projection for ${sourceId}`);
  return policy;
}

function relevantTrace(
  sourceId: string,
  checkpoint: SourceIntelligencePolicyResolutionCheckpointV2,
  events: SourceIntelligencePolicyAuditEventV2[],
  policy: SourceIntelligenceHistoricalEffectivePolicyV2,
  complete: boolean,
): SourceIntelligenceHistoricalPolicyTraceStepV2[] {
  const matched = new Set(policy.matchedCohortIds);
  const steps: SourceIntelligenceHistoricalPolicyTraceStepV2[] = [];
  if (complete) {
    steps.push({
      kind: "CHECKPOINT_BASELINE",
      occurredAt: checkpoint.checkpointAt,
      eventId: null,
      summary: "Immutable D2.17 coverage checkpoint supplied the replay baseline.",
    });
  }
  for (const event of events) {
    if (event.scope === "MEMBERSHIP" && event.sourceId === sourceId) {
      steps.push({
        kind: "MEMBERSHIP_EVENT",
        occurredAt: event.occurredAt,
        eventId: event.eventId,
        summary: `${event.action}: ${event.cohortId ?? "unknown cohort"}`,
      });
    } else if (event.scope === "COHORT" && event.cohortId && matched.has(event.cohortId)) {
      steps.push({
        kind: "COHORT_EVENT",
        occurredAt: event.occurredAt,
        eventId: event.eventId,
        summary: `${event.action}: ${event.cohortId}`,
      });
    } else if (event.scope === "GLOBAL_POLICY" && policy.scope !== "COHORT") {
      steps.push({
        kind: "GLOBAL_EVENT",
        occurredAt: event.occurredAt,
        eventId: event.eventId,
        summary: event.action,
      });
    }
  }
  steps.push({
    kind: "PRECEDENCE",
    occurredAt:
      policy.scope === "COHORT"
        ? (events.at(-1)?.occurredAt ?? checkpoint.checkpointAt)
        : checkpoint.checkpointAt,
    eventId: null,
    summary:
      policy.scope === "COHORT"
        ? `Enabled explicit cohort membership with highest numeric priority wins: ${policy.cohortId}.`
        : policy.scope === "GLOBAL"
          ? "No enabled explicit cohort membership wins; Global policy is the fallback."
          : "No enabled explicit cohort membership and no Global policy were observed.",
  });
  return steps;
}

export function buildSourceIntelligenceHistoricalPolicyResolutionV2(input: {
  sourceIds: string[];
  asOf: string;
  checkpoint: SourceIntelligencePolicyResolutionCheckpointV2;
  globalPolicyEvents: SourceIntelligencePolicyAuditEventV2[];
  cohortEvents: SourceIntelligencePolicyAuditEventV2[];
  membershipEvents: SourceIntelligencePolicyAuditEventV2[];
  generatedAt: string;
}): SourceIntelligenceHistoricalPolicyResolutionV2 {
  const sourceIds = [...new Set(input.sourceIds)].sort(rawCompare);
  const checkpointTime = Date.parse(input.checkpoint.checkpointAt);
  const asOfTime = Date.parse(input.asOf);
  const completeFromCheckpoint = asOfTime >= checkpointTime;
  const rawStreams = [input.globalPolicyEvents, input.cohortEvents, input.membershipEvents];
  const truncated = rawStreams.some((events) => events.length > MAX_REPLAY_EVENTS_PER_STREAM);
  const allEvents = rawStreams
    .flatMap((events) => events.slice(0, MAX_REPLAY_EVENTS_PER_STREAM))
    .filter((event) => {
      const time = Date.parse(event.occurredAt);
      return time <= asOfTime && (!completeFromCheckpoint || time > checkpointTime);
    })
    .sort(chronological);
  const ambiguous = ambiguousSameTimestamp(allEvents);

  const items: SourceIntelligenceHistoricalPolicyResolutionItemV2[] = sourceIds.map((sourceId) => {
    const state = completeFromCheckpoint ? checkpointState(input.checkpoint) : emptyState();
    for (const event of allEvents) applyEvent(state, event);
    const observedPolicy = effectivePolicy(sourceId, state, input.generatedAt);
    const snapshotBackfillEventIds = allEvents
      .filter((event) => event.action === "SNAPSHOT_BACKFILL")
      .map((event) => event.eventId);
    const unknownReasons: string[] = [];
    let status: SourceIntelligenceHistoricalPolicyResolutionItemV2["status"];
    let completeness: SourceIntelligenceHistoricalPolicyResolutionItemV2["completeness"];

    if (truncated) {
      status = "UNKNOWN";
      completeness = "EVENT_WINDOW_TRUNCATED";
      unknownReasons.push(
        `At least one replay stream exceeded ${MAX_REPLAY_EVENTS_PER_STREAM} events; no complete result is claimed.`,
      );
    } else if (ambiguous) {
      status = "UNKNOWN";
      completeness = "AMBIGUOUS_SAME_TIMESTAMP";
      unknownReasons.push(
        "Multiple mutations for the same workflow object share one timestamp; stored event order is insufficient to claim historical state.",
      );
    } else if (completeFromCheckpoint) {
      status = "RESOLVED";
      completeness = "COMPLETE_FROM_CHECKPOINT";
    } else {
      status = "PARTIAL";
      completeness = "PARTIAL_PRE_CHECKPOINT";
      unknownReasons.push(
        "The requested time is before the immutable D2.17 coverage checkpoint; D2.15 events may omit pre-audit deleted memberships or earlier workflow state.",
      );
      if (snapshotBackfillEventIds.length) {
        unknownReasons.push(
          "Snapshot backfill events expose persisted state but explicitly do not reconstruct missing event history.",
        );
      }
    }

    return {
      sourceId,
      asOf: input.asOf,
      status,
      completeness,
      resolvedPolicy: status === "RESOLVED" ? observedPolicy : null,
      observedPolicy,
      trace: relevantTrace(
        sourceId,
        input.checkpoint,
        allEvents,
        observedPolicy,
        completeFromCheckpoint,
      ),
      unknownReasons,
      appliedEventIds: allEvents.map((event) => event.eventId),
      snapshotBackfillEventIds,
    };
  });

  return {
    protocolVersion: SOURCE_INTELLIGENCE_HISTORICAL_POLICY_RESOLUTION_PROTOCOL_VERSION,
    objectType: "SOURCE_INTELLIGENCE_HISTORICAL_POLICY_RESOLUTION",
    generatedAt: input.generatedAt,
    asOf: input.asOf,
    checkpoint: input.checkpoint,
    items,
    counts: {
      sourceCount: items.length,
      resolved: items.filter((item) => item.status === "RESOLVED").length,
      partial: items.filter((item) => item.status === "PARTIAL").length,
      unknown: items.filter((item) => item.status === "UNKNOWN").length,
    },
    semantics: {
      checkpointIsImmutableReadModelCoverageMetadata: true,
      afterCheckpointMayBeStrictlyReplayed: true,
      beforeCheckpointNeverClaimsCompleteHistoricalCoverage: true,
      snapshotBackfillDoesNotReconstructMissingHistory: true,
      policyResolutionUsesExplicitStoredMembershipOnly: true,
      higherNumericEnabledCohortPriorityWins: true,
      cohortPolicyOverridesGlobalAsWholePolicy: true,
      nullCohortTargetExplicitlyDisablesThatClock: true,
      traceExplainsObservedWorkflowConfigurationOnly: true,
      operatorLabelsAreNotAuthenticatedIdentities: true,
    },
    scheduling: { policyStatus: "NOT_AUTHORIZED_UNCALIBRATED" },
    boundaries: {
      historicalResolutionDoesNotAuthorizeAction: true,
      automaticCohortAssignmentApplied: false,
      automaticRoutingApplied: false,
      automaticEscalationApplied: false,
      automaticNotificationApplied: false,
      automaticCollectionApplied: false,
      effectivePolicyMutated: false,
      auditStateMutated: false,
      sourceClassificationInferred: false,
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
