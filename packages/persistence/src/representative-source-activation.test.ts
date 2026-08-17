import { describe, expect, it } from "vitest";
import {
  REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS,
  REPRESENTATIVE_SOURCE_ACTIVATION_WAVE_VERSION,
  getRepresentativeSourceActivationWave,
} from "./representative-source-activation";

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
});
