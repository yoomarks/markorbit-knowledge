import { describe, expect, it } from "vitest";
import { acquireIpAustraliaManualCorpus } from "./ip-australia-manual-full-acquisition";

const article = (title: string) => `
<html><body>
<main>
<h1>${title}</h1>
<p>Date Published 19 Aug 2026</p>
<p>This article contains enough substantive official practice content to exceed the minimum fidelity threshold while preserving the controlled source evidence for acquisition testing. It includes procedure, requirements, timing and documentary guidance.</p>
<h2>Amended Reasons</h2>
<table><tr><th>Amended Reason</th><th>Date Amended</th></tr><tr><td>Updated practice.</td><td>19 Aug 2026</td></tr></table>
</main>
<footer>This document is controlled. Its accuracy can only be guaranteed when viewed electronically.</footer>
</body></html>`;

function manualRoot(): string {
  return `
    <nav>
      <a href="/trademark/article-a">Article A</a>
      <a href="/trademark/article-b">Article B</a>
    </nav>
    <section><h2>Recent updates</h2>
      <a href="/trademark/article-a">Article A</a>
    </section>`;
}

describe("IP Australia full Manual acquisition", () => {
  it("acquires every inventoried article with evidence fields and content hashes", async () => {
    const fetcher: typeof fetch = async (input) => {
      const uri = String(input);
      if (uri === "https://manuals.ipaustralia.gov.au/trademark") {
        return new Response(manualRoot(), {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (uri.endsWith("article-a"))
        return new Response(article("Article A"), {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      if (uri.endsWith("article-b"))
        return new Response(article("Article B"), {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      return new Response("missing", { status: 404 });
    };

    const report = await acquireIpAustraliaManualCorpus(fetcher, {
      concurrency: 2,
      interBatchDelayMs: 0,
    });

    expect(report.inventoryPageCount).toBe(2);
    expect(report.acquiredPageCount).toBe(2);
    expect(report.failedPageCount).toBe(0);
    expect(report.pagesWithPublishedDateCount).toBe(2);
    expect(report.pagesWithControlledNoticeCount).toBe(2);
    expect(report.pages.every((page) => page.contentSha256?.length === 64)).toBe(true);
  });

  it("keeps one failed article visible without losing successful corpus evidence", async () => {
    const fetcher: typeof fetch = async (input) => {
      const uri = String(input);
      if (uri === "https://manuals.ipaustralia.gov.au/trademark") {
        return new Response(manualRoot(), {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (uri.endsWith("article-a"))
        return new Response(article("Article A"), {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      return new Response("unavailable", { status: 503 });
    };

    const report = await acquireIpAustraliaManualCorpus(fetcher, {
      concurrency: 2,
      interBatchDelayMs: 0,
    });

    expect(report.acquiredPageCount).toBe(1);
    expect(report.failedPageCount).toBe(1);
    expect(report.pages.find((page) => !page.ok)?.status).toBe(503);
  });
});
