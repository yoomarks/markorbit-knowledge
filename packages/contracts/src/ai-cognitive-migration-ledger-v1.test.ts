import { describe, expect, it } from "vitest";
import { AI_COGNITIVE_MIGRATION_LEDGER_V1 } from "./ai-cognitive-migration-ledger-v1";
import { AI_EVIDENCE_PLANE_OWNER_MAP_V1 } from "./ai-evidence-plane-owner-map-v1";

describe("AI cognitive migration ledger", () => {
  it("covers every DEPRECATE and MOVE-TO-BRAIN owner-map entry exactly once", () => {
    const expected = AI_EVIDENCE_PLANE_OWNER_MAP_V1.filter(
      (entry) => entry.classification === "DEPRECATE" || entry.classification === "MOVE-TO-BRAIN",
    )
      .map((entry) => `${entry.classification}:${entry.modulePath}`)
      .sort();
    const actual = AI_COGNITIVE_MIGRATION_LEDGER_V1.map(
      (entry) => `${entry.classification}:${entry.modulePath}`,
    ).sort();
    expect(new Set(actual).size).toBe(actual.length);
    expect(actual).toEqual(expected);
  });

  it("freezes an explicit owner, compatibility rule and retirement condition for every item", () => {
    for (const entry of AI_COGNITIVE_MIGRATION_LEDGER_V1) {
      expect(entry.targetOwner.length).toBeGreaterThan(0);
      expect(entry.migrationTarget.trim().length).toBeGreaterThan(0);
      expect(entry.crossRepositoryHandoffTarget).toContain("yoomarks/markorbit");
      expect(entry.compatibilityRule.trim().length).toBeGreaterThan(0);
      expect(entry.retirementCondition.trim().length).toBeGreaterThan(0);
      expect(entry.currentProducers.length + entry.currentConsumers.length).toBeGreaterThan(0);
    }
  });
});
