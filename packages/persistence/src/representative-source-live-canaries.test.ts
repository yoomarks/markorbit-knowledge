import { describe, expect, it } from "vitest";
import { REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS } from "./representative-source-activation";
import {
  REPRESENTATIVE_SOURCE_LIVE_CANARY_VERSION,
  getRepresentativeSourceLiveCanaries,
} from "./representative-source-live-canaries";

describe("representative source live canaries", () => {
  it("selects one distinct active foundational HTML canary for every activation jurisdiction", () => {
    const canaries = getRepresentativeSourceLiveCanaries();
    expect(canaries).toHaveLength(REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS.length);
    expect(new Set(canaries.map((canary) => canary.targetId)).size).toBe(canaries.length);
    expect(new Set(canaries.map((canary) => canary.jurisdiction)).size).toBe(canaries.length);
    for (const canary of canaries) {
      expect(canary.version).toBe(REPRESENTATIVE_SOURCE_LIVE_CANARY_VERSION);
      expect(canary.canonicalUri).toMatch(/^https?:\/\//u);
      expect(canary.expectedArtifactKinds).toContain("HTML");
      expect(canary.languages.length).toBeGreaterThan(0);
    }
  });

  it("preserves every representative acquisition profile in the live matrix", () => {
    const canaries = getRepresentativeSourceLiveCanaries();
    const profiles = new Set(canaries.map((canary) => canary.profile));
    for (const item of REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS) {
      expect(profiles.has(item.profile)).toBe(true);
    }
  });

  it("selects JavaScript-rendered canaries when the curated target requires them", () => {
    const canaries = getRepresentativeSourceLiveCanaries();
    expect(canaries.some((canary) => canary.renderJavascript)).toBe(true);
  });
});
