import { describe, expect, it } from "vitest";
import { IP_INDIA_SOURCE_COVERAGE_TARGETS } from "../src/priority-national-source-coverage";
import { getRepresentativeSourceLiveCanaries } from "../src/representative-source-live-canaries";

const GUIDANCE_URI =
  "https://ipindia.gov.in/trade-marks-before-you-apply-search-existing-trademarks";
const AI_ML_SEARCH_URI = "https://tmsearch.ipindia.gov.in/ords/r/tisa/trademark_search600/login";
const PUBLIC_SEARCH_URI = "https://tmrsearch.ipindia.gov.in/tmrpublicsearch/";

describe("IP India trademark search acquisition boundary", () => {
  it("keeps anonymous acquisition on the public guidance page", () => {
    const target = IP_INDIA_SOURCE_COVERAGE_TARGETS.find(
      (item) => item.id === "in-ipindia-trademark-search",
    );

    expect(target).toMatchObject({
      catalogState: "ACTIVE",
      family: "SEARCH",
      displayName: "IP India Search Existing Trademarks Guidance",
      canonicalUri: GUIDANCE_URI,
      acquisition: {
        mode: "WEB_CRAWL",
        renderJavascriptHint: false,
        fetchAttachmentsHint: false,
        expectedArtifactKinds: ["HTML", "MARKDOWN"],
      },
      verificationEvidenceUri: GUIDANCE_URI,
      verifiedAt: "2026-08-29T11:36:00Z",
    });
    expect(target?.entrypoints).toEqual([
      { uri: GUIDANCE_URI, label: "Search guidance" },
      {
        uri: AI_ML_SEARCH_URI,
        label: "Protected AI/ML search (account + OTP)",
      },
      {
        uri: PUBLIC_SEARCH_URI,
        label: "Protected public search (CAPTCHA + OTP)",
      },
    ]);
    expect(target?.notes).toContain("anonymous structured-search");
  });

  it("keeps the India canary public with a distinct filing baseline", () => {
    const india = getRepresentativeSourceLiveCanaries().find(
      (canary) => canary.jurisdiction === "IN",
    );

    expect(india).toMatchObject({
      targetId: "in-ipindia-trademark-search",
      family: "SEARCH",
      canonicalUri: GUIDANCE_URI,
      renderJavascript: false,
      expectedArtifactKinds: ["HTML", "MARKDOWN"],
      promotionEligible: true,
      authorityBaseline: {
        targetId: "in-ipindia-trademark-filing-process",
        family: "FILING",
        canonicalUri: "https://ipindia.gov.in/trade-marks-learn-filing-process-step-by-step",
        renderJavascript: false,
        expectedArtifactKinds: ["HTML", "MARKDOWN"],
      },
    });
  });
});
