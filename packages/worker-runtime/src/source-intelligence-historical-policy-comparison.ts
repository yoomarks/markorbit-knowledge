import type {
  SourceIntelligenceHistoricalEffectivePolicyV2,
  SourceIntelligenceHistoricalPolicyComparisonItemV2,
  SourceIntelligenceHistoricalPolicyComparisonV2,
  SourceIntelligenceHistoricalPolicyFieldChangeV2,
  SourceIntelligenceHistoricalPolicyResolutionItemV2,
  SourceIntelligenceHistoricalPolicyResolutionV2,
} from "@markorbit/contracts";

const fields = [
  "scope",
  "cohortId",
  "cohortName",
  "priority",
  "claimTargetHours",
  "reviewTargetHours",
  "matchedCohortIds",
] as const;

function value(
  policy: SourceIntelligenceHistoricalEffectivePolicyV2,
  field: (typeof fields)[number],
): string | number | string[] | null {
  return policy[field];
}

function sameValue(left: string | number | string[] | null, right: string | number | string[] | null) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && JSON.stringify(left) === JSON.stringify(right);
  }
  return left === right;
}

function diffPolicies(
  before: SourceIntelligenceHistoricalEffectivePolicyV2,
  after: SourceIntelligenceHistoricalEffectivePolicyV2,
): SourceIntelligenceHistoricalPolicyFieldChangeV2[] {
  const changes: SourceIntelligenceHistoricalPolicyFieldChangeV2[] = [];
  for (const field of fields) {
    const beforeValue = value(before, field);
    const afterValue = value(after, field);
    if (!sameValue(beforeValue, afterValue)) {
      changes.push({ field, before: beforeValue, after: afterValue });
    }
  }
  return changes;
}

function endpoint(item: SourceIntelligenceHistoricalPolicyResolutionItemV2) {
  return {
    asOf: item.asOf,
    status: item.status,
    completeness: item.completeness,
    resolvedPolicy: item.resolvedPolicy,
    observedPolicy: item.observedPolicy,
    unknownReasons: [...item.unknownReasons],
  };
}

function compareItem(
  from: SourceIntelligenceHistoricalPolicyResolutionItemV2,
  to: SourceIntelligenceHistoricalPolicyResolutionItemV2,
): SourceIntelligenceHistoricalPolicyComparisonItemV2 {
  const newlyObservedEventIds = to.appliedEventIds.filter((eventId) => !from.appliedEventIds.includes(eventId));
  if (from.status === "UNKNOWN" || to.status === "UNKNOWN") {
    return {
      sourceId: from.sourceId,
      from: endpoint(from),
      to: endpoint(to),
      status: "UNKNOWN",
      changeStatus: "INDETERMINATE",
      beforePolicy: from.resolvedPolicy ?? from.observedPolicy,
      afterPolicy: to.resolvedPolicy ?? to.observedPolicy,
      fieldChanges: [],
      newlyObservedEventIds,
      explanation: [
        "At least one D2.17 endpoint is UNKNOWN, so D2.18 refuses to determine whether policy changed.",
        ...from.unknownReasons.map((reason) => `From endpoint: ${reason}`),
        ...to.unknownReasons.map((reason) => `To endpoint: ${reason}`),
      ],
    };
  }
  if (from.status !== "RESOLVED" || to.status !== "RESOLVED" || !from.resolvedPolicy || !to.resolvedPolicy) {
    return {
      sourceId: from.sourceId,
      from: endpoint(from),
      to: endpoint(to),
      status: "PARTIAL",
      changeStatus: "INDETERMINATE",
      beforePolicy: from.resolvedPolicy ?? from.observedPolicy,
      afterPolicy: to.resolvedPolicy ?? to.observedPolicy,
      fieldChanges: [],
      newlyObservedEventIds,
      explanation: [
        "At least one D2.17 endpoint is PARTIAL, so observed endpoint policies are shown without claiming a proven change.",
      ],
    };
  }
  const fieldChanges = diffPolicies(from.resolvedPolicy, to.resolvedPolicy);
  const changed = fieldChanges.length > 0;
  return {
    sourceId: from.sourceId,
    from: endpoint(from),
    to: endpoint(to),
    status: "RESOLVED",
    changeStatus: changed ? "CHANGED" : "UNCHANGED",
    beforePolicy: from.resolvedPolicy,
    afterPolicy: to.resolvedPolicy,
    fieldChanges,
    newlyObservedEventIds,
    explanation: changed
      ? [
          `Both D2.17 endpoints are RESOLVED and ${fieldChanges.length} effective policy field${fieldChanges.length === 1 ? "" : "s"} changed.`,
          "Newly observed event ids are trace delta only; they do not prove that an event caused workflow execution.",
        ]
      : ["Both D2.17 endpoints are RESOLVED and their effective policy fields are unchanged."],
  };
}

