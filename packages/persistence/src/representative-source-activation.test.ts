import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, SqliteSourceRepository } from "./index";
import {
  REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS,
  REPRESENTATIVE_SOURCE_ACTIVATION_WAVE_VERSION,
  getRepresentativeSourceActivationWave,
} from "./representative-source-activation";
import { queueSourceCoverageGapsForDiscovery } from "./source-coverage-discovery-intake";
import { SqliteSourceDiscoveryRepository } from "./source-discovery-registry";

describe("representative source activation wave", () => {
  it("stays inside one governed Discovery batch and covers every selected jurisdiction", () => {
    const wave = getRepresentativeSourceActivationWave();
    expect(wave.version).toBe(REPRESENTATIVE_SOURCE_ACTIVATION_WAVE_VERSION);
    expect(REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS).toHaveLength(12);
    expect(wave.targets.length).toBeGreaterThan(0);
    expect(wave.targets.length).toBeLessThanOrEqual(100);
    expect(new Set(wave.targetIds).size).toBe(wave.targetIds.length);

    const targetJurisdictions = new Set(wave.targets.map((target) => target.jurisdiction));
    for (const jurisdiction of REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS) {
      expect(targetJurisdictions.has(jurisdiction.jurisdiction)).toBe(true);
    }
    expect(wave.targets.every((target) => target.catalogState === "ACTIVE")).toBe(true);
  });

  it("includes national, EUIPO-regional and OAPI-regional acquisition behavior", () => {
    const profiles = new Set(
      REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS.map((item) => item.profile),
    );
    expect(profiles.has("DYNAMIC_PORTAL")).toBe(true);
    expect(profiles.has("MULTILINGUAL")).toBe(true);
    expect(profiles.has("MENA")).toBe(true);
    expect(profiles.has("REGIONAL_EUIPO")).toBe(true);
    expect(profiles.has("REGIONAL_OAPI")).toBe(true);
  });

  it("queues the whole wave through governed Discovery intake and replays idempotently", () => {
    const database = new DatabaseSync(":memory:");
    const sources = new SqliteSourceRepository(database);
    const discovery = new SqliteSourceDiscoveryRepository(
      database,
      () => new Date("2026-08-17T15:30:00.000Z"),
    );
    const wave = getRepresentativeSourceActivationWave();

    const first = queueSourceCoverageGapsForDiscovery(
      { workspaceId: DEFAULT_WORKSPACE.id, targetIds: wave.targetIds },
      { sources, discovery, clock: () => new Date("2026-08-17T15:30:00.000Z") },
    );
    expect(first.summary.total).toBe(wave.targetIds.length);
    expect(first.summary.ALREADY_COVERED).toBe(0);
    expect(first.summary.QUEUED + first.summary.ALREADY_IN_DISCOVERY).toBe(wave.targetIds.length);
    expect(first.summary.QUEUED).toBeGreaterThan(0);

    const second = queueSourceCoverageGapsForDiscovery(
      { workspaceId: DEFAULT_WORKSPACE.id, targetIds: wave.targetIds },
      { sources, discovery, clock: () => new Date("2026-08-17T15:31:00.000Z") },
    );
    expect(second.summary.total).toBe(wave.targetIds.length);
    expect(second.summary.QUEUED).toBe(0);
    expect(second.summary.ALREADY_COVERED).toBe(0);
    expect(second.summary.ALREADY_IN_DISCOVERY).toBe(wave.targetIds.length);
  });
});
