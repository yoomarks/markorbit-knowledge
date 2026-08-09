import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SqliteSourceIntelligenceManualSlaRepository } from "../src/source-intelligence-manual-sla-registry";
import { SqliteSourceIntelligencePolicyScopeRepository } from "../src/source-intelligence-policy-scope-registry";
import { SqliteSourceIntelligencePolicyResolutionRepository } from "../src/source-intelligence-policy-resolution-registry";

describe("D2.17 policy resolution checkpoint", () => {
  it("captures one immutable baseline inside SQLite", () => {
    const database = new DatabaseSync(":memory:");
    const manual = new SqliteSourceIntelligenceManualSlaRepository(
      database,
      () => new Date("2026-08-09T03:00:00.000Z"),
    );
    const scopes = new SqliteSourceIntelligencePolicyScopeRepository(
      database,
      () => new Date("2026-08-09T03:01:00.000Z"),
    );
    manual.savePolicy({
      actor: "ops",
      claimTargetHours: 24,
      reviewTargetHours: 48,
      expectedUpdatedAt: null,
    });
    const cohort = scopes.saveCohort({
      name: "Primary",
      priority: 100,
      enabled: true,
      claimTargetHours: 4,
      reviewTargetHours: 12,
      actor: "ops",
      expectedUpdatedAt: null,
    });
    scopes.saveMembership({
      cohortId: cohort.cohortId,
      sourceId: "src_a",
      action: "ADDED",
      actor: "ops",
      expectedPresent: false,
    });

    const repository = new SqliteSourceIntelligencePolicyResolutionRepository(
      database,
      () => new Date("2026-08-09T03:05:00.000Z"),
    );
    const first = repository.ensureCheckpoint();
    expect(first.checkpointAt).toBe("2026-08-09T03:05:00.000Z");
    expect(first.globalPolicy?.claimTargetHours).toBe(24);
    expect(first.cohorts).toHaveLength(1);
    expect(first.memberships).toHaveLength(1);

    manual.savePolicy({
      actor: "ops-2",
      claimTargetHours: 12,
      reviewTargetHours: 24,
      expectedUpdatedAt: manual.getPolicy()!.updatedAt,
    });
    const second = repository.ensureCheckpoint();
    expect(second).toEqual(first);
    database.close();
  });
});
