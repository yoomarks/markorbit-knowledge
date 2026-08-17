import { describe, expect, it } from "vitest";
import {
  buildGlobalSupplyRadarRows,
  deriveGlobalSupplyRadarStatus,
  summarizeGlobalSupplyRadar,
  type GlobalSupplyRadarCoverageItem,
} from "./global-supply-radar-state";

function item(
  jurisdiction: string,
  overrides: Partial<GlobalSupplyRadarCoverageItem> = {},
): GlobalSupplyRadarCoverageItem {
  return {
    jurisdiction,
    targetCount: 4,
    registeredTargetCount: 4,
    activatedTargetCount: 4,
    supply: {
      healthy: 4,
      degraded: 0,
      blocked: 0,
      stale: 0,
      healthyPercent: 100,
    },
    ...overrides,
  };
}

describe("global supply radar state", () => {
  it("keeps catalog, activation and healthy supply as separate gates", () => {
    expect(deriveGlobalSupplyRadarStatus(item("US"))).toBe("READY");
    expect(
      deriveGlobalSupplyRadarStatus(
        item("US", { activatedTargetCount: 3, supply: { healthy: 3, degraded: 0, blocked: 0, stale: 0, healthyPercent: 75 } }),
      ),
    ).toBe("DEGRADED");
    expect(deriveGlobalSupplyRadarStatus(item("US", { registeredTargetCount: 3 }))).toBe("BLOCKED");
    expect(
      deriveGlobalSupplyRadarStatus(
        item("US", { supply: { healthy: 3, degraded: 0, blocked: 1, stale: 0, healthyPercent: 75 } }),
      ),
    ).toBe("BLOCKED");
  });

  it("marks missing representative jurisdiction data unavailable instead of healthy", () => {
    const rows = buildGlobalSupplyRadarRows([item("US")]);
    expect(rows.find((row) => row.code === "US")?.status).toBe("READY");
    expect(rows.find((row) => row.code === "CN")?.status).toBe("UNAVAILABLE");
  });

  it("summarizes representative jurisdiction states without granting mutation capability", () => {
    const rows = buildGlobalSupplyRadarRows([
      item("CN"),
      item("US", { activatedTargetCount: 3, supply: { healthy: 3, degraded: 1, blocked: 0, stale: 0, healthyPercent: 75 } }),
      item("WO", { supply: { healthy: 3, degraded: 0, blocked: 1, stale: 0, healthyPercent: 75 } }),
    ]);
    expect(summarizeGlobalSupplyRadar(rows)).toEqual({
      READY: 1,
      DEGRADED: 1,
      BLOCKED: 1,
      UNAVAILABLE: rows.length - 3,
    });
  });
});
