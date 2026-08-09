import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SqliteSourceIntelligencePolicyScopeRepository } from "../src/source-intelligence-policy-scope-registry";

describe("D2.14 policy scope persistence", () => {
  it("persists cohorts, enforces unique enabled priority, and protects updates", () => {
    const database = new DatabaseSync(":memory:");
    const times = [
      new Date("2026-08-09T01:00:00.000Z"),
      new Date("2026-08-09T01:05:00.000Z"),
      new Date("2026-08-09T01:10:00.000Z"),
    ];
    const repository = new SqliteSourceIntelligencePolicyScopeRepository(
      database,
      () => times.shift() ?? new Date("2026-08-09T01:15:00.000Z"),
    );

    const high = repository.saveCohort({
      name: "Primary official sources",
      priority: 100,
      enabled: true,
      claimTargetHours: 4,
      reviewTargetHours: 12,
      actor: "ops-lead",
      expectedUpdatedAt: null,
    });
    expect(high.cohortId).toMatch(/^sic_[0-9a-f]{32}$/);
    expect(high.priority).toBe(100);

    expect(() =>
      repository.saveCohort({
        name: "Conflicting cohort",
        priority: 100,
        enabled: true,
        claimTargetHours: 8,
        reviewTargetHours: 24,
        actor: "ops-lead",
        expectedUpdatedAt: null,
      }),
    ).toThrow(/priorities must be unique/);

    const updated = repository.saveCohort({
      cohortId: high.cohortId,
      name: "Primary official sources",
      description: "Explicit human cohort",
      priority: 110,
      enabled: true,
      claimTargetHours: 3,
      reviewTargetHours: 10,
      actor: "ops-lead",
      expectedUpdatedAt: high.updatedAt,
    });
    expect(updated.priority).toBe(110);
    expect(() =>
      repository.saveCohort({
        cohortId: high.cohortId,
        name: high.name,
        priority: 120,
        enabled: true,
        claimTargetHours: 2,
        reviewTargetHours: 8,
        actor: "ops-lead",
        expectedUpdatedAt: high.updatedAt,
      }),
    ).toThrow(/changed before this update/);
    database.close();
  });

  it("adds and removes explicit memberships with optimistic concurrency", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteSourceIntelligencePolicyScopeRepository(database);
    const cohort = repository.saveCohort({
      name: "Priority review",
      priority: 50,
      enabled: true,
      claimTargetHours: 12,
      reviewTargetHours: 36,
      actor: "ops-lead",
      expectedUpdatedAt: null,
    });

    const membership = repository.saveMembership({
      cohortId: cohort.cohortId,
      sourceId: "src_uspto",
      action: "ADDED",
      actor: "ops-lead",
      expectedPresent: false,
    });
    expect(membership).toMatchObject({ cohortId: cohort.cohortId, sourceId: "src_uspto" });
    expect(repository.listMemberships({ sourceIds: ["src_uspto"] })).toHaveLength(1);
    expect(() =>
      repository.saveMembership({
        cohortId: cohort.cohortId,
        sourceId: "src_uspto",
        action: "ADDED",
        actor: "ops-lead",
        expectedPresent: false,
      }),
    ).toThrow(/changed before this update/);

    expect(
      repository.saveMembership({
        cohortId: cohort.cohortId,
        sourceId: "src_uspto",
        action: "REMOVED",
        actor: "ops-lead",
        expectedPresent: true,
      }),
    ).toBeNull();
    expect(repository.listMemberships({ sourceIds: ["src_uspto"] })).toHaveLength(0);
    database.close();
  });
});
