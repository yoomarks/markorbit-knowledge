import {
  SOURCE_INTELLIGENCE_MANUAL_SLA_PROTOCOL_VERSION,
  type SourceIntelligenceEffectivePolicyV2,
  type SourceIntelligenceManualEscalationEventV2,
  type SourceIntelligenceManualEscalationRecordV2,
  type SourceIntelligenceManualSlaAndEscalationV2,
  type SourceIntelligenceManualSlaClockV2,
  type SourceIntelligenceManualSlaItemV2,
  type SourceIntelligenceManualSlaPolicyV2,
  type SourceIntelligenceObservationOwnershipQueueItemV2,
  type SourceIntelligenceObservationOwnershipQueueV2,
} from "@markorbit/contracts";

const HOUR_MS = 60 * 60 * 1000;
const RECENT_EVENT_LIMIT = 100;

type ClockPolicy = {
  claimTargetHours: number | null;
  reviewTargetHours: number | null;
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function elapsedHours(start: string, end: string): number {
  const difference = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(difference)) return 0;
  return round(Math.max(0, difference / HOUR_MS));
}

function timedClock(
  targetHours: number,
  startedAt: string,
  generatedAt: string,
): SourceIntelligenceManualSlaClockV2 {
  const elapsed = elapsedHours(startedAt, generatedAt);
  const overdue = round(Math.max(0, elapsed - targetHours));
  return {
    state: elapsed > targetHours ? "OVER_TARGET" : "WITHIN_TARGET",
    targetHours,
    elapsedHours: elapsed,
    overdueHours: overdue > 0 ? overdue : null,
    startedAt,
  };
}

function disabledClock(): SourceIntelligenceManualSlaClockV2 {
  return {
    state: "DISABLED",
    targetHours: null,
    elapsedHours: null,
    overdueHours: null,
    startedAt: null,
  };
}

function completedClock(targetHours: number): SourceIntelligenceManualSlaClockV2 {
  return {
    state: "COMPLETED",
    targetHours,
    elapsedHours: null,
    overdueHours: null,
    startedAt: null,
  };
}

function notStartedClock(targetHours: number): SourceIntelligenceManualSlaClockV2 {
  return {
    state: "NOT_STARTED",
    targetHours,
    elapsedHours: null,
    overdueHours: null,
    startedAt: null,
  };
}

function claimClock(
  item: SourceIntelligenceObservationOwnershipQueueItemV2,
  policy: ClockPolicy | null,
  generatedAt: string,
): SourceIntelligenceManualSlaClockV2 {
  const target = policy?.claimTargetHours ?? null;
  if (target === null) return disabledClock();
  if (item.status !== "PENDING" || item.owner !== null) return completedClock(target);
  return timedClock(target, item.flag.observedAt, generatedAt);
}

function reviewClock(
  item: SourceIntelligenceObservationOwnershipQueueItemV2,
  policy: ClockPolicy | null,
  generatedAt: string,
): SourceIntelligenceManualSlaClockV2 {
  const target = policy?.reviewTargetHours ?? null;
  if (target === null) return disabledClock();
  if (item.status !== "PENDING") return completedClock(target);
  const assignedAt = item.ownership?.assignedAt ?? null;
  if (item.owner === null || assignedAt === null) return notStartedClock(target);
  return timedClock(target, assignedAt, generatedAt);
}

function escalationMatchesItem(
  escalation: SourceIntelligenceManualEscalationRecordV2,
  item: SourceIntelligenceObservationOwnershipQueueItemV2,
): boolean {
  return (
    escalation.observationKey === item.observationKey &&
    escalation.sourceId === item.sourceId &&
    escalation.flagKind === item.flag.kind
  );
}

function itemPriority(item: SourceIntelligenceManualSlaItemV2): number {
  let score = 0;
  if (item.escalated) score += 1000;
  if (item.claim.state === "OVER_TARGET") score += 300;
  if (item.review.state === "OVER_TARGET") score += 400;
  if (item.severity === "ATTENTION") score += 100;
  return score;
}

