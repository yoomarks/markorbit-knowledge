import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  discoverWebAcquisitionInventory,
  parseWebAcquisitionCampaignManifest,
} from "../src/web-acquisition-campaign";

const manifestPath = new URL(
  "../../../config/web-acquisition-official-core-v1.json",
  import.meta.url,
);

const fallbackDepth3 = new Set([
  "cnipa",
  "wipo",
  "euipo",
  "jpo",
  "kipo",
  "cipo",
  "ip-australia",
  "ip-india",
  "inpi-br",
  "uae-moet",
]);

describe("official-core web acquisition capacity", () => {
  it("keeps the governed 14-minute wave capable of exceeding the 1000-page gate", () => {
    const parsed = parseWebAcquisitionCampaignManifest(
      JSON.parse(readFileSync(manifestPath, "utf8")),
    );
    expect(parsed.sources).toHaveLength(13);
    expect(parsed.sources.find((source) => source.key === "kipo")?.baseUrl).toBe(
      "https://www.kipo.go.kr/en/HtmlApp?c=93000&catmenu=ek04_01_01",
    );
    const reachableBudget = parsed.sources.reduce(
      (sum, source) => sum + Math.min(source.maxPages, source.rateLimitPerMinute * 14),
      0,
    );
    expect(reachableBudget).toBeGreaterThanOrEqual(3_000);
    for (const source of parsed.sources) {
      expect(source.maxPages).toBeLessThanOrEqual(source.rateLimitPerMinute * 14);
      expect(source.adaptiveRefreshCadence).toBe(true);
      if (fallbackDepth3.has(source.key)) expect(source.maxDepth).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps redesigned CNIPA public routes eligible without admitting protected service hosts", async () => {
    const parsed = parseWebAcquisitionCampaignManifest(
      JSON.parse(readFileSync(manifestPath, "utf8")),
    );
    const cnipa = parsed.sources.find((source) => source.key === "cnipa");
    expect(cnipa).toMatchObject({
      baseUrl: "https://sbj.cnipa.gov.cn/",
      includePatterns: ["https://sbj.cnipa.gov.cn/*"],
    });
    if (!cnipa) throw new Error("CNIPA source is missing from official-core manifest");

    const publicUrls = [
      "https://sbj.cnipa.gov.cn/trademark-query",
      "https://sbj.cnipa.gov.cn/notice/2026/0913/2000000038.html",
      "https://sbj.cnipa.gov.cn/gzdt/2026/0915/2000000046.html",
      "https://sbj.cnipa.gov.cn/shbsj/2026/0910/54050.html",
      "https://sbj.cnipa.gov.cn/cjwt/2026/0829/20097.html",
    ];
    const protectedUrls = [
      "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/",
      "https://sso.cnipa.gov.cn/oauth2/authorize",
      "https://toas.sbj.cnipa.gov.cn/toas-extra-prod/",
      "https://wcjs.sbj.cnipa.gov.cn/",
    ];
    const inventory = await discoverWebAcquisitionInventory({
      ...cnipa,
      discovery: { mode: "EXACT_URL_LIST", exactUrls: [...publicUrls, ...protectedUrls] },
    });

    expect(inventory.eligibleCount).toBe(publicUrls.length);
    expect(new Set(inventory.selectedUrls)).toEqual(new Set(publicUrls));
  });
});
