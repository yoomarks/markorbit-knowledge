import {
  SOURCE_INTELLIGENCE_REVIEW_OWNERSHIP_PROTOCOL_VERSION,
  type SourceIntelligenceObservationOwnershipEventV2,
  type SourceIntelligenceObservationOwnershipQueueV2,
  type SourceIntelligenceObservationOwnershipRecordV2,
  type SourceIntelligenceObservationReviewQueueItemV2,
  type SourceIntelligenceObservationReviewQueueV2,
  type SourceIntelligenceOperatorWorkloadV2,
} from "@markorbit/contracts";

function ownershipMatchesItem(
  ownership: SourceIntelligenceObservationOwnershipRecordV2,
  item: SourceIntelligenceObservationReviewQueueItemV2,
): boolean {
  return (
    ownership.observationKey === item.observationKey &&
    ownership.sourceId === item.sourceId &&
    ownership.flagKind === item.flag.kind
  );
}

function workloadFor(
  operator: string,
  items: SourceIntelligenceObservationOwnershipQueueV2["items"],
): SourceIntelligenceOperatorWorkloadV2 {
  const owned = items.filter((item) => item.owner === operator);
  const pending = owned.filter((item) => item.status === "PENDING");
  const oldestPendingObservedAt = pending
    .map((item) => item.flag.observedAt)
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0];
  return {
    operator,
    itemCount: owned.length,
    pendingCount: pending.length,
    acknowledgedCount: owned.filter((item) => item.status === "ACKNOWLEDGED").length,
    ignoredCount: owned.filter((item) => item.status === "IGNORED").length,
    attentionCount: owned.filter((item) => item.flag.severity === "ATTENTION").length,
    oldestPendingObservedAt: oldestPendingObservedAt ?? null,
  };
}

export function buildSourceIntelligenceObservationOwnershipQueueV2(input: {
  queue: SourceIntelligenceObservationReviewQueueV2;
  ownership: SourceIntelligenceObservationOwnershipRecordV2[];
  ownershipEvents?: SourceIntelligenceObservationOwnershipEventV2[];
}): SourceIntelligenceObservationOwnershipQueueV2 {
  const ownershipByKey = new Map(input.ownership.map((record) => [record.observationKey, record]));
  const items = input.queue.items.map((item) => {
    const candidate = ownershipByKey.get(item.observationKey);
    const ownership = candidate && ownershipMatchesItem(candidate, item) ? candidate : null;
    return {
      ...item,
      owner: ownership?.owner ?? null,
      ownership,
    };
  });
  const operators = [...new Set(items.flatMap((item) => (item.owner ? [item.owner] : [])))].sort(
    (left, right) => left.localeCompare(right),
  );
  const workloads = operators.map((operator) => workloadFor(operator, items));
  const assigned = items.filter((item) => item.owner !== null);
  const unassigned = items.filter((item) => item.owner === null);

  return {
    protocolVersion: SOURCE_INTELLIGENCE_REVIEW_OWNERSHIP_PROTOCOL_VERSION,
    objectType: "SOURCE_INTELLIGENCE_OBSERVATION_OWNERSHIP_QUEUE",
    sourceCount: input.queue.sourceCount,
    itemCount: items.length,
    counts: {
      assigned: assigned.length,
      unassigned: unassigned.length,
      assignedPending: assigned.filter((item) => item.status === "PENDING").length,
      unassignedPending: unassigned.filter((item) => item.status === "PENDING").length,
    },
    workloads,
    items,
    recentOwnershipEvents: [...(input.ownershipEvents ?? [])]
      .sort((left, right) => {
        const time = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
        return time !== 0 ? time : right.eventId.localeCompare(left.eventId);
      })
      .slice(0, 100),
    semantics: {
      input: "CURRENT_D2_9_REVIEW_QUEUE",
      ownershipScope: "EXACT_OBSERVATION_OCCURRENCE",
      ownerIsWorkflowLabelNotAuthenticatedIdentity: true,
      newObservationOccurrenceStartsUnassigned: true,
      ownershipIndependentFromReviewDisposition: true,
      handoffDoesNotMutateObservationEvidence: true,
      personalViewRequiresExplicitOperatorLabel: true,
    },
    scheduling: {
      policyStatus: "NOT_AUTHORIZED_UNCALIBRATED",
    },
    boundaries: {
      ownershipDoesNotAuthorizeAction: true,
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