export function buildSourceIntelligenceManualSlaAndEscalationV2(input: {
  ownershipQueue: SourceIntelligenceObservationOwnershipQueueV2;
  policy: SourceIntelligenceManualSlaPolicyV2 | null;
  effectivePolicies?: SourceIntelligenceEffectivePolicyV2[];
  escalations: SourceIntelligenceManualEscalationRecordV2[];
  escalationEvents?: SourceIntelligenceManualEscalationEventV2[];
  generatedAt: string;
}): SourceIntelligenceManualSlaAndEscalationV2 {
  const escalationByKey = new Map(
    input.escalations.map((escalation) => [escalation.observationKey, escalation]),
  );
  const effectivePolicyBySourceId = new Map(
    (input.effectivePolicies ?? []).map((policy) => [policy.sourceId, policy]),
  );
  const items: SourceIntelligenceManualSlaItemV2[] = input.ownershipQueue.items.map((item) => {
    const candidate = escalationByKey.get(item.observationKey);
    const escalation = candidate && escalationMatchesItem(candidate, item) ? candidate : null;
    const effectivePolicy = effectivePolicyBySourceId.get(item.sourceId) ?? input.policy;
    return {
      observationKey: item.observationKey,
      sourceId: item.sourceId,
      flagKind: item.flag.kind,
      severity: item.flag.severity,
      reviewStatus: item.status,
      owner: item.owner,
      observedAt: item.flag.observedAt,
      assignedAt: item.ownership?.assignedAt ?? null,
      claim: claimClock(item, effectivePolicy, input.generatedAt),
      review: reviewClock(item, effectivePolicy, input.generatedAt),
      escalated: escalation?.escalated ?? false,
      escalation,
    };
  });

  items.sort((left, right) => {
    const priority = itemPriority(right) - itemPriority(left);
    if (priority !== 0) return priority;
    const leftOverdue = Math.max(left.claim.overdueHours ?? 0, left.review.overdueHours ?? 0);
    const rightOverdue = Math.max(right.claim.overdueHours ?? 0, right.review.overdueHours ?? 0);
    if (rightOverdue !== leftOverdue) return rightOverdue - leftOverdue;
    const observed = Date.parse(left.observedAt) - Date.parse(right.observedAt);
    if (observed !== 0) return observed;
    const source = left.sourceId.localeCompare(right.sourceId);
    return source !== 0 ? source : left.observationKey.localeCompare(right.observationKey);
  });

  const isOverTarget = (item: SourceIntelligenceManualSlaItemV2) =>
    item.claim.state === "OVER_TARGET" || item.review.state === "OVER_TARGET";

  return {
    protocolVersion: SOURCE_INTELLIGENCE_MANUAL_SLA_PROTOCOL_VERSION,
    objectType: "SOURCE_INTELLIGENCE_MANUAL_SLA_AND_ESCALATION",
    generatedAt: input.generatedAt,
    policy: input.policy,
    sourceCount: input.ownershipQueue.sourceCount,
    itemCount: items.length,
    counts: {
      unassignedPending: items.filter(
        (item) => item.reviewStatus === "PENDING" && item.owner === null,
      ).length,
      claimOverTarget: items.filter((item) => item.claim.state === "OVER_TARGET").length,
      reviewOverTarget: items.filter((item) => item.review.state === "OVER_TARGET").length,
      escalated: items.filter((item) => item.escalated).length,
      overTargetAndNotEscalated: items.filter((item) => isOverTarget(item) && !item.escalated)
        .length,
    },
    items,
    recentEscalationEvents: [...(input.escalationEvents ?? [])]
      .sort((left, right) => {
        const time = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
        return time !== 0 ? time : right.eventId.localeCompare(left.eventId);
      })
      .slice(0, RECENT_EVENT_LIMIT),
    semantics: {
      policyConfiguredByHuman: true,
      effectiveTargetsMayBeResolvedByD2_14PolicyScope: true,
      nullTargetDisablesClock: true,
      claimClockScope: "CURRENT_UNASSIGNED_PENDING_OCCURRENCE",
      claimClockStartsAtObservation: true,
      claimClockCompletesWhenAssigned: true,
      reviewClockScope: "CURRENT_OWNER_PENDING_REVIEW",
      reviewClockStartsAtCurrentAssignment: true,
      transferResetsReviewClock: true,
      workflowTargetsAreNotEvidenceFreshness: true,
      workflowTargetsAreNotLegalOrContractualSla: true,
      escalationIsExplicitHumanWorkflowState: true,
      overTargetDoesNotAutoEscalate: true,
      escalationDoesNotMutateReviewDisposition: true,
      escalationDoesNotMutateObservationEvidence: true,
      ownerLabelsAreNotAuthenticatedIdentities: true,
    },
    scheduling: {
      policyStatus: "NOT_AUTHORIZED_UNCALIBRATED",
    },
    boundaries: {
      manualSlaDoesNotAuthorizeAction: true,
      automaticEscalationApplied: false,
      automaticNotificationApplied: false,
      automaticAssignmentApplied: false,
      automaticRemediationApplied: false,
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
