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

  it("adds a distinct low-interaction authority baseline to interactive primary canaries", () => {
    const canaries = getRepresentativeSourceLiveCanaries();
    const interactive = canaries.filter(
      (canary) => canary.family === "SEARCH" || canary.renderJavascript,
    );
    expect(interactive.length).toBeGreaterThan(0);
    for (const canary of interactive) {
      expect(canary.authorityBaseline).toBeDefined();
      expect(canary.authorityBaseline?.targetId).not.toBe(canary.targetId);
      expect(canary.authorityBaseline?.canonicalUri).toMatch(/^https?:\/\//u);
      expect(canary.authorityBaseline?.renderJavascript).toBe(false);
    }
  });

  it("uses the stable CNIPA filing guide as the authority baseline for trademark search", () => {
    const china = getRepresentativeSourceLiveCanaries().find(
      (canary) => canary.jurisdiction === "CN",
    );
    expect(china?.targetId).toBe("cn-cnipa-trademark-search");
    expect(china?.authorityBaseline).toEqual({
      targetId: "cn-cnipa-trademark-filing-guide",
      family: "FILING",
      canonicalUri: "https://www.cnipa.gov.cn/art/2020/12/21/art_2488_155734.html",
      renderJavascript: false,
    });
  });

  it("selects the same target matrix deterministically across repeated reads", () => {
    const first = getRepresentativeSourceLiveCanaries().map((canary) => ({
      jurisdiction: canary.jurisdiction,
      targetId: canary.targetId,
      canonicalUri: canary.canonicalUri,
      renderJavascript: canary.renderJavascript,
      authorityBaseline: canary.authorityBaseline,
    }));
    const second = getRepresentativeSourceLiveCanaries().map((canary) => ({
      jurisdiction: canary.jurisdiction,
      targetId: canary.targetId,
      canonicalUri: canary.canonicalUri,
      renderJavascript: canary.renderJavascript,
      authorityBaseline: canary.authorityBaseline,
    }));
    expect(second).toEqual(first);
  });
});