export function buildSourceIntelligenceHistoricalPolicyComparisonV2(input: {
  from: SourceIntelligenceHistoricalPolicyResolutionV2;
  to: SourceIntelligenceHistoricalPolicyResolutionV2;
  generatedAt: string;
}): SourceIntelligenceHistoricalPolicyComparisonV2 {
  if (Date.parse(input.from.asOf) >= Date.parse(input.to.asOf)) {
    throw new Error("fromAsOf must be earlier than toAsOf");
  }
  if (input.from.checkpoint.checkpointId !== input.to.checkpoint.checkpointId || input.from.checkpoint.checkpointAt !== input.to.checkpoint.checkpointAt) {
    throw new Error("D2.18 endpoints must use the same immutable D2.17 checkpoint");
  }
  const toBySource = new Map(input.to.items.map((item) => [item.sourceId, item]));
  const items = input.from.items.map((fromItem) => {
    const toItem = toBySource.get(fromItem.sourceId);
    if (!toItem) throw new Error(`Missing to endpoint for source ${fromItem.sourceId}`);
    return compareItem(fromItem, toItem);
  });
  if (items.length !== input.to.items.length) throw new Error("D2.18 endpoints must contain identical Source sets");
  return {
    protocolVersion: "2.0",
    objectType: "SOURCE_INTELLIGENCE_HISTORICAL_POLICY_COMPARISON",
    generatedAt: input.generatedAt,
    fromAsOf: input.from.asOf,
    toAsOf: input.to.asOf,
    checkpointAt: input.from.checkpoint.checkpointAt,
    items,
    counts: {
      sourceCount: items.length,
      changed: items.filter((item) => item.changeStatus === "CHANGED").length,
      unchanged: items.filter((item) => item.changeStatus === "UNCHANGED").length,
      indeterminate: items.filter((item) => item.changeStatus === "INDETERMINATE").length,
      resolved: items.filter((item) => item.status === "RESOLVED").length,
      partial: items.filter((item) => item.status === "PARTIAL").length,
      unknown: items.filter((item) => item.status === "UNKNOWN").length,
    },
    semantics: {
      comparesTwoD217EndpointResolutionsOnly: true,
      endpointCompletenessIsNeverUpgraded: true,
      changedRequiresBothEndpointsResolved: true,
      newlyObservedEventsAreTraceDeltaNotCausalityProof: true,
      sourceMembershipRemainsExplicitStoredOnly: true,
      operatorLabelsAreNotAuthenticatedIdentities: true,
    },
    scheduling: { policyStatus: "NOT_AUTHORIZED_UNCALIBRATED" },
    boundaries: {
      comparisonDoesNotAuthorizeAction: true,
      automaticRollbackApplied: false,
      automaticPolicyApplied: false,
      automaticCohortAssignmentApplied: false,
      automaticRoutingApplied: false,
      automaticEscalationApplied: false,
      automaticNotificationApplied: false,
      automaticCollectionApplied: false,
      sourceClassificationInferred: false,
      operatorIdentityVerified: false,
      permissionsInferred: false,
      legalTruthVerified: false,
      authorityInferred: false,
      crossSourceIdentityResolved: false,
      autoScheduleApplied: false,
      grantsCollectionAuthority: false,
      grantsMgsnQualification: false,
    },
  };
}
