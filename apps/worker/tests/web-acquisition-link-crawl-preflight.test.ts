import { describe, expect, it, vi } from "vitest";
import {
  assertWebAcquisitionPreflightInventories,
  discoverWebAcquisitionPreflightInventory,
  type WebAcquisitionCampaignSourceV1,
} from "../src/web-acquisition-campaign";

function linkSource(includePatterns: string[]): WebAcquisitionCampaignSourceV1 {
  return {
    key: "redesigned-site",
    name: "Redesigned Site",
    sourceClass: "OFFICIAL_AUTHORITY",
    jurisdictions: ["CN"],
    languages: ["zh-CN"],
    baseUrl: "https://example.test/",
    discovery: { mode: "LINK_CRAWL" },
    includePatterns,
    excludePatterns: [],
    maxPages: 10,
    maxDepth: 2,
    rateLimitPerMinute: 30,
    renderJavascript: false,
  };
}

function htmlFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === "https://example.test/robots.txt") {
      return new Response("User-agent: *\nAllow: /\n", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }
    if (url === "https://example.test/") {
      return new Response(
        '<a href="/trademark-query">Query</a><a href="/notice/latest">Notice</a>',
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("LINK_CRAWL discover-only preflight", () => {
  it("fails closed when discovered child routes are excluded by stale policy", async () => {
    const inventory = await discoverWebAcquisitionPreflightInventory(
      linkSource(["https://example.test/legacy/*"]),
      htmlFetch(),
    );
    expect(inventory.discoveredCount).toBe(2);
    expect(inventory.catalogCount).toBe(2);
    expect(inventory.eligibleCount).toBe(0);
    expect(inventory.excludedCount).toBe(2);
    expect(inventory.errors).toContain("link-crawl-preflight:no-eligible-child-links");
    expect(() => assertWebAcquisitionPreflightInventories([inventory])).toThrow(
      /no eligible child coverage/u,
    );
  });

  it("passes when the production policy admits redesigned child routes", async () => {
    const inventory = await discoverWebAcquisitionPreflightInventory(
      linkSource(["https://example.test/*"]),
      htmlFetch(),
    );

    expect(inventory.discoveredCount).toBe(2);
    expect(inventory.eligibleCount).toBe(2);
    expect(inventory.selectedUrls).toEqual([
      "https://example.test/trademark-query",
      "https://example.test/notice/latest",
    ]);
    expect(() => assertWebAcquisitionPreflightInventories([inventory])).not.toThrow();
  });

  it("preserves exact-list preflight semantics", async () => {
    const source: WebAcquisitionCampaignSourceV1 = {
      ...linkSource(["https://example.test/*"]),
      discovery: {
        mode: "EXACT_URL_LIST",
        exactUrls: ["https://example.test/trademark-query"],
      },
    };
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const inventory = await discoverWebAcquisitionPreflightInventory(source, fetchImpl);

    expect(inventory.modeUsed).toBe("EXACT_URL_LIST");
    expect(inventory.eligibleCount).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(() => assertWebAcquisitionPreflightInventories([inventory])).not.toThrow();
  });
});
