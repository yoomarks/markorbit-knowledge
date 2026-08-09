import { describe, expect, it } from "vitest";
import type { SourceIntelligencePolicyAuditEventV2 } from "@markorbit/contracts";
import { buildSourceIntelligencePolicyAuditHistoryV2 } from "../src/source-intelligence-policy-audit";

function event(
  overrides: Partial<SourceIntelligencePolicyAuditEventV2> &
    Pick<SourceIntelligencePolicyAuditEventV2, "eventId" | "scope" | "action" | "occurredAt">,
): SourceIntelligencePolicyAuditEventV2 {
  return {
    actorLabel: "ops-lead",
    policyId: null,
    cohortId: null,
    sourceId: null,
    changes: [],
    historicalCompleteness: "EVENT_SOURCED",
    ...overrides,
  };
}

describe("D2.15 policy audit history", () => {
  it("combines workflow audit sources in deterministic newest-first order", () => {
    const result = buildSourceIntelligencePolicyAuditHistoryV2({
      globalPolicyEvents: [
        event({
          eventId: "sipa_a",
          scope: "GLOBAL_POLICY",
          action: "GLOBAL_POLICY_CHANGED",
          occurredAt: "2026-08-09T01:00:00.000Z",
          policyId: "source-intelligence-review-workflow",
          changes: [{ field: "claimTargetHours", before: 24, after: 12 }],
        }),
      ],
      cohortEvents: [
        event({
          eventId: "sica_b",
          scope: "COHORT",
          action: "COHORT_UPDATED",
          occurredAt: "2026-08-09T03:00:00.000Z",
          cohortId: "sic_11111111111111111111111111111111",
          changes: [{ field: "priority", before: 100, after: 110 }],
        }),
      ],
      membershipEvents: [
        event({
          eventId: "sima_c",
          scope: "MEMBERSHIP",
          action: "MEMBERSHIP_ADDED",
          occurredAt: "2026-08-09T02:00:00.000Z",
          cohortId: "sic_11111111111111111111111111111111",
          sourceId: "src_uspto",
          changes: [{ field: "membershipPresent", before: false, after: true }],
        }),
      ],
      generatedAt: "2026-08-09T04:00:00.000Z",
    });

    expect(result.events.map((item) => item.eventId)).toEqual(["sica_b", "sima_c", "sipa_a"]);
    expect(result.counts).toEqual({
      globalPolicyEvents: 1,
      cohortEvents: 1,
      membershipEvents: 1,
      snapshotBackfills: 0,
    });
    expect(result.eventCount).toBe(3);
  });

  it("marks snapshot coverage honestly and preserves no-automation boundaries", () => {
    const result = buildSourceIntelligencePolicyAuditHistoryV2({
      cohortEvents: [
        event({
          eventId: "sica_backfill",
          scope: "COHORT",
          action: "SNAPSHOT_BACKFILL",
          occurredAt: "2026-08-08T00:00:00.000Z",
          cohortId: "sic_22222222222222222222222222222222",
          historicalCompleteness: "SNAPSHOT_BACKFILL",
          changes: [{ field: "priority", before: null, after: 80 }],
        }),
      ],
      generatedAt: "2026-08-09T04:00:00.000Z",
    });

    expect(result.counts.snapshotBackfills).toBe(1);
    expect(result.semantics.snapshotBackfillDoesNotReconstructMissingHistory).toBe(true);
    expect(result.semantics.actorLabelsAreRecordedWorkflowLabelsNotAuthenticatedIdentities).toBe(
      true,
    );
    expect(result.boundaries.auditDoesNotAuthorizeAction).toBe(true);
    expect(result.boundaries.automaticRoutingApplied).toBe(false);
    expect(result.boundaries.automaticNotificationApplied).toBe(false);
    expect(result.boundaries.automaticCollectionApplied).toBe(false);
    expect(result.scheduling.policyStatus).toBe("NOT_AUTHORIZED_UNCALIBRATED");
  });
});
