import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SqliteSourceIntelligenceManualSlaRepository } from "../src/source-intelligence-manual-sla-registry";

const observationKey = "sir_0123456789abcdef0123456789abcdef";

function escalationBase() {
  return {
    observationKey,
    sourceId: "src_uspto",
    flagKind: "HIGH_VALUE_UNOBSERVED" as const,
    actor: "ops-lead",
  };
}

describe("D2.13 manual SLA persistence", () => {
  it("persists a human policy with optimistic concurrency", () => {
    const database = new DatabaseSync(":memory:");
    const times = [
      new Date("2026-08-09T01:00:00.000Z"),
      new Date("2026-08-09T01:05:00.000Z"),
    ];
    const repository = new SqliteSourceIntelligenceManualSlaRepository(
      database,
      () => times.shift() ?? new Date("2026-08-09T01:10:00.000Z"),
    );
    expect(repository.getPolicy()).toBeNull();

    const first = repository.savePolicy({
      actor: "ops-lead",
      claimTargetHours: 24,
      reviewTargetHours: 48,
      expectedUpdatedAt: null,
    });
    expect(first).toMatchObject({
      policyId: "source-intelligence-review-workflow",
      claimTargetHours: 24,
      reviewTargetHours: 48,
      updatedBy: "ops-lead",
      updatedAt: "2026-08-09T01:00:00.000Z",
    });

    expect(() =>
      repository.savePolicy({
        actor: "ops-lead",
        claimTargetHours: 12,
        reviewTargetHours: 24,
        expectedUpdatedAt: null,
      }),
    ).toThrow(/policy changed/);

    const second = repository.savePolicy({
      actor: "ops-lead",
      claimTargetHours: null,
      reviewTargetHours: 24,
      expectedUpdatedAt: first.updatedAt,
    });
    expect(second.claimTargetHours).toBeNull();
    expect(second.reviewTargetHours).toBe(24);
    database.close();
  });

  it("records explicit escalation and clearing events without automatic state changes", () => {
    const database = new DatabaseSync(":memory:");
    const times = [
      new Date("2026-08-09T02:00:00.000Z"),
      new Date("2026-08-09T02:30:00.000Z"),
    ];
    const repository = new SqliteSourceIntelligenceManualSlaRepository(
      database,
      () => times.shift() ?? new Date("2026-08-09T03:00:00.000Z"),
    );

    const escalated = repository.saveEscalation({
      ...escalationBase(),
      action: "ESCALATED",
      note: "Needs human attention",
      expectedEscalated: false,
    });
    expect(escalated).toMatchObject({
      escalated: true,
      actor: "ops-lead",
      note: "Needs human attention",
    });

    expect(() =>
      repository.saveEscalation({
        ...escalationBase(),
        action: "CLEARED",
        expectedEscalated: false,
      }),
    ).toThrow(/state changed/);

    const cleared = repository.saveEscalation({
      ...escalationBase(),
      action: "CLEARED",
      note: "Reviewed manually",
      expectedEscalated: true,
    });
    expect(cleared.escalated).toBe(false);

    const events = repository.listEscalationEvents({ sourceIds: ["src_uspto"], limit: 10 });
    expect(events.map((event) => event.action)).toEqual(["CLEARED", "ESCALATED"]);
    expect(events[0]).toMatchObject({ previousEscalated: true, escalated: false });
    expect(events[1]).toMatchObject({ previousEscalated: false, escalated: true });
    database.close();
  });
});
