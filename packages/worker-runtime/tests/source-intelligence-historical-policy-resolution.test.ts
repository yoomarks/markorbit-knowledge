import { describe, expect, it } from "vitest";
import type {
  SourceIntelligencePolicyAuditEventV2,
  SourceIntelligencePolicyResolutionCheckpointV2,
} from "@markorbit/contracts";
import { buildSourceIntelligenceHistoricalPolicyResolutionV2 } from "../src/source-intelligence-historical-policy-resolution";

const cohortId = "sic_11111111111111111111111111111111";
const checkpoint: SourceIntelligencePolicyResolutionCheckpointV2 = {
  protocolVersion: "2.0",
  checkpointId: "source-intelligence-policy-resolution-baseline",
  checkpointAt: "2026-08-09T03:00:00.000Z",
  globalPolicy: {
    claimTargetHours: 24,
    reviewTargetHours: 48,
    updatedBy: "ops",
    updatedAt: "2026-08-09T02:00:00.000Z",
  },
  cohorts: [
    {
      cohortId,
      name: "Primary",
      priority: 100,
      enabled: true,
      claimTargetHours: 4,
      reviewTargetHours: 12,
      updatedBy: "ops",
      updatedAt: "2026-08-09T02:10:00.000Z",
    },
  ],
  memberships: [
    { cohortId, sourceId: "src_a", addedBy: "ops", addedAt: "2026-08-09T02:20:00.000Z" },
  ],
};

function event(
  partial: Partial<SourceIntelligencePolicyAuditEventV2>,
): SourceIntelligencePolicyAuditEventV2 {
  return {
    eventId: "sima_default",
    scope: "MEMBERSHIP",
    action: "MEMBERSHIP_REMOVED",
    actorLabel: "ops-2",
    occurredAt: "2026-08-09T04:00:00.000Z",
    policyId: null,
    cohortId,
    sourceId: "src_a",
    changes: [{ field: "membershipPresent", before: true, after: false }],
    historicalCompleteness: "EVENT_SOURCED",
    ...partial,
  };
}

describe("D2.17 historical policy resolution", () => {
  it("strictly replays post-checkpoint changes and falls back to Global", () => {
    const result = buildSourceIntelligenceHistoricalPolicyResolutionV2({
      sourceIds: ["src_a"],
      asOf: "2026-08-09T04:30:00.000Z",
      checkpoint,
      globalPolicyEvents: [],
      cohortEvents: [],
      membershipEvents: [event({})],
      generatedAt: "2026-08-09T05:00:00.000Z",
    });
    const item = result.items[0]!;
    expect(item.status).toBe("RESOLVED");
    expect(item.resolvedPolicy?.scope).toBe("GLOBAL");
    expect(item.resolvedPolicy?.claimTargetHours).toBe(24);
    expect(item.trace.some((step) => step.kind === "CHECKPOINT_BASELINE")).toBe(true);
    expect(result.boundaries.historicalResolutionDoesNotAuthorizeAction).toBe(true);
  });

  it("never claims complete coverage before the checkpoint", () => {
    const oldEvent = event({
      eventId: "sima_old",
      action: "SNAPSHOT_BACKFILL",
      occurredAt: "2026-08-08T20:00:00.000Z",
      changes: [{ field: "membershipPresent", before: null, after: true }],
      historicalCompleteness: "SNAPSHOT_BACKFILL",
    });
    const result = buildSourceIntelligenceHistoricalPolicyResolutionV2({
      sourceIds: ["src_a"],
      asOf: "2026-08-08T23:00:00.000Z",
      checkpoint,
      globalPolicyEvents: [],
      cohortEvents: [],
      membershipEvents: [oldEvent],
      generatedAt: "2026-08-09T05:00:00.000Z",
    });
    const item = result.items[0]!;
    expect(item.status).toBe("PARTIAL");
    expect(item.resolvedPolicy).toBeNull();
    expect(item.snapshotBackfillEventIds).toEqual(["sima_old"]);
    expect(item.unknownReasons.join(" ")).toContain(
      "before the immutable D2.17 coverage checkpoint",
    );
  });

  it("marks an equal-timestamp checkpoint mutation UNKNOWN instead of guessing order", () => {
    const result = buildSourceIntelligenceHistoricalPolicyResolutionV2({
      sourceIds: ["src_a"],
      asOf: "2026-08-09T03:30:00.000Z",
      checkpoint,
      globalPolicyEvents: [],
      cohortEvents: [],
      membershipEvents: [event({ occurredAt: checkpoint.checkpointAt })],
      generatedAt: "2026-08-09T05:00:00.000Z",
    });
    expect(result.items[0]?.status).toBe("UNKNOWN");
    expect(result.items[0]?.completeness).toBe("AMBIGUOUS_CHECKPOINT_BOUNDARY");
  });

  it("isolates same-timestamp ambiguity to the Source whose direct membership changed", () => {
    const result = buildSourceIntelligenceHistoricalPolicyResolutionV2({
      sourceIds: ["src_a", "src_b"],
      asOf: "2026-08-09T04:30:00.000Z",
      checkpoint,
      globalPolicyEvents: [],
      cohortEvents: [],
      membershipEvents: [
        event({ eventId: "sima_a", occurredAt: "2026-08-09T04:00:00.000Z" }),
        event({
          eventId: "sima_b",
          action: "MEMBERSHIP_ADDED",
          occurredAt: "2026-08-09T04:00:00.000Z",
          changes: [{ field: "membershipPresent", before: false, after: true }],
        }),
      ],
      generatedAt: "2026-08-09T05:00:00.000Z",
    });
    expect(result.items.find((item) => item.sourceId === "src_a")?.status).toBe("UNKNOWN");
    expect(result.items.find((item) => item.sourceId === "src_b")?.status).toBe("RESOLVED");
  });

  it("returns UNKNOWN for ambiguous same-timestamp mutations", () => {
    const result = buildSourceIntelligenceHistoricalPolicyResolutionV2({
      sourceIds: ["src_a"],
      asOf: "2026-08-09T04:30:00.000Z",
      checkpoint,
      globalPolicyEvents: [],
      cohortEvents: [],
      membershipEvents: [
        event({ eventId: "sima_a", occurredAt: "2026-08-09T04:00:00.000Z" }),
        event({
          eventId: "sima_b",
          action: "MEMBERSHIP_ADDED",
          occurredAt: "2026-08-09T04:00:00.000Z",
          changes: [{ field: "membershipPresent", before: false, after: true }],
        }),
      ],
      generatedAt: "2026-08-09T05:00:00.000Z",
    });
    expect(result.items[0]?.status).toBe("UNKNOWN");
    expect(result.items[0]?.completeness).toBe("AMBIGUOUS_SAME_TIMESTAMP");
    expect(result.items[0]?.resolvedPolicy).toBeNull();
  });
});
