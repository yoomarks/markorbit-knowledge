import {
  SOURCE_INTELLIGENCE_POLICY_SCOPE_PROTOCOL_VERSION,
  type SourceIntelligenceEffectivePolicyV2,
  type SourceIntelligenceManualSlaPolicyV2,
  type SourceIntelligencePolicyCohortMembershipV2,
  type SourceIntelligencePolicyCohortV2,
  type SourceIntelligencePolicyScopeAndCohortsV2,
} from "@markorbit/contracts";

export function buildSourceIntelligencePolicyScopeAndCohortsV2(input: {
  sourceIds: string[];
  globalPolicy: SourceIntelligenceManualSlaPolicyV2 | null;
  cohorts: SourceIntelligencePolicyCohortV2[];
  memberships: SourceIntelligencePolicyCohortMembershipV2[];
  generatedAt: string;
}): SourceIntelligencePolicyScopeAndCohortsV2 {
  const sourceIds = [...new Set(input.sourceIds)].sort((left, right) => left.localeCompare(right));
  const cohortById = new Map(input.cohorts.map((cohort) => [cohort.cohortId, cohort]));
  const membershipsBySource = new Map<string, SourceIntelligencePolicyCohortMembershipV2[]>();
  for (const membership of input.memberships) {
    const current = membershipsBySource.get(membership.sourceId) ?? [];
    current.push(membership);
    membershipsBySource.set(membership.sourceId, current);
  }

  const effectivePolicies: SourceIntelligenceEffectivePolicyV2[] = sourceIds.map((sourceId) => {
    const matched = (membershipsBySource.get(sourceId) ?? [])
      .map((membership) => cohortById.get(membership.cohortId))
      .filter((cohort): cohort is SourceIntelligencePolicyCohortV2 => Boolean(cohort?.enabled))
      .sort((left, right) => {
        const priority = right.priority - left.priority;
        return priority !== 0 ? priority : left.cohortId.localeCompare(right.cohortId);
      });
    const winner = matched[0] ?? null;
    if (winner) {
      return {
        sourceId,
        scope: "COHORT",
        cohortId: winner.cohortId,
        cohortName: winner.name,
        priority: winner.priority,
        claimTargetHours: winner.claimTargetHours,
        reviewTargetHours: winner.reviewTargetHours,
        matchedCohortIds: matched.map((cohort) => cohort.cohortId),
      };
    }
    if (input.globalPolicy) {
      return {
        sourceId,
        scope: "GLOBAL",
        cohortId: null,
        cohortName: null,
        priority: null,
        claimTargetHours: input.globalPolicy.claimTargetHours,
        reviewTargetHours: input.globalPolicy.reviewTargetHours,
        matchedCohortIds: [],
      };
    }
    return {
      sourceId,
      scope: "UNCONFIGURED",
      cohortId: null,
      cohortName: null,
      priority: null,
      claimTargetHours: null,
      reviewTargetHours: null,
      matchedCohortIds: [],
    };
  });

  const cohorts = [...input.cohorts].sort((left, right) => {
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
    const priority = right.priority - left.priority;
    if (priority !== 0) return priority;
    const name = left.name.localeCompare(right.name);
    return name !== 0 ? name : left.cohortId.localeCompare(right.cohortId);
  });
  const memberships = [...input.memberships].sort((left, right) => {
    const source = left.sourceId.localeCompare(right.sourceId);
    return source !== 0 ? source : left.cohortId.localeCompare(right.cohortId);
  });

  return {
    protocolVersion: SOURCE_INTELLIGENCE_POLICY_SCOPE_PROTOCOL_VERSION,
    objectType: "SOURCE_INTELLIGENCE_POLICY_SCOPE_AND_COHORTS",
    generatedAt: input.generatedAt,
    globalPolicy: input.globalPolicy
      ? {
          claimTargetHours: input.globalPolicy.claimTargetHours,
          reviewTargetHours: input.globalPolicy.reviewTargetHours,
          updatedBy: input.globalPolicy.updatedBy,
          updatedAt: input.globalPolicy.updatedAt,
        }
      : null,
    cohorts,
    memberships,
    effectivePolicies,
    counts: {
      sourceCount: sourceIds.length,
      cohortCount: cohorts.length,
      enabledCohortCount: cohorts.filter((cohort) => cohort.enabled).length,
      membershipCount: memberships.length,
      cohortScopedSourceCount: effectivePolicies.filter((policy) => policy.scope === "COHORT")
        .length,
      globalFallbackSourceCount: effectivePolicies.filter((policy) => policy.scope === "GLOBAL")
        .length,
      unconfiguredSourceCount: effectivePolicies.filter((policy) => policy.scope === "UNCONFIGURED")
        .length,
      multiCohortSourceCount: effectivePolicies.filter(
        (policy) => policy.matchedCohortIds.length > 1,
      ).length,
    },
    semantics: {
      cohortMembershipIsExplicitHumanMetadata: true,
      sourceAttributesDoNotInferMembership: true,
      enabledCohortsOnlyParticipateInPrecedence: true,
      higherNumericPriorityWins: true,
      enabledCohortPrioritiesAreUnique: true,
      cohortPolicyOverridesGlobalAsWholePolicy: true,
      nullCohortTargetExplicitlyDisablesThatClock: true,
      globalPolicyIsFallbackOnly: true,
      policyScopeDoesNotChangeEvidenceMaturity: true,
      policyScopeDoesNotChangeSourceValue: true,
      policyScopeDoesNotAuthorizeRoutingOrExecution: true,
    },
    scheduling: { policyStatus: "NOT_AUTHORIZED_UNCALIBRATED" },
    boundaries: {
      automaticCohortAssignmentApplied: false,
      sourceClassificationInferred: false,
      automaticRoutingApplied: false,
      automaticEscalationApplied: false,
      automaticNotificationApplied: false,
      automaticCollectionApplied: false,
      legalTruthVerified: false,
      authorityInferred: false,
      professionalQualityVerified: false,
      crossSourceIdentityResolved: false,
      grantsCollectionAuthority: false,
      grantsMgsnQualification: false,
      operatorIdentityVerified: false,
      permissionsInferred: false,
    },
  };
}
