import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SqliteSourceIntelligenceManualSlaRepository } from "../src/source-intelligence-manual-sla-registry";
import { SqliteSourceIntelligencePolicyScopeRepository } from "../src/source-intelligence-policy-scope-registry";

describe("D2.16 audit query persistence", () => {
  it("filters Global Policy audit by exact stored actor, action, time, and keyset cursor", () => {
    const database = new DatabaseSync(":memory:");
    const times = [
      new Date("2026-08-09T01:00:00.000Z"),
      new Date("2026-08-09T01:10:00.000Z"),
      new Date("2026-08-09T01:20:00.000Z"),
    ];
    const repository = new SqliteSourceIntelligenceManualSlaRepository(
      database,
      () => times.shift() ?? new Date("2026-08-09T01:30:00.000Z"),
    );
    const first = repository.savePolicy({
      actor: "ops-alpha",
      claimTargetHours: 24,
      reviewTargetHours: 48,
      expectedUpdatedAt: null,
    });
    const second = repository.savePolicy({
      actor: "ops-beta",
      claimTargetHours: 12,
      reviewTargetHours: 36,
      expectedUpdatedAt: first.updatedAt,
    });
    repository.savePolicy({
      actor: "ops-alpha",
      claimTargetHours: 8,
      reviewTargetHours: 24,
      expectedUpdatedAt: second.updatedAt,
    });

    expect(
      repository.listPolicyAuditEvents({
        actorLabels: ["ops-alpha"],
        actions: ["GLOBAL_POLICY_CHANGED"],
        occurredFromInclusive: "2026-08-09T01:05:00.000Z",
        occurredToExclusive: "2026-08-09T01:30:00.000Z",
        limit: 501,
      }),
    ).toHaveLength(1);

    const newest = repository.listPolicyAuditEvents({ limit: 1 })[0];
    expect(newest).toBeDefined();
    const older = repository.listPolicyAuditEvents({
      before: { occurredAt: newest!.occurredAt, eventId: newest!.eventId },
      limit: 10,
    });
    expect(older.map((event) => event.occurredAt)).toEqual([
      "2026-08-09T01:10:00.000Z",
      "2026-08-09T01:00:00.000Z",
    ]);
    database.close();
  });

  it("filters Cohort and Membership audit by exact cohort/source/actor/action and cursor", () => {
    const database = new DatabaseSync(":memory:");
    const times = [
      new Date("2026-08-09T02:00:00.000Z"),
      new Date("2026-08-09T02:10:00.000Z"),
      new Date("2026-08-09T02:20:00.000Z"),
      new Date("2026-08-09T02:30:00.000Z"),
      new Date("2026-08-09T02:40:00.000Z"),
    ];
    const repository = new SqliteSourceIntelligencePolicyScopeRepository(
      database,
      () => times.shift() ?? new Date("2026-08-09T02:50:00.000Z"),
    );
    const cohort = repository.saveCohort({
      name: "Explicit cohort",
      priority: 100,
      enabled: true,
      claimTargetHours: 4,
      reviewTargetHours: 12,
      actor: "ops-alpha",
      expectedUpdatedAt: null,
    });
    repository.saveCohort({
      cohortId: cohort.cohortId,
      name: cohort.name,
      priority: 110,
      enabled: true,
      claimTargetHours: 3,
      reviewTargetHours: 10,
      actor: "ops-beta",
      expectedUpdatedAt: cohort.updatedAt,
    });
    repository.saveMembership({
      cohortId: cohort.cohortId,
      sourceId: "src_uspto",
      action: "ADDED",
      actor: "ops-alpha",
      expectedPresent: false,
    });
    repository.saveMembership({
      cohortId: cohort.cohortId,
      sourceId: "src_wipo",
      action: "ADDED",
      actor: "ops-beta",
      expectedPresent: false,
    });
    repository.saveMembership({
      cohortId: cohort.cohortId,
      sourceId: "src_uspto",
      action: "REMOVED",
      actor: "ops-beta",
      expectedPresent: true,
    });

    const cohortEvents = repository.listCohortAuditEvents({
      cohortIds: [cohort.cohortId],
      actorLabels: ["ops-beta"],
      actions: ["COHORT_UPDATED"],
      limit: 501,
    });
    expect(cohortEvents).toHaveLength(1);
    expect(cohortEvents[0]).toMatchObject({ actorLabel: "ops-beta", action: "COHORT_UPDATED" });

    const uspto = repository.listMembershipAuditEvents({
      sourceIds: ["src_uspto"],
      cohortIds: [cohort.cohortId],
      actorLabels: ["ops-beta"],
      actions: ["MEMBERSHIP_REMOVED"],
      occurredFromInclusive: "2026-08-09T02:30:00.000Z",
      occurredToExclusive: "2026-08-09T02:50:00.000Z",
      limit: 501,
    });
    expect(uspto).toHaveLength(1);
    expect(uspto[0]).toMatchObject({ sourceId: "src_uspto", action: "MEMBERSHIP_REMOVED" });

    const newest = repository.listMembershipAuditEvents({ limit: 1 })[0];
    expect(newest).toBeDefined();
    const older = repository.listMembershipAuditEvents({
      before: { occurredAt: newest!.occurredAt, eventId: newest!.eventId },
      limit: 10,
    });
    expect(older.map((event) => event.sourceId)).toEqual(["src_wipo", "src_uspto"]);
    database.close();
  });
});
