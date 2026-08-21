import { describe, expect, it } from "vitest";
import {
  IP_AUSTRALIA_TRADEMARK_CORPUS_SEEDS,
  extractIpAustraliaTrademarkLinks,
  summarizeIpAustraliaDomains,
} from "./ip-australia-trademark-corpus-discovery";
import {
  extractIpAustraliaReferencedAssets,
  reconcileIpAustraliaCorpus,
} from "./ip-australia-corpus-reconciliation";

function response(body: string, status = 200, contentType = "text/html; charset=utf-8"): Response {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

describe("IP Australia trademark corpus", () => {
  it("keeps the public task journey and practice manual as independent seeds", () => {
    expect(IP_AUSTRALIA_TRADEMARK_CORPUS_SEEDS.some((seed) => seed.domain === "APPLY")).toBe(true);
    expect(
      IP_AUSTRALIA_TRADEMARK_CORPUS_SEEDS.some((seed) => seed.domain === "PRACTICE_MANUAL"),
    ).toBe(true);
    expect(
      IP_AUSTRALIA_TRADEMARK_CORPUS_SEEDS.some((seed) => seed.domain === "REGISTRATION_RENEWAL"),
    ).toBe(true);
  });

  it("classifies official trademark and manuals knowledge without admitting dev, external, or other IP-right journeys", () => {
    const html = `
      <a href="/trade-marks/timeframes-and-fees">Timeframes and fees</a>
      <a href="/trade-marks/how-to-respond-to-an-examination-report">Examination report</a>
      <a href="https://manuals.ipaustralia.gov.au/trademark/1.-fees---general">Manual fees</a>
      <a href="/patents/how-to-apply-for-a-standard-patent">How to apply</a>
      <a href="/plant-breeders-rights/timeframes-and-fees-application-part-1">Timeframes and fees</a>
      <a href="https://ipa.dev.ipaustralia.gov.au/trade-marks/search-existing-trade-marks">Dev</a>
      <a href="https://example.com/trade-marks">External</a>
      <a href="&quot;&quot;">Broken manual href</a>
    `;
    const links = extractIpAustraliaTrademarkLinks(
      html,
      "https://www.ipaustralia.gov.au/trade-marks",
    );
    const counts = summarizeIpAustraliaDomains(links);

    expect(links).toHaveLength(3);
    expect(counts.TIMEFRAMES_FEES).toBe(1);
    expect(counts.EXAMINATION).toBe(1);
    expect(counts.PRACTICE_MANUAL).toBe(1);
    expect(links.some((link) => link.uri.includes("/patents/"))).toBe(false);
    expect(links.some((link) => link.uri.includes("/plant-breeders-rights/"))).toBe(false);
    expect(links.some((link) => link.uri.includes("%22%22"))).toBe(false);
  });

  it("retains official downloadable evidence assets", () => {
    const assets = extractIpAustraliaReferencedAssets(
      [
        '<a href="/sites/default/files/forms/tm00035.pdf">Non-use form</a>',
        '<a href="https://www.ipaustralia.gov.au/files/data.xlsx">Data</a>',
        '<a href="https://example.com/outside.pdf">Outside</a>',
      ].join(""),
      "https://www.ipaustralia.gov.au/tools-and-research/forms",
    );

    expect(assets.map((asset) => asset.kind).sort()).toEqual(["PDF", "XLSX"]);
  });

  it("reports a journey gap when a real task seed is unreachable", async () => {
    const fetcher: typeof fetch = async (input) => {
      const uri = String(input);
      if (uri.includes("how-to-respond-to-an-examination-report")) return response("", 503);
      if (uri.includes("manuals.ipaustralia.gov.au"))
        return response('<a href="/trademark/1.-fees---general">Fees manual</a>');
      return response('<a href="/trade-marks/timeframes-and-fees">Timeframes and fees</a>');
    };

    const report = await reconcileIpAustraliaCorpus(fetcher);
    const examination = report.journey.find((stage) => stage.domain === "EXAMINATION");
    const manual = report.journey.find((stage) => stage.domain === "PRACTICE_MANUAL");

    expect(report.failedSeedCount).toBe(1);
    expect(examination?.state).toBe("GAP");
    expect(manual?.state).toBe("PRESENT");
  });
});
