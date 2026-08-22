import { describe, expect, it } from "vitest";
import {
  WIPO_RECONCILIATION_SEEDS,
  extractWipoReferencedAssets,
  reconcileWipoCorpus,
} from "./wipo-corpus-reconciliation";

function response(body: string, status = 200, contentType = "text/html; charset=utf-8"): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": contentType,
      etag: '"fixture-etag"',
      "last-modified": "Sat, 22 Aug 2026 00:00:00 GMT",
    },
  });
}

describe("WIPO corpus reconciliation", () => {
  it("uses current Vienna and eMadrid find-and-monitor entrypoints", () => {
    expect(WIPO_RECONCILIATION_SEEDS.find((seed) => seed.domain === "VIENNA")?.uri).toBe(
      "https://www.wipo.int/en/web/classification-vienna/index",
    );
    expect(WIPO_RECONCILIATION_SEEDS.find((seed) => seed.domain === "FIND_MONITOR")?.uri).toBe(
      "https://www.wipo.int/en/web/emadrid/find-and-monitor",
    );
  });

  it("retains official WIPO PDF, XML, CSV and ZIP assets outside the seed path", () => {
    const assets = extractWipoReferencedAssets(
      [
        '<a href="/edocs/madrid/docs/en/mm2.pdf">MM2</a>',
        '<a href="https://www.wipo.int/classifications/vienna/data/vcl10.xml">VCL XML</a>',
        '<a href="https://www.wipo.int/classifications/vienna/data/vcl10.csv">VCL CSV</a>',
        '<a href="https://www.wipo.int/classifications/vienna/data/vcl10.zip">VCL ZIP</a>',
        '<a href="https://example.com/outside.pdf">Outside</a>',
      ].join(""),
      "https://www.wipo.int/en/web/madrid-system/forms/index",
    );

    expect(new Set(assets.map((asset) => asset.kind))).toEqual(
      new Set(["PDF", "XML", "CSV", "ZIP"]),
    );
    expect(assets).toHaveLength(4);
    expect(assets.every((asset) => asset.uri.includes("wipo.int"))).toBe(true);
  });

  it("reports chain gaps and measured transport evidence instead of treating a reachable root as coverage", async () => {
    const fetcher: typeof fetch = async (input) => {
      const uri = String(input);
      if (uri.includes("members/declarations")) return response("", 503);
      if (uri.includes("memberprofiles"))
        return response('<a href="/madrid/memberprofiles/US.html">US</a>');
      if (uri.includes("legal_texts"))
        return response('<a href="/edocs/madrid/docs/en/rules.pdf">Rules</a>');
      if (uri.includes("/fees/"))
        return response('<a href="/en/web/madrid-system/fees/sched">Fees</a>');
      if (uri.includes("/forms/"))
        return response('<a href="/edocs/madrid/docs/en/mm18.pdf">MM18</a>');
      if (uri.includes("madrid-system/members"))
        return response('<a href="/en/web/madrid-system/members/index">Members</a>');
      return response('<a href="/en/web/madrid-system/">Madrid</a>');
    };

    const report = await reconcileWipoCorpus(fetcher);
    const declarations = report.integrationChain.find((stage) => stage.domain === "DECLARATIONS");
    const legalTexts = report.integrationChain.find((stage) => stage.domain === "LEGAL_TEXTS");

    expect(report.failedSeedCount).toBe(1);
    expect(declarations).toEqual({
      domain: "DECLARATIONS",
      seedReachable: false,
      discoveredLinkCount: 0,
      state: "GAP",
    });
    expect(legalTexts?.state).toBe("PRESENT");
    expect(report.assetKindCounts.PDF).toBeGreaterThan(0);
    expect(report.httpStatusCounts["503"]).toBe(1);
    expect(report.httpStatusCounts["200"]).toBe(report.successfulSeedCount);
    expect(report.totalFetchedBytes).toBeGreaterThan(0);
    expect(report.etagObserved).toBe(true);
    expect(report.lastModifiedObserved).toBe(true);
    expect(report.outcomes.every((outcome) => typeof outcome.bytes === "number")).toBe(true);
  });
});
