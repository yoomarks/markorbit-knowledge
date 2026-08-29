import { describe, expect, it } from "vitest";
import { CNIPA_SOURCE_COVERAGE_TARGETS } from "../src/priority-national-source-coverage";
import { getRepresentativeSourceLiveCanaries } from "../src/representative-source-live-canaries";

const GUIDANCE_URI =
  "https://www.cnipa.gov.cn/jact/front/mailpubdetail.do?sysid=13&transactId=502906";
const SEARCH_LANDING_URI = "https://sbj.cnipa.gov.cn/sbj/sbcx/";
const SEARCH_SERVICE_URI = "https://wcjs.sbj.cnipa.gov.cn/";
const SSO_NOTICE_URI = "https://sbj.cnipa.gov.cn/sbj/tzgg/202512/t20251203_36767.html";

describe("CNIPA trademark search authentication boundary", () => {
  it("keeps anonymous acquisition on official public access guidance", () => {
    const target = CNIPA_SOURCE_COVERAGE_TARGETS.find(
      (item) => item.id === "cn-cnipa-trademark-search",
    );

    expect(target).toMatchObject({
      catalogState: "ACTIVE",
      family: "SEARCH",
      displayName: "CNIPA Trademark Search Access Guidance",
      canonicalUri: GUIDANCE_URI,
      acquisition: {
        mode: "WEB_CRAWL",
        renderJavascriptHint: false,
        fetchAttachmentsHint: false,
        expectedArtifactKinds: ["HTML", "MARKDOWN"],
      },
      verificationEvidenceUri: GUIDANCE_URI,
      verifiedAt: "2026-08-29T12:25:00Z",
    });
    expect(target?.entrypoints).toEqual([
      { uri: GUIDANCE_URI, label: "Official trademark search access guidance" },
      { uri: SEARCH_LANDING_URI, label: "Trademark search landing and usage notice" },
      {
        uri: SEARCH_SERVICE_URI,
        label: "Protected trademark online search (account sign-in required)",
      },
      { uri: SSO_NOTICE_URI, label: "Unified identity authentication notice" },
    ]);
    expect(target?.notes).toContain("requires account registration or sign-in");
    expect(target?.notes).toContain("does not claim anonymous structured-result JSON acquisition");
    expect(target?.notes).toContain("does not authorize authentication automation");
  });

  it("keeps the China representative canary on public guidance with a filing baseline", () => {
    const china = getRepresentativeSourceLiveCanaries().find(
      (canary) => canary.jurisdiction === "CN",
    );

    expect(china).toMatchObject({
      targetId: "cn-cnipa-trademark-search",
      family: "SEARCH",
      canonicalUri: GUIDANCE_URI,
      renderJavascript: false,
      expectedArtifactKinds: ["HTML", "MARKDOWN"],
      promotionEligible: true,
      authorityBaseline: {
        targetId: "cn-cnipa-trademark-filing-guide",
        family: "FILING",
        canonicalUri: "https://www.cnipa.gov.cn/art/2020/12/21/art_2488_155734.html",
        renderJavascript: false,
        expectedArtifactKinds: ["HTML", "MARKDOWN"],
      },
    });
  });
});
