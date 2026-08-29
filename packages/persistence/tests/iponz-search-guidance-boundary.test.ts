import { describe, expect, it } from "vitest";
import { IPONZ_NZ_SOURCE_COVERAGE_TARGETS } from "../src/priority-national-source-coverage";
import { getRepresentativeSourceLiveCanaries } from "../src/representative-source-live-canaries";

const GUIDANCE_URI = "https://www.iponz.govt.nz/get-ip/trade-marks/search/";
const TRADE_MARK_CHECK_URI = "https://app.iponz.govt.nz/app/TradeMarkCheck";
const CASE_SEARCH_URI =
  "https://app.iponz.govt.nz/app/Extra/Default.aspx?directAccess=true&fcoOp=EXTRA__Default&op=EXTRA_tm_qbe";

describe("IPONZ trademark search acquisition boundary", () => {
  it("keeps anonymous acquisition on the public guidance page", () => {
    const target = IPONZ_NZ_SOURCE_COVERAGE_TARGETS.find(
      (item) => item.id === "nz-iponz-trademark-search",
    );

    expect(target).toMatchObject({
      catalogState: "ACTIVE",
      family: "SEARCH",
      displayName: "IPONZ Search for Existing Trade Marks Guidance",
      canonicalUri: GUIDANCE_URI,
      acquisition: {
        mode: "WEB_CRAWL",
        renderJavascriptHint: false,
        fetchAttachmentsHint: false,
        expectedArtifactKinds: ["HTML", "MARKDOWN"],
      },
      verificationEvidenceUri: GUIDANCE_URI,
      verifiedAt: "2026-08-29T12:23:00Z",
    });
    expect(target?.entrypoints).toEqual([
      { uri: GUIDANCE_URI, label: "Trade mark search guidance" },
      { uri: TRADE_MARK_CHECK_URI, label: "Trade Mark Check" },
      { uri: CASE_SEARCH_URI, label: "Trade Mark Case Search" },
    ]);
    expect(target?.notes).toContain("separate interactive public entrypoints");
    expect(target?.notes).toContain("does not claim structured-result JSON or image artifacts");
  });

  it("keeps the New Zealand canary on guidance with a distinct filing baseline", () => {
    const newZealand = getRepresentativeSourceLiveCanaries().find(
      (canary) => canary.jurisdiction === "NZ",
    );

    expect(newZealand).toMatchObject({
      targetId: "nz-iponz-trademark-search",
      family: "SEARCH",
      canonicalUri: GUIDANCE_URI,
      renderJavascript: false,
      expectedArtifactKinds: ["HTML", "MARKDOWN"],
      promotionEligible: false,
      authorityBaseline: {
        targetId: "nz-iponz-trademark-filing",
        family: "FILING",
        canonicalUri: "https://www.iponz.govt.nz/get-ip/trade-marks/apply/",
        renderJavascript: false,
        expectedArtifactKinds: ["HTML", "MARKDOWN"],
      },
    });
  });
});
