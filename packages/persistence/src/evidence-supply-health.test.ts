import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, initializeRegistry } from "./index";
import {
  SqliteEvidenceSupplyHealthRepository,
  deriveEvidenceSupplyHealthState,
} from "./evidence-supply-health";

describe("deriveEvidenceSupplyHealthState", () => {
  it("keeps unknown evidence distinct from blocked evidence", () => {
    expect(
      deriveEvidenceSupplyHealthState({
        coverage: "UNKNOWN",
        supplyState: "BLOCKED",
        freshness: "UNOBSERVED",
        schedulerErrorCount: 0,
        unrecoveredFailure: true,
      }),
    ).toBe("UNKNOWN");
  });

  it("prioritizes blocked, stale and partial objective conditions", () => {
    expect(
      deriveEvidenceSupplyHealthState({
        coverage: "COMPLETE",
        supplyState: "BLOCKED",
        freshness: "STALE",
        schedulerErrorCount: 1,
        unrecoveredFailure: true,
      }),
    ).toBe("BLOCKED");
    expect(
      deriveEvidenceSupplyHealthState({
        coverage: "COMPLETE",
        supplyState: "READY",
        freshness: "STALE",
        schedulerErrorCount: 1,
        unrecoveredFailure: true,
      }),
    ).toBe("STALE");
    expect(
      deriveEvidenceSupplyHealthState({
        coverage: "PARTIAL",
        supplyState: "READY",
        freshness: "FRESH",
        schedulerErrorCount: 1,
        unrecoveredFailure: true,
      }),
    ).toBe("PARTIAL");
  });

  it("uses current supply, scheduler or unrecovered failure without opaque scoring", () => {
    expect(
      deriveEvidenceSupplyHealthState({
        coverage: "COMPLETE",
        supplyState: "DEGRADED",
        freshness: "FRESH",
        schedulerErrorCount: 0,
        unrecoveredFailure: false,
      }),
    ).toBe("DEGRADED");
    expect(
      deriveEvidenceSupplyHealthState({
        coverage: "COMPLETE",
        supplyState: "READY",
        freshness: "FRESH",
        schedulerErrorCount: 1,
        unrecoveredFailure: false,
      }),
    ).toBe("DEGRADED");
    expect(
      deriveEvidenceSupplyHealthState({
        coverage: "COMPLETE",
        supplyState: "READY",
        freshness: "FRESH",
        schedulerErrorCount: 0,
        unrecoveredFailure: true,
      }),
    ).toBe("DEGRADED");
    expect(
      deriveEvidenceSupplyHealthState({
        coverage: "COMPLETE",
        supplyState: "READY",
        freshness: "FRESH",
        schedulerErrorCount: 0,
        unrecoveredFailure: false,
      }),
    ).toBe("HEALTHY");
  });
});

describe("SqliteEvidenceSupplyHealthRepository", () => {
  it("returns a versioned explainable projection for an empty workspace", () => {
    const database = new DatabaseSync(":memory:");
    try {
      initializeRegistry(database);
      const result = new SqliteEvidenceSupplyHealthRepository(database).list({
        workspaceId: DEFAULT_WORKSPACE.id,
        observedAt: new Date("2026-09-06T00:00:00.000Z"),
      });

      expect(result.protocolVersion).toBe("1.0");
      expect(result.objectType).toBe("EVIDENCE_SUPPLY_HEALTH_RESULT");
      expect(result.workspaceId).toBe(DEFAULT_WORKSPACE.id);
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.summary.total).toBe(result.items.length);
      expect(result.summary.byState.UNKNOWN).toBe(result.items.length);
      expect(result.items[0]).toMatchObject({
        protocolVersion: "1.0",
        objectType: "EVIDENCE_SUPPLY_HEALTH",
        state: "UNKNOWN",
        coverage: { state: "UNKNOWN" },
        currentRun: null,
        reliability: {
          windowDays: 30,
          attempts: 0,
          latestTerminalStatus: null,
          unrecoveredFailure: false,
        },
        changeActivity: { updates7d: 0, updates30d: 0 },
      });
    } finally {
      database.close();
    }
  });
});
