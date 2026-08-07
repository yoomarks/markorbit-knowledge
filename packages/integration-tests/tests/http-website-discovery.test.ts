import { describe, expect, it } from "vitest";
import { HttpWebsiteDiscoveryProvider } from "@markorbit/worker-runtime";

function htmlResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

describe("http website discovery", () => {
  it("discovers same-host links, normalizes duplicates and follows bounded depth", async () => {
    const pages = new Map<string, string>([
      [
        "https://example.test/",
        [
          '<a href="/trademarks/?utm_source=newsletter">Trademarks</a>',
          '<a href="/trademarks">Duplicate</a>',
          '<a href="/guides/manual.pdf">Manual</a>',
          '<a href="https://outside.test/article">External</a>',
        ].join(""),
      ],
      [
        "https://example.test/trademarks",
        '<a href="/trademarks/apply#start">Apply</a><a href="mailto:hello@example.test">Mail</a>',
      ],
    ]);

    const fetcher = (async (input: string | URL | Request) => {
      const locator = typeof input === "string" ? input : input.toString();
      const body = pages.get(locator);
      return body === undefined
        ? new Response("not found", { status: 404 })
        : htmlResponse(body);
    }) as typeof globalThis.fetch;

    const provider = new HttpWebsiteDiscoveryProvider(fetcher);
    const result = await provider.discover({
      batchId: "batch_test",
      createdAt: "2026-08-08T00:00:00Z",
      seeds: [{ seedId: "seed_test", locator: "https://example.test/" }],
      constraints: {
        maxDepth: 2,
        maxCandidates: 20,
        sameHostOnly: true,
      },
    });

    expect(result.map((candidate) => candidate.locator)).toEqual([
      "https://example.test/trademarks",
      "https://example.test/guides/manual.pdf",
      "https://example.test/trademarks/apply",
    ]);
    expect(result[0]).toMatchObject({
      status: "DISCOVERED",
      discoveryMethod: "HTML_LINK",
      depth: 1,
      discoveredFrom: "https://example.test/",
    });
    expect(result[2]).toMatchObject({ depth: 2 });
  });

  it("respects denied URL patterns and candidate budgets", async () => {
    const fetcher = (async () =>
      htmlResponse(
        '<a href="/news/1">One</a><a href="/careers">Careers</a><a href="/news/2">Two</a>',
      )) as typeof globalThis.fetch;

    const provider = new HttpWebsiteDiscoveryProvider(fetcher);
    const result = await provider.discover({
      batchId: "batch_budget",
      createdAt: "2026-08-08T00:00:00Z",
      seeds: [{ seedId: "seed_budget", locator: "https://example.test/" }],
      constraints: {
        maxDepth: 1,
        maxCandidates: 1,
        deniedUrlPatterns: ["/careers"],
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.locator).toBe("https://example.test/news/1");
  });
});
