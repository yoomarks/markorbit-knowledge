import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SqliteSourceIntelligenceManualSlaRepository } from "../src/source-intelligence-manual-sla-registry";
import { SqliteSourceIntelligencePolicyScopeRepository } from "../src/source-intelligence-policy-scope-registry";

describe("D2.15 policy audit persistence", () => {
  it("appends global, cohort, priority, and membership workflow changes", () => {
    const database = new DatabaseSync(":memory:");
    const times = [
      new Date("2026-08-09T01:00:00.000Z"),
      new Date("2026-08-09T01:05:00.000Z"),
      new Date("2026-08-09T01:10:00.000Z"),
      new Date("2026-08-09T01:15:00.000Z"),
      new Date("2026-08-09T01:20:00.000Z"),
      new Date("2026-08-09T01:25:00.000Z"),
    ];
    const clock = () => times.shift() ?? new Date("2026-08-09T01:30:00.000Z");
    const manual = new SqliteSourceIntelligenceManualSlaRepository(database, clock);
    const scopes = new SqliteSourceIntelligencePolicyScopeRepository(database, clock);

    const initialPolicy = manual.savePolicy({
      actor: "ops-lead",
      claimTargetHours: 24,
      reviewTargetHours: 48,
      expectedUpdatedAt: null,
    });
    manual.savePolicy({
      actor: "ops-manager",
      claimTargetHours: 12,
      reviewTargetHours: 36,
      expectedUpdatedAt: initialPolicy.updatedAt,
    });

    const cohort = scopes.saveCohort({
      name: "Primary official",
      priority: 100,
      enabled: true,
      claimTargetHours: 4,
      reviewTargetHours: 12,
      actor: "ops-lead",
      expectedUpdatedAt: null,
    });
    const updated = scopes.saveCohort({
      cohortId: cohort.cohortId,
      name: cohort.name,
      priority: 110,
      enabled: true,
      claimTargetHours: 3,
      reviewTargetHours: 10,
      actor: "ops-manager",
      expectedUpdatedAt: cohort.updatedAt,
    });
    expect(updated.priority).toBe(110);

    scopes.saveMembership({
      cohortId: cohort.cohortId,
      sourceId: "src_uspto",
      action: "ADDED",
      actor: "ops-lead",
      expectedPresent: false,
    });
    scopes.saveMembership({
      cohortId: cohort.cohortId,
      sourceId: "src_uspto",
      action: "REMOVED",
      actor: "ops-manager",
      expectedPresent: true,
    });

    const globalEvents = manual.listPolicyAuditEvents({ limit: 10 });
    expect(globalEvents).toHaveLength(2);
    expect(globalEvents[0]).toMatchObject({
      scope: "GLOBAL_POLICY",
      action: "GLOBAL_POLICY_CHANGED",
      actorLabel: "ops-manager",
      historicalCompleteness: "EVENT_SOURCED",
    });
    expect(globalEvents[0]?.changes).toContainEqual({
      field: "claimTargetHours",
      before: 24,
      after: 12,
    });

    const cohortEvents = scopes.listCohortAuditEvents({ limit: 10 });
    expect(cohortEvents.map((event) => event.action)).toEqual(["COHORT_UPDATED", "COHORT_CREATED"]);
    expect(cohortEvents[0]?.changes).toContainEqual({ field: "priority", before: 100, after: 110 });

    const membershipEvents = scopes.listMembershipAuditEvents({
      sourceIds: ["src_uspto"],
      limit: 10,
    });
    expect(membershipEvents.map((event) => event.action)).toEqual([
      "MEMBERSHIP_REMOVED",
      "MEMBERSHIP_ADDED",
    ]);
    expect(membershipEvents[0]?.changes).toEqual([
      { field: "membershipPresent", before: true, after: false },
    ]);
    database.close();
  });

  it("backfills existing current snapshots once without claiming missing event history", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE source_intelligence_manual_sla_policy (
        policy_id TEXT PRIMARY KEY,
        claim_target_hours INTEGER,
        review_target_hours INTEGER,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO source_intelligence_manual_sla_policy VALUES (
        'source-intelligence-review-workflow', 24, 48, 'legacy-operator', '2026-08-08T00:00:00.000Z'
      );

      CREATE TABLE source_intelligence_policy_cohorts (
        cohort_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        priority INTEGER NOT NULL,
        enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
        claim_target_hours INTEGER,
        review_target_hours INTEGER,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO source_intelligence_policy_cohorts VALUES (
        'sic_11111111111111111111111111111111', 'Legacy cohort', NULL, 80, 1, 8, 24,
        'legacy-operator', '2026-08-08T01:00:00.000Z'
      );

      CREATE TABLE source_intelligence_policy_cohort_memberships (
        cohort_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        added_by TEXT NOT NULL,
        added_at TEXT NOT NULL,
        PRIMARY KEY(cohort_id, source_id),
        FOREIGN KEY(cohort_id) REFERENCES source_intelligence_policy_cohorts(cohort_id)
      ) STRICT;
      INSERT INTO source_intelligence_policy_cohort_memberships VALUES (
        'sic_11111111111111111111111111111111', 'src_legacy', 'legacy-operator',
        '2026-08-08T02:00:00.000Z'
      );
    `);

    const manual = new SqliteSourceIntelligenceManualSlaRepository(database);
    const scopes = new SqliteSourceIntelligencePolicyScopeRepository(database);
    expect(manual.listPolicyAuditEvents()).toHaveLength(1);
    expect(manual.listPolicyAuditEvents()[0]).toMatchObject({
      action: "SNAPSHOT_BACKFILL",
      historicalCompleteness: "SNAPSHOT_BACKFILL",
    });
    expect(scopes.listCohortAuditEvents()).toHaveLength(1);
    expect(scopes.listMembershipAuditEvents()).toHaveLength(1);

    new SqliteSourceIntelligenceManualSlaRepository(database);
    new SqliteSourceIntelligencePolicyScopeRepository(database);
    expect(manual.listPolicyAuditEvents()).toHaveLength(1);
    expect(scopes.listCohortAuditEvents()).toHaveLength(1);
    expect(scopes.listMembershipAuditEvents()).toHaveLength(1);
    database.close();
  });
});
