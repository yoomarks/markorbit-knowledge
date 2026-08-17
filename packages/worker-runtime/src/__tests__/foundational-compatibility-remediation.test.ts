import { describe, expect, it } from "vitest";
import {
  deriveFoundationalReadinessStage,
  evaluateFoundationalReadiness,
  type FoundationalSupplyHealthItem,
} from "../foundational-readiness";
import { buildFoundationalRemediationQueue } from "../foundational-remediation-queue";

const TARGET_ID = "cn-cnipa-trademark-search";
const SOURCE_ID = "source-cnipa-search";

function supply(
  compatibilityState: NonNullable<FoundationalSupplyHealthItem["compatibilityState"]>,
  compatibilityFreshness: NonNullable<FoundationalSupplyHealthItem["compatibilityFreshness"]>,
): FoundationalSupplyHealthItem {
  return {
    targetId: TARGET_ID,
    sourceIds: [SOURCE_ID],
    state:
      compatibilityFreshness === "FRESH" && compatibilityState === "BLOCKED" ? "BLOCKED" : "READY",
    registrationState: "REGISTERED",
    latestRunStatus: "COMPLETED",
    artifactCount: 2,
    readyDocumentCount: 1,
    currentDocumentCount: 1,
    freshnessState: "FRESH",
    compatibilityState,
    compatibilityFreshness,
    compatibilityObservedAt: "2026-08-15T00:00:00.000Z",
    gaps:
      compatibilityFreshness === "FRESH" && compatibilityState === "BLOCKED"
        ? ["EXTERNAL_COMPATIBILITY_BLOCKED"]
        : [],
  };
}

function readiness(item: FoundationalSupplyHealthItem) {
  return evaluateFoundationalReadiness(
    "CN",
    [TARGET_ID],
    [item],
    [{ sourceId: SOURCE_ID, state: "READY", gaps: [], isCurrent: true }],
    [{ targetId: TARGET_ID, state: "READY", gaps: [], probeCount: 1 }],
  );
}

describe("foundational compatibility remediation", () => {
  it("turns stale historical compatibility into HEALTH debt without reviving the old outage", () => {
    const item = supply("BLOCKED", "STALE");

    expect(item.state).toBe("READY");
    expect(item.gaps).toEqual([]);
    expect(deriveFoundationalReadinessStage(item)).toBe("HEALTH");

    const gate = readiness(item);
    const target = gate.targets[0];
    expect(gate.protocolVersion).toBe("1.3");
    expect(gate.state).toBe("NOT_READY");
    expect(target).toMatchObject({
      targetId: TARGET_ID,
      stage: "HEALTH",
      healthState: "READY",
      reason: "SOURCE_COMPATIBILITY_OBSERVATION_STALE",
      compatibilityState: "BLOCKED",
      compatibilityFreshness: "STALE",
    });

    const queue = buildFoundationalRemediationQueue(gate, "default");
    expect(queue.protocolVersion).toBe("1.1");
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.actions).toEqual([
      expect.objectContaining({
        code: "REPROBE_SOURCE_COMPATIBILITY",
        executionPath: "MANUAL_OPERATOR",
        collectionAuthorizationRequired: false,
        automaticExecution: false,
        endpoint: null,
        gapCodes: ["SOURCE_COMPATIBILITY_OBSERVATION_STALE"],
      }),
    ]);
  });

  it("keeps a fresh compatibility block as current supply-health remediation, not a re-probe", () => {
    const gate = readiness(supply("BLOCKED", "FRESH"));
    const queue = buildFoundationalRemediationQueue(gate, "default");

    expect(gate.targets[0]).toMatchObject({
      stage: "HEALTH",
      healthState: "BLOCKED",
      compatibilityState: "BLOCKED",
      compatibilityFreshness: "FRESH",
    });
    expect(queue.items[0]?.actions[0]?.code).toBe("REVIEW_SUPPLY_HEALTH");
  });
});
