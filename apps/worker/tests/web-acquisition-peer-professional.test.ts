import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWebAcquisitionCampaignManifest } from "../src/web-acquisition-campaign";

const manifestPath = new URL(
  "../../../config/web-acquisition-peer-professional-v1.json",
  import.meta.url,
);

const expectedKeys = [
  "bird-brandwrites",
  "dehns",
  "finnegan-incontestable",
  "fross-zelnick",
  "hgf",
  "marks-clerk",
  "mewburn-ellis",
  "rouse",
  "spruson-ferguson",
  "taylor-wessing",
];

describe("peer-professional web acquisition cohort", () => {
  it("keeps the initial cohort explicit, bounded and lower-authority", () => {
    const parsed = parseWebAcquisitionCampaignManifest(
      JSON.parse(readFileSync(manifestPath, "utf8")),
    );

    expect(parsed.campaignId).toBe("peer-professional-v1");
    expect(parsed.globalConcurrency).toBeLessThanOrEqual(4);
    expect(parsed.sources).toHaveLength(10);
    expect(parsed.sources.map((source) => source.key).sort()).toEqual(expectedKeys);
    expect(new Set(parsed.sources.map((source) => new URL(source.baseUrl).hostname)).size).toBe(10);

    for (const source of parsed.sources) {
      expect(source.sourceClass).toBe("PEER_PROFESSIONAL");
      expect(source.discovery.mode).toBe("LINK_CRAWL");
      expect(source.maxPages).toBeLessThanOrEqual(50);
      expect(source.maxDepth).toBeLessThanOrEqual(2);
      expect(source.rateLimitPerMinute).toBeLessThanOrEqual(12);
      expect(source.refreshIntervalSeconds).toBe(7 * 24 * 60 * 60);
      expect(source.adaptiveRefreshCadence).toBe(true);
      expect(source.renderJavascript).toBe(false);
      expect(source.jurisdictions.length).toBeGreaterThan(0);
      expect(source.languages).toContain("en");
    }

    const boundedPageBudget = parsed.sources.reduce((sum, source) => sum + source.maxPages, 0);
    expect(boundedPageBudget).toBe(500);
  });
});
