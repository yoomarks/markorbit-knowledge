import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, initializeRegistry } from "@markorbit/persistence";
import { getControlPlaneEvidenceSupplyHealthOwnerView } from "./control-plane-evidence-supply-health-owner";

const OBSERVED_AT = new Date("2026-09-06T13:00:00.000Z");

function database(): DatabaseSync {
  const value = new DatabaseSync(":memory:");
  initializeRegistry(value);
  return value;
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (typeof value !== "object" || value === null) return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    collectKeys(child, keys);
  }
  return keys;
}

describe("getControlPlaneEvidenceSupplyHealthOwnerView", () => {
  it("returns only the bounded versioned Knowledge owner projection", () => {
    const db = database();
    try {
      const result = getControlPlaneEvidenceSupplyHealthOwnerView(DEFAULT_WORKSPACE.id, {
        database: db,
        observedAt: OBSERVED_AT,
      });
      expect(result).toMatchObject({
        protocolVersion: "1.0",
        objectType: "CONTROL_PLANE_EVIDENCE_SUPPLY_HEALTH_OWNER_RESULT",
        owner: "KNOWLEDGE",
        access: "READ_ONLY",
        requiredUpstreamAuthority: "control-plane:knowledge:read",
        sourceReadModel: "evidence-supply-health.v1",
        workspaceId: DEFAULT_WORKSPACE.id,
        observedAt: OBSERVED_AT.toISOString(),
      });
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.summary.total).toBe(result.items.length);
      expect(result.summary.byState.UNKNOWN).toBe(result.items.length);
    } finally {
      db.close();
    }
  });

  it("whitelists canonical health facts and excludes Admin/detail/secret fields", () => {
    const db = database();
    try {
      const result = getControlPlaneEvidenceSupplyHealthOwnerView(DEFAULT_WORKSPACE.id, {
        database: db,
        observedAt: OBSERVED_AT,
      });
      expect(Object.keys(result).sort()).toEqual(
        [
          "access",
          "items",
          "objectType",
          "observedAt",
          "owner",
          "protocolVersion",
          "requiredUpstreamAuthority",
          "sourceReadModel",
          "summary",
          "workspaceId",
        ].sort(),
      );
      const keys = collectKeys(result);
      for (const forbidden of [
        "canonicalUri",
        "content",
        "documentBody",
        "rawArtifact",
        "rawArtifactBytes",
        "adminNavigation",
        "adminSession",
        "secret",
        "legalConclusion",
        "relevanceScore",
        "providerRanking",
        "recommendation",
        "sql",
        "mutationGuidance",
      ]) {
        expect(keys.has(forbidden), forbidden).toBe(false);
      }
      expect(result.items[0]).toMatchObject({
        state: "UNKNOWN",
        coverage: { state: "UNKNOWN" },
        currentRun: null,
        reliability: { attempts: 0, unrecoveredFailure: false },
      });
    } finally {
      db.close();
    }
  });

  it("fails closed when canonical target metadata or owner storage is unavailable", () => {
    const db = database();
    try {
      expect(() =>
        getControlPlaneEvidenceSupplyHealthOwnerView(DEFAULT_WORKSPACE.id, {
          database: db,
          observedAt: OBSERVED_AT,
          targets: [],
        }),
      ).toThrow(/target .* is unavailable/);
    } finally {
      db.close();
    }

    expect(() =>
      getControlPlaneEvidenceSupplyHealthOwnerView(DEFAULT_WORKSPACE.id, {
        database: db,
        observedAt: OBSERVED_AT,
      }),
    ).toThrow();
  });
});
