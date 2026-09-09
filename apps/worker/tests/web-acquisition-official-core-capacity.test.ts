import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWebAcquisitionCampaignManifest } from "../src/web-acquisition-campaign";

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
      if (fallbackDepth3.has(source.key)) expect(source.maxDepth).toBeGreaterThanOrEqual(3);
    }
  });
});
