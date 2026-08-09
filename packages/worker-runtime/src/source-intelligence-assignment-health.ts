import {
  SOURCE_INTELLIGENCE_ASSIGNMENT_HEALTH_PROTOCOL_VERSION,
  type SourceIntelligenceAssignmentAgeBucketsV2,
  type SourceIntelligenceAssignmentHealthAndCapacityV2,
  type SourceIntelligenceAssignmentOperatorCapacityV2,
  type SourceIntelligenceObservationOwnershipEventV2,
  type SourceIntelligenceObservationOwnershipQueueV2,
} from "@markorbit/contracts";

const HOUR_MS = 60 * 60 * 1000;
const DAY_HOURS = 24;
const THREE_DAY_HOURS = 72;
const SEVEN_DAY_HOURS = 168;
const OLDEST_UNASSIGNED_LIMIT = 20;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function ageHours(start: string, end: string): number {
  const difference = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(difference)) return 0;
  return round(Math.max(0, difference / HOUR_MS));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return round(sorted[midpoint]!);
  return round((sorted[midpoint - 1]! + sorted[midpoint]!) / 2);
}

function percentile90(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * 0.9) - 1);
  return round(sorted[index]!);
}

function bucketAges(values: number[]): SourceIntelligenceAssignmentAgeBucketsV2 {
  const buckets: SourceIntelligenceAssignmentAgeBucketsV2 = {
    under24Hours: 0,
    from24To72Hours: 0,
    from72HoursTo7Days: 0,
    atLeast7Days: 0,
  };
  for (const value of values) {
    if (value < DAY_HOURS) buckets.under24Hours += 1;
    else if (value < THREE_DAY_HOURS) buckets.from24To72Hours += 1;
    else if (value < SEVEN_DAY_HOURS) buckets.from72HoursTo7Days += 1;
    else buckets.atLeast7Days += 1;
  }
  return buckets;
}

function earliestIso(values: Array<string | null | undefined>): string | null {
  const present = values.filter((value): value is string => Boolean(value));
  if (present.length === 0) return null;
  return [...present].sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null;
}

function eventCountsForOperator(
  operator: string,
  events: SourceIntelligenceObservationOwnershipEventV2[],
): Pick<
  SourceIntelligenceAssignmentOperatorCapacityV2,
  "claimEventCount" | "transferInEventCount" | "transferOutEventCount" | "releaseEventCount"
> {
  return {
    claimEventCount: events.filter(
      (event) => event.action === "CLAIMED" && event.owner === operator,
    ).length,
    transferInEventCount: events.filter(
      (event) => event.action === "TRANSFERRED" && event.owner === operator,
    ).length,
    transferOutEventCount: events.filter(
      (event) => event.action === "TRANSFERRED" && event.previousOwner === operator,
    ).length,
    releaseEventCount: events.filter(
      (event) => event.action === "RELEASED" && event.previousOwner === operator,
    ).length,
  };
}

