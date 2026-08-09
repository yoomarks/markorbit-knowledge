import { describe, expect, it } from "vitest";
import type {
  SourceIntelligenceHistoricalEffectivePolicyV2,
  SourceIntelligenceHistoricalPolicyResolutionItemV2,
  SourceIntelligenceHistoricalPolicyResolutionV2,
} from "@markorbit/contracts";
import { buildSourceIntelligenceHistoricalPolicyComparisonV2 } from "../src/source-intelligence-historical-policy-comparison";

const policy = (claimTargetHours: number): SourceIntelligenceHistoricalEffectivePolicyV2 => ({
  sourceId: "src_uspto",
  scope: "GLOBAL",
  cohortId: null,
  cohortName: null,
  priority: null,
  claimTargetHours,
  reviewTargetHours: 48,
  matchedCohortIds: [],
});

const item = (
  asOf: string,
  status: SourceIntelligenceHistoricalPolicyResolutionItemV2["status"],
  effective: SourceIntelligenceHistoricalEffectivePolicyV2 | null,
  appliedEventIds: string[] = [],
): SourceIntelligenceHistoricalPolicyResolutionItemV2 => ({
  sourceId: "src_uspto",
  asOf,
  status,
  completeness:
    status === "RESOLVED"
      ? "COMPLETE_FROM_CHECKPOINT"
      : status === "PARTIAL"
        ? "PARTIAL_PRE_CHECKPOINT"
        : "AMBIGUOUS_SAME_TIMESTAMP",
  resolvedPolicy: status === "RESOLVED" ? effective : null,
  observedPolicy: effective,
  trace: [],
  unknownReasons: status === "UNKNOWN" ? ["ambiguous history"] : [],
  appliedEventIds,
  snapshotBackfillEventIds: [],
});

const resolution = (
  asOf: string,
  resolutionItem: SourceIntelligenceHistoricalPolicyResolutionItemV2,
): SourceIntelligenceHistoricalPolicyResolutionV2 => ({
  protocolVersion: "2.0",
  objectType: "SOURCE_INTELLIGENCE_HISTORICAL_POLICY_RESOLUTION",
  generatedAt: "2026-08-09T04:00:00.000Z",
  asOf,
  checkpoint: {
    protocolVersion: "2.0",
    checkpointId: "source-intelligence-policy-resolution-baseline",
    checkpointAt: "2026-08-09T01:00:00.000Z",
    globalPolicy: null,
    cohorts: [],
    memberships: [],
  },
  items: [resolutionItem],
  counts: {
    sourceCount: 1,
    resolved: resolutionItem.status === "RESOLVED" ? 1 : 0,
    partial: resolutionItem.status === "PARTIAL" ? 1 : 0,
    unknown: resolutionItem.status === "UNKNOWN" ? 1 : 0,
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
});

describe("D2.18 historical policy comparison", () => {
  it("reports a proven effective policy change only when both endpoints are resolved", () => {
    const from = resolution(
      "2026-08-09T02:00:00.000Z",
      item("2026-08-09T02:00:00.000Z", "RESOLVED", policy(24), ["event-a"]),
    );
    const to = resolution(
      "2026-08-09T03:00:00.000Z",
      item("2026-08-09T03:00:00.000Z", "RESOLVED", policy(12), ["event-a", "event-b"]),
    );
    const result = buildSourceIntelligenceHistoricalPolicyComparisonV2({
      from,
      to,
      generatedAt: "2026-08-09T04:00:00.000Z",
    });
    expect(result.items[0]?.changeStatus).toBe("CHANGED");
    expect(result.items[0]?.fieldChanges).toEqual([
      { field: "claimTargetHours", before: 24, after: 12 },
    ]);
    expect(result.items[0]?.newlyObservedEventIds).toEqual(["event-b"]);
    expect(result.counts.changed).toBe(1);
  });

  it("does not upgrade a partial endpoint into a proven change", () => {
    const from = resolution(
      "2026-08-08T23:00:00.000Z",
      item("2026-08-08T23:00:00.000Z", "PARTIAL", policy(24)),
    );
    const to = resolution(
      "2026-08-09T03:00:00.000Z",
      item("2026-08-09T03:00:00.000Z", "RESOLVED", policy(12)),
    );
    const result = buildSourceIntelligenceHistoricalPolicyComparisonV2({
      from,
      to,
      generatedAt: to.generatedAt,
    });
    expect(result.items[0]).toMatchObject({ status: "PARTIAL", changeStatus: "INDETERMINATE" });
    expect(result.items[0]?.fieldChanges).toEqual([]);
  });

  it("propagates UNKNOWN and rejects reversed ranges", () => {
    const from = resolution(
      "2026-08-09T02:00:00.000Z",
      item("2026-08-09T02:00:00.000Z", "RESOLVED", policy(24)),
    );
    const to = resolution(
      "2026-08-09T03:00:00.000Z",
      item("2026-08-09T03:00:00.000Z", "UNKNOWN", null),
    );
    const result = buildSourceIntelligenceHistoricalPolicyComparisonV2({
      from,
      to,
      generatedAt: to.generatedAt,
    });
    expect(result.items[0]).toMatchObject({ status: "UNKNOWN", changeStatus: "INDETERMINATE" });
    expect(() =>
      buildSourceIntelligenceHistoricalPolicyComparisonV2({
        from: to,
        to: from,
        generatedAt: to.generatedAt,
      }),
    ).toThrow("fromAsOf must be earlier than toAsOf");
  });
});
