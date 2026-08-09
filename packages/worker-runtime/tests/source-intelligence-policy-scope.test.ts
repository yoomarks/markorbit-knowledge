import { describe, expect, it } from "vitest";
import type {
  SourceIntelligenceManualSlaPolicyV2,
  SourceIntelligencePolicyCohortMembershipV2,
  SourceIntelligencePolicyCohortV2,
} from "@markorbit/contracts";
import { buildSourceIntelligencePolicyScopeAndCohortsV2 } from "../src/source-intelligence-policy-scope";

const globalPolicy: SourceIntelligenceManualSlaPolicyV2 = {
  protocolVersion: "2.0",
  policyId: "source-intelligence-review-workflow",
  claimTargetHours: 24,
  reviewTargetHours: 48,
  updatedBy: "ops-lead",
  updatedAt: "2026-08-09T00:00:00.000Z",
};

const cohorts: SourceIntelligencePolicyCohortV2[] = [
  {
    cohortId: "sic_11111111111111111111111111111111",
    name: "Primary official",
    priority: 100,
    enabled: true,
    claimTargetHours: 4,
    reviewTargetHours: 12,
    updatedBy: "ops-lead",
    updatedAt: "2026-08-09T01:00:00.000Z",
  },
  {
    cohortId: "sic_22222222222222222222222222222222",
    name: "Professional",
    priority: 50,
    enabled: true,
    claimTargetHours: 12,
    reviewTargetHours: 36,
    updatedBy: "ops-lead",
    updatedAt: "2026-08-09T01:05:00.000Z",
  },
  {
    cohortId: "sic_33333333333333333333333333333333",
    name: "Disabled experiment",
    priority: 500,
    enabled: false,
    claimTargetHours: 1,
    reviewTargetHours: 2,
    updatedBy: "ops-lead",
    updatedAt: "2026-08-09T01:10:00.000Z",
  },
  {
    cohortId: "sic_44444444444444444444444444444444",
    name: "Explicitly disabled clocks",
    priority: 75,
    enabled: true,
    claimTargetHours: null,
    reviewTargetHours: null,
    updatedBy: "ops-lead",
    updatedAt: "2026-08-09T01:15:00.000Z",
  },
];

const memberships: SourceIntelligencePolicyCohortMembershipV2[] = [
  {
    cohortId: cohorts[0]!.cohortId,
    sourceId: "src_multi",
    addedBy: "ops-lead",
    addedAt: "2026-08-09T02:00:00.000Z",
  },
  {
    cohortId: cohorts[1]!.cohortId,
    sourceId: "src_multi",
    addedBy: "ops-lead",
    addedAt: "2026-08-09T02:01:00.000Z",
  },
  {
    cohortId: cohorts[2]!.cohortId,
    sourceId: "src_multi",
    addedBy: "ops-lead",
    addedAt: "2026-08-09T02:02:00.000Z",
  },
  {
    cohortId: cohorts[3]!.cohortId,
    sourceId: "src_disabled_clocks",
    addedBy: "ops-lead",
    addedAt: "2026-08-09T02:03:00.000Z",
  },
];

describe("D2.14 policy scope and cohorts", () => {
  it("uses explicit enabled cohort precedence and global fallback", () => {
    const result = buildSourceIntelligencePolicyScopeAndCohortsV2({
      sourceIds: ["src_multi", "src_global", "src_disabled_clocks"],
      globalPolicy,
      cohorts,
      memberships,
      generatedAt: "2026-08-09T03:00:00.000Z",
    });

    expect(
      result.effectivePolicies.find((policy) => policy.sourceId === "src_multi"),
    ).toMatchObject({
      scope: "COHORT",
      cohortId: cohorts[0]!.cohortId,
      priority: 100,
      claimTargetHours: 4,
      reviewTargetHours: 12,
      matchedCohortIds: [cohorts[0]!.cohortId, cohorts[1]!.cohortId],
    });
    expect(
      result.effectivePolicies.find((policy) => policy.sourceId === "src_global"),
    ).toMatchObject({
      scope: "GLOBAL",
      claimTargetHours: 24,
      reviewTargetHours: 48,
    });
    expect(
      result.effectivePolicies.find((policy) => policy.sourceId === "src_disabled_clocks"),
    ).toMatchObject({
      scope: "COHORT",
      cohortId: cohorts[3]!.cohortId,
      claimTargetHours: null,
      reviewTargetHours: null,
    });
    expect(result.counts.multiCohortSourceCount).toBe(1);
    expect(result.semantics.sourceAttributesDoNotInferMembership).toBe(true);
    expect(result.semantics.higherNumericPriorityWins).toBe(true);
    expect(result.boundaries.automaticCohortAssignmentApplied).toBe(false);
    expect(result.boundaries.automaticRoutingApplied).toBe(false);
    expect(result.scheduling.policyStatus).toBe("NOT_AUTHORIZED_UNCALIBRATED");
  });

  it("reports unconfigured sources when neither cohort nor global policy applies", () => {
    const result = buildSourceIntelligencePolicyScopeAndCohortsV2({
      sourceIds: ["src_none"],
      globalPolicy: null,
      cohorts,
      memberships: [],
      generatedAt: "2026-08-09T03:00:00.000Z",
    });
    expect(result.effectivePolicies[0]).toMatchObject({
      sourceId: "src_none",
      scope: "UNCONFIGURED",
      claimTargetHours: null,
      reviewTargetHours: null,
    });
    expect(result.counts.unconfiguredSourceCount).toBe(1);
  });
});
