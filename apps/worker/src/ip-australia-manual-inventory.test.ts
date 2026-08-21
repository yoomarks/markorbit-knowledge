import { describe, expect, it } from "vitest";
import {
  inventoryIpAustraliaManual,
  parseIpAustraliaManualListing,
} from "./ip-australia-manual-inventory";

function response(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

describe("IP Australia trademark manual inventory", () => {
  it("separates manual article links from pagination and external links", () => {
    const parsed = parseIpAustraliaManualListing(
      `
        <a href="/trademark?page=1">2</a>
        <a href="/trademark?page=33">Last page</a>
        <a href="/trademark/1.-definition-of-a-trade-mark">Definition</a>
        <a href="/trademark/relevant-legislation35">Part 44 landing page</a>
        <a href="https://example.com/trademark/outside">Outside</a>
      `,
      "https://manuals.ipaustralia.gov.au/trademark",
    );

    expect(parsed.highestListingPage).toBe(33);
    expect(parsed.pages.map((page) => page.label).sort()).toEqual([
      "Definition",
      "Part 44 landing page",
    ]);
  });

  it("walks every observed listing page and deduplicates repeated article references", async () => {
    const requested: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const uri = String(input);
      requested.push(uri);
      if (uri.endsWith("?page=2")) return response("", 503);
      if (uri.endsWith("?page=1")) {
        return response(`
          <a href="/trademark/1.-definition-of-a-trade-mark">Definition</a>
          <a href="/trademark/2.-data-capture">Data capture</a>
        `);
      }
      return response(`
        <a href="/trademark?page=1">2</a>
        <a href="/trademark?page=2">Last page</a>
        <a href="/trademark/1.-definition-of-a-trade-mark">Definition</a>
      `);
    };

    const report = await inventoryIpAustraliaManual(fetcher);

    expect(requested).toHaveLength(3);
    expect(report.listingPageCount).toBe(3);
    expect(report.successfulListingPageCount).toBe(2);
    expect(report.failedListingPageCount).toBe(1);
    expect(report.uniqueManualPageCount).toBe(2);
    expect(report.duplicateReferenceCount).toBe(1);
    expect(report.pages.find((page) => page.label === "Definition")?.listingPages).toEqual([0, 1]);
  });
});
