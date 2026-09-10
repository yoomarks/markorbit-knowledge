import { describe, expect, it } from "vitest";
import { parseWebAcquisitionCampaignManifest } from "../src/web-acquisition-campaign";
import {
  OFFICIAL_SCALE_DOMAIN_COUNT,
  buildOfficialScaleCampaignManifest,
} from "../src/web-acquisition-official-scale-campaign";

const WORKSPACE = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";

describe("official 50+ domain campaign builder", () => {
  it("deterministically selects 60 governed hosts and jurisdictions", () => {
    const first = buildOfficialScaleCampaignManifest(WORKSPACE);
    const second = buildOfficialScaleCampaignManifest(WORKSPACE);

    expect(first).toEqual(second);
    expect(first.sources).toHaveLength(OFFICIAL_SCALE_DOMAIN_COUNT);
    expect(new Set(first.sources.map((source) => source.jurisdictions[0])).size).toBe(
      OFFICIAL_SCALE_DOMAIN_COUNT,
    );
    expect(new Set(first.sources.map((source) => new URL(source.baseUrl).hostname)).size).toBe(
      OFFICIAL_SCALE_DOMAIN_COUNT,
    );
    expect(first.globalConcurrency).toBe(8);
  });

  it("keeps every scale source on one exact governed official URL", () => {
    const manifest = buildOfficialScaleCampaignManifest(WORKSPACE);
    const parsed = parseWebAcquisitionCampaignManifest(manifest);

    for (const source of parsed.sources) {
      expect(source.sourceClass).toBe("OFFICIAL_AUTHORITY");
      expect(source.discovery.mode).toBe("EXACT_URL_LIST");
      expect(source.discovery.exactUrls).toEqual([source.baseUrl]);
      expect(source.maxPages).toBe(1);
      expect(source.maxDepth).toBe(0);
      expect(source.renderJavascript).toBe(false);
      expect(source.allowedHosts).toEqual([new URL(source.baseUrl).hostname]);
    }
  });

  it("fails closed without a workspace or outside the governed 50..100 scale envelope", () => {
    expect(() => buildOfficialScaleCampaignManifest(" ")).toThrow(/workspaceId is required/);
    expect(() => buildOfficialScaleCampaignManifest(WORKSPACE, 49)).toThrow(/50\.\.100/);
    expect(() => buildOfficialScaleCampaignManifest(WORKSPACE, 101)).toThrow(/50\.\.100/);
  });
});
