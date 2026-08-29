import { describe, expect, it } from "vitest";
import { REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS } from "./representative-source-activation";
import {
  REPRESENTATIVE_SOURCE_LIVE_CANARY_JURISDICTIONS,
  REPRESENTATIVE_SOURCE_LIVE_CANARY_VERSION,
  getRepresentativeSourceLiveCanaries,
  getRepresentativeSupplyPromotionCanaries,
} from "./representative-source-live-canaries";

describe("representative source live canaries", () => {
  it("selects one distinct active foundational HTML canary for every observation jurisdiction", () => {
    const canaries = getRepresentativeSourceLiveCanaries();
    expect(canaries).toHaveLength(REPRESENTATIVE_SOURCE_LIVE_CANARY_JURISDICTIONS.length);
    expect(new Set(canaries.map((canary) => canary.targetId)).size).toBe(canaries.length);
    expect(new Set(canaries.map((canary) => canary.jurisdiction)).size).toBe(canaries.length);
    for (const canary of canaries) {
      expect(canary.version).toBe(REPRESENTATIVE_SOURCE_LIVE_CANARY_VERSION);
      expect(canary.canonicalUri).toMatch(/^https?:\/\//u);
      expect(canary.expectedArtifactKinds).toContain("HTML");
      expect(canary.languages.length).toBeGreaterThan(0);
    }
  });

  it("keeps observation-only jurisdictions out of the fail-closed promotion view", () => {
    const observed = getRepresentativeSourceLiveCanaries();
    const promoted = getRepresentativeSupplyPromotionCanaries();
    expect(observed.find((canary) => canary.jurisdiction === "NZ")).toMatchObject({
      targetId: "nz-iponz-trademark-search",
      promotionEligible: false,
    });
    expect(promoted.map((canary) => canary.jurisdiction)).toEqual(
      REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS.map((item) => item.jurisdiction),
    );
    expect(promoted.every((canary) => canary.promotionEligible)).toBe(true);
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

  it("adds a distinct low-interaction authority baseline to every primary canary", () => {
    const canaries = getRepresentativeSourceLiveCanaries();
    for (const canary of canaries) {
      expect(canary.authorityBaseline.targetId).not.toBe(canary.targetId);
      expect(canary.authorityBaseline.canonicalUri).toMatch(/^https?:\/\//u);
      expect(canary.authorityBaseline.renderJavascript).toBe(false);
      expect(canary.authorityBaseline.expectedArtifactKinds).toContain("HTML");
    }
  });

  it("uses public CNIPA access guidance with the stable filing guide as authority baseline", () => {
    const china = getRepresentativeSourceLiveCanaries().find(
      (canary) => canary.jurisdiction === "CN",
    );
    expect(china).toMatchObject({
      targetId: "cn-cnipa-trademark-search",
      canonicalUri:
        "https://www.cnipa.gov.cn/jact/front/mailpubdetail.do?sysid=13&transactId=502906",
      renderJavascript: false,
      expectedArtifactKinds: ["HTML", "MARKDOWN"],
    });
    expect(china?.authorityBaseline).toEqual({
      targetId: "cn-cnipa-trademark-filing-guide",
      family: "FILING",
      canonicalUri: "https://www.cnipa.gov.cn/art/2020/12/21/art_2488_155734.html",
      renderJavascript: false,
      expectedArtifactKinds: ["HTML", "MARKDOWN"],
    });
  });

  it("selects the same target matrix deterministically across repeated reads", () => {
    const first = getRepresentativeSourceLiveCanaries().map((canary) => ({
      jurisdiction: canary.jurisdiction,
      targetId: canary.targetId,
      canonicalUri: canary.canonicalUri,
      renderJavascript: canary.renderJavascript,
      expectedArtifactKinds: canary.expectedArtifactKinds,
      authorityBaseline: canary.authorityBaseline,
    }));
    const second = getRepresentativeSourceLiveCanaries().map((canary) => ({
      jurisdiction: canary.jurisdiction,
      targetId: canary.targetId,
      canonicalUri: canary.canonicalUri,
      renderJavascript: canary.renderJavascript,
      expectedArtifactKinds: canary.expectedArtifactKinds,
      authorityBaseline: canary.authorityBaseline,
    }));
    expect(second).toEqual(first);
  });
});
