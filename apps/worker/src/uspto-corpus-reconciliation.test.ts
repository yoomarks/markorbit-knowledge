import { describe, expect, it } from "vitest";
import {
  USPTO_RECONCILIATION_SEEDS,
  extractUsptoReferencedAssets,
  reconcileUsptoCorpus,
} from "./uspto-corpus-reconciliation";

describe("USPTO corpus reconciliation", () => {
  it("uses the observed current Madrid entrypoint and includes TBMP archives", () => {
    expect(
      USPTO_RECONCILIATION_SEEDS.some((seed) =>
        seed.uri.includes("/ip-policy/international-protection/madrid-protocol"),
      ),
    ).toBe(true);
    expect(
      USPTO_RECONCILIATION_SEEDS.some((seed) =>
        seed.uri.endsWith("/trademarks/ttab/tbmp-archives"),
      ),
    ).toBe(true);
  });

  it("retains official PDF and ZIP assets even when they are outside /trademarks paths", () => {
    const html = `
      <a href="/sites/default/files/documents/tmep-052026.pdf">Current TMEP PDF</a>
      <a href="https://www.uspto.gov/sites/default/files/documents/tmep-html.zip">TMEP HTML ZIP</a>
      <a href="https://example.com/other.pdf">External PDF</a>
    `;
    const assets = extractUsptoReferencedAssets(
      html,
      "https://www.uspto.gov/trademarks/guides-and-manuals/tmep-archives",
    );
    expect(assets).toHaveLength(2);
    expect(assets.map((asset) => asset.kind).sort()).toEqual(["PDF", "ZIP"]);
  });

  it("reports failed seeds separately from successfully discovered pages and assets", async () => {
    const fetcher = async (input: string | URL | Request): Promise<Response> => {
      const uri = String(input);
      if (uri.includes("tmep-archives")) {
        return new Response(
          '<a href="/trademarks/guides-and-manuals/trademark-examination-guides">Exam guides</a><a href="/sites/default/files/tmep.zip">ZIP</a>',
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      if (uri.includes("madrid-protocol")) return new Response("failed", { status: 503 });
      return new Response('<a href="/trademarks/basics">Basics</a>', {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    };

    const report = await reconcileUsptoCorpus(fetcher as typeof fetch);
    expect(report.failedSeedCount).toBe(1);
    expect(report.successfulSeedCount).toBe(report.seedCount - 1);
    expect(report.referencedAssetCount).toBe(1);
    expect(report.assetKindCounts.ZIP).toBe(1);
    expect(report.outcomes.find((outcome) => !outcome.ok)?.status).toBe(503);
  });
});