export function buildSourceIntelligenceAssignmentHealthAndCapacityV2(input: {
  ownershipQueue: SourceIntelligenceObservationOwnershipQueueV2;
  ownershipEvents: SourceIntelligenceObservationOwnershipEventV2[];
  generatedAt: string;
}): SourceIntelligenceAssignmentHealthAndCapacityV2 {
  const items = input.ownershipQueue.items;
  const pendingItems = items.filter((item) => item.status === "PENDING");
  const unassignedItems = items.filter((item) => item.owner === null);
  const unassignedPending = unassignedItems.filter((item) => item.status === "PENDING");
  const unassignedPendingWithAge = unassignedPending.map((item) => ({
    item,
    ageHours: ageHours(item.flag.observedAt, input.generatedAt),
  }));
  const oldestPendingObservedAt = earliestIso(
    unassignedPending.map((item) => item.flag.observedAt),
  );

  const assignedItems = items.filter((item) => item.owner !== null);
  const assignmentAges = assignedItems.flatMap((item) => {
    const assignedAt = item.ownership?.assignedAt;
    return assignedAt ? [ageHours(assignedAt, input.generatedAt)] : [];
  });
  const oldestAssignedAt = earliestIso(assignedItems.map((item) => item.ownership?.assignedAt));

  const firstClaimByKey = new Map<string, SourceIntelligenceObservationOwnershipEventV2>();
  for (const event of [...input.ownershipEvents].sort(
    (left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt),
  )) {
    if (event.action === "CLAIMED" && !firstClaimByKey.has(event.observationKey)) {
      firstClaimByKey.set(event.observationKey, event);
    }
  }
  const firstClaimLatencies = items.flatMap((item) => {
    const firstClaim = firstClaimByKey.get(item.observationKey);
    if (!firstClaim) return [];
    return [ageHours(item.flag.observedAt, firstClaim.occurredAt)];
  });

  const operators = [...new Set(assignedItems.flatMap((item) => (item.owner ? [item.owner] : [])))];
  const operatorRows: SourceIntelligenceAssignmentOperatorCapacityV2[] = operators.map(
    (operator) => {
      const owned = assignedItems.filter((item) => item.owner === operator);
      const pending = owned.filter((item) => item.status === "PENDING");
      const oldestPending = earliestIso(pending.map((item) => item.flag.observedAt));
      const oldestAssignment = earliestIso(owned.map((item) => item.ownership?.assignedAt));
      return {
        operator,
        assignedItemCount: owned.length,
        pendingCount: pending.length,
        acknowledgedCount: owned.filter((item) => item.status === "ACKNOWLEDGED").length,
        ignoredCount: owned.filter((item) => item.status === "IGNORED").length,
        attentionPendingCount: pending.filter((item) => item.flag.severity === "ATTENTION").length,
        oldestPendingObservedAt: oldestPending,
        oldestPendingAgeHours: oldestPending ? ageHours(oldestPending, input.generatedAt) : null,
        oldestCurrentAssignmentAt: oldestAssignment,
        oldestCurrentAssignmentAgeHours: oldestAssignment
          ? ageHours(oldestAssignment, input.generatedAt)
          : null,
        ...eventCountsForOperator(operator, input.ownershipEvents),
      };
    },
  );
  operatorRows.sort((left, right) => {
    const pending = right.pendingCount - left.pendingCount;
    if (pending !== 0) return pending;
    const age = (right.oldestPendingAgeHours ?? -1) - (left.oldestPendingAgeHours ?? -1);
    if (age !== 0) return age;
    return left.operator.localeCompare(right.operator);
  });

  const pendingCounts = operatorRows.map((operator) => operator.pendingCount);
  const assignedPendingCount = pendingItems.filter((item) => item.owner !== null).length;
  const meanPending =
    pendingCounts.length > 0
      ? pendingCounts.reduce((sum, value) => sum + value, 0) / pendingCounts.length
      : null;
  const maxPending = pendingCounts.length > 0 ? Math.max(...pendingCounts) : null;
  const minPending = pendingCounts.length > 0 ? Math.min(...pendingCounts) : null;
  const coefficientOfVariation =
    meanPending && meanPending > 0
      ? round(
          Math.sqrt(
            pendingCounts.reduce((sum, value) => sum + (value - meanPending) ** 2, 0) /
              pendingCounts.length,
          ) / meanPending,
        )
      : null;

  return {
    protocolVersion: SOURCE_INTELLIGENCE_ASSIGNMENT_HEALTH_PROTOCOL_VERSION,
    objectType: "SOURCE_INTELLIGENCE_ASSIGNMENT_HEALTH_AND_CAPACITY",
    generatedAt: input.generatedAt,
    sourceCount: input.ownershipQueue.sourceCount,
    currentItemCount: items.length,
    unassignedBacklog: {
      itemCount: unassignedItems.length,
      pendingCount: unassignedPending.length,
      attentionPendingCount: unassignedPending.filter((item) => item.flag.severity === "ATTENTION")
        .length,
      oldestPendingObservedAt,
      oldestPendingAgeHours: oldestPendingObservedAt
        ? ageHours(oldestPendingObservedAt, input.generatedAt)
        : null,
      ageBuckets: bucketAges(unassignedPendingWithAge.map((entry) => entry.ageHours)),
      oldestItems: unassignedPendingWithAge
        .sort((left, right) => {
          const age = right.ageHours - left.ageHours;
          if (age !== 0) return age;
          const source = left.item.sourceId.localeCompare(right.item.sourceId);
          return source !== 0
            ? source
            : left.item.observationKey.localeCompare(right.item.observationKey);
        })
        .slice(0, OLDEST_UNASSIGNED_LIMIT)
        .map(({ item, ageHours: itemAgeHours }) => ({
          observationKey: item.observationKey,
          sourceId: item.sourceId,
          flagKind: item.flag.kind,
          severity: item.flag.severity,
          observedAt: item.flag.observedAt,
          ageHours: itemAgeHours,
        })),
    },
    assignmentTenure: {
      assignedItemCount: assignedItems.length,
      oldestAssignedAt,
      oldestAssignmentAgeHours: oldestAssignedAt
        ? ageHours(oldestAssignedAt, input.generatedAt)
        : null,
      medianAssignmentAgeHours: median(assignmentAges),
    },
    firstClaimLatency: {
      sampledCurrentOccurrenceCount: firstClaimLatencies.length,
      medianHours: median(firstClaimLatencies),
      p90Hours: percentile90(firstClaimLatencies),
    },
    handoffs: {
      visibleEventCount: input.ownershipEvents.length,
      claimCount: input.ownershipEvents.filter((event) => event.action === "CLAIMED").length,
      transferCount: input.ownershipEvents.filter((event) => event.action === "TRANSFERRED").length,
      releaseCount: input.ownershipEvents.filter((event) => event.action === "RELEASED").length,
    },
    workloadShape: {
      operatorCount: operatorRows.length,
      assignedPendingCount,
      minPendingPerOperator: minPending,
      maxPendingPerOperator: maxPending,
      meanPendingPerOperator: meanPending === null ? null : round(meanPending),
      medianPendingPerOperator: median(pendingCounts),
      pendingSpread:
        minPending === null || maxPending === null ? null : round(maxPending - minPending),
      maxPendingShare:
        maxPending === null || assignedPendingCount === 0
          ? null
          : round(maxPending / assignedPendingCount),
      coefficientOfVariation,
    },
    operators: operatorRows,
    semantics: {
      input: "CURRENT_D2_11_OWNERSHIP_QUEUE",
      ownershipEventInput: "BOUNDED_PERSISTED_OWNERSHIP_EVENTS",
      unassignedAgeIsWorkflowAgeNotEvidenceFreshness: true,
      assignmentTenureResetsOnClaimOrTransfer: true,
      firstClaimLatencyScope: "CURRENT_OCCURRENCES_WITH_VISIBLE_FIRST_CLAIM_EVENT",
      capacityMetricsRepresentObservedWorkloadNotStaffingCapacity: true,
      imbalanceMetricsAreDescriptiveNotRoutingPolicy: true,
      ownerLabelsAreNotAuthenticatedIdentities: true,
      eventWindowMayBeIncomplete: true,
    },
    scheduling: {
      policyStatus: "NOT_AUTHORIZED_UNCALIBRATED",
    },
    boundaries: {
      assignmentHealthDoesNotAuthorizeAction: true,
      automaticAssignmentApplied: false,
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
