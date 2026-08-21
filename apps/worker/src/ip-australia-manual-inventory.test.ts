import { describe, expect, it } from "vitest";
import {
  inventoryIpAustraliaManual,
  parseIpAustraliaManualScreen,
} from "./ip-australia-manual-inventory";

function response(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

describe("IP Australia trademark manual inventory", () => {
  it("separates the current manual navigation from Recent updates history", () => {
    const parsed = parseIpAustraliaManualScreen(
      `
        <nav>
          <a href="/trademark/1.-definition-of-a-trade-mark">Definition</a>
          <a href="/trademark/relevant-legislation35">Part 44 landing page</a>
        </nav>
        <h1>Recent updates</h1>
        <a href="/trademark/2.-data-capture">Data capture</a>
        <a href="/trademark?page=1">2</a>
        <a href="/trademark?page=33">Last page</a>
        <a href="https://example.com/trademark/outside">Outside</a>
      `,
      "https://manuals.ipaustralia.gov.au/trademark",
    );

    expect(parsed.highestUpdateHistoryPage).toBe(33);
    expect(parsed.navigationPages.map((page) => page.label).sort()).toEqual([
      "Definition",
      "Part 44 landing page",
    ]);
    expect(parsed.updatePages.map((page) => page.label)).toEqual(["Data capture"]);
  });

  it("walks update history without mistaking the repeated navigation tree for history", async () => {
    const requested: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const uri = String(input);
      requested.push(uri);
      if (uri.endsWith("?page=2")) return response("", 503);
      if (uri.endsWith("?page=1")) {
        return response(`
          <nav>
            <a href="/trademark/1.-definition-of-a-trade-mark">Definition</a>
          </nav>
          <h1>Recent updates</h1>
          <a href="/trademark/3.-historic-only">Historic only</a>
        `);
      }
      return response(`
        <nav>
          <a href="/trademark/1.-definition-of-a-trade-mark">Definition</a>
          <a href="/trademark/2.-data-capture">Data capture</a>
        </nav>
        <h1>Recent updates</h1>
        <a href="/trademark/2.-data-capture">Data capture</a>
        <a href="/trademark?page=1">2</a>
        <a href="/trademark?page=2">Last page</a>
      `);
    };

    const report = await inventoryIpAustraliaManual(fetcher);

    expect(requested).toHaveLength(3);
    expect(report.updateHistoryPageCount).toBe(3);
    expect(report.successfulUpdateHistoryPageCount).toBe(2);
    expect(report.failedUpdateHistoryPageCount).toBe(1);
    expect(report.currentNavigationPageCount).toBe(2);
    expect(report.updateHistoryOnlyPageCount).toBe(1);
    expect(report.totalUniqueManualPageCount).toBe(3);
    expect(report.pages.find((page) => page.label === "Data capture")?.currentNavigation).toBe(
      true,
    );
    expect(report.pages.find((page) => page.label === "Data capture")?.updateHistoryPages).toEqual([
      0,
    ]);
    expect(report.pages.find((page) => page.label === "Historic only")?.currentNavigation).toBe(
      false,
    );
    expect(report.pages.find((page) => page.label === "Historic only")?.updateHistoryPages).toEqual(
      [1],
    );
  });
});
