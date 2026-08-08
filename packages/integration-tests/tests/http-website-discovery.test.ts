import { describe, expect, it } from "vitest";
import { HttpWebsiteDiscoveryProvider } from "@markorbit/worker-runtime";

function response(body: string, contentType: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": contentType },
  });
}

function htmlResponse(body: string) {
  return response(body, "text/html; charset=utf-8");
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
      return body === undefined ? new Response("not found", { status: 404 }) : htmlResponse(body);
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
      metadata: { robotsAllowed: true },
    });
    expect(result[2]).toMatchObject({ depth: 2 });
  });

  it("respects denied URL patterns and candidate budgets", async () => {
    const fetcher = (async (input: string | URL | Request) => {
      const locator = typeof input === "string" ? input : input.toString();
      if (locator.endsWith("/robots.txt")) return new Response("not found", { status: 404 });
      return htmlResponse(
        '<a href="/news/1">One</a><a href="/careers">Careers</a><a href="/news/2">Two</a>',
      );
    }) as typeof globalThis.fetch;

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

  it("uses robots and sitemap indexes to discover structure without crawling blocked pages", async () => {
    const requested: string[] = [];
    const pages = new Map<string, { body: string; contentType: string }>([
      [
        "https://example.test/robots.txt",
        {
          body: [
            "User-agent: *",
            "Disallow: /private",
            "Sitemap: https://example.test/sitemap-index.xml",
          ].join("\n"),
          contentType: "text/plain",
        },
      ],
      [
        "https://example.test/",
        {
          body: '<a href="/about">About</a><a href="/private/from-nav">Private</a>',
          contentType: "text/html",
        },
      ],
      [
        "https://example.test/sitemap-index.xml",
        {
          body: [
            "<sitemapindex>",
            "<sitemap><loc>https://example.test/sitemap-trademarks.xml</loc></sitemap>",
            "<sitemap><loc>https://outside.test/sitemap.xml</loc></sitemap>",
            "</sitemapindex>",
          ].join(""),
          contentType: "application/xml",
        },
      ],
      [
        "https://example.test/sitemap-trademarks.xml",
        {
          body: [
            "<urlset>",
            "<url><loc>https://example.test/trademarks</loc></url>",
            "<url><loc>https://example.test/private/official</loc></url>",
            "</urlset>",
          ].join(""),
          contentType: "application/xml",
        },
      ],
      [
        "https://example.test/about",
        {
          body: '<a href="/about/team">Team</a>',
          contentType: "text/html",
        },
      ],
      [
        "https://example.test/trademarks",
        {
          body: '<a href="/trademarks/apply?b=2&utm_source=x&a=1">Apply</a>',
          contentType: "text/html",
        },
      ],
    ]);

    const fetcher = (async (input: string | URL | Request) => {
      const locator = typeof input === "string" ? input : input.toString();
      requested.push(locator);
      const page = pages.get(locator);
      return page
        ? response(page.body, page.contentType)
        : new Response("not found", { status: 404 });
    }) as typeof globalThis.fetch;

    const provider = new HttpWebsiteDiscoveryProvider(fetcher);
    const result = await provider.discover({
      batchId: "batch_structural",
      createdAt: "2026-08-08T00:00:00Z",
      seeds: [{ seedId: "seed_structural", locator: "https://example.test/" }],
      constraints: {
        maxDepth: 2,
        maxCandidates: 20,
        maxFetches: 20,
        sameHostOnly: true,
        respectRobots: true,
        discoverSitemaps: true,
      },
    });

    expect(result.map((candidate) => candidate.locator)).toEqual([
      "https://example.test/about",
      "https://example.test/private/from-nav",
      "https://example.test/trademarks",
      "https://example.test/private/official",
      "https://example.test/about/team",
      "https://example.test/trademarks/apply?a=1&b=2",
    ]);
    expect(result.find((candidate) => candidate.locator.endsWith("/trademarks"))).toMatchObject({
      discoveryMethod: "SITEMAP",
      discoveredFrom: "https://example.test/sitemap-trademarks.xml",
      depth: 1,
      metadata: { robotsAllowed: true },
    });
    expect(
      result.find((candidate) => candidate.locator.endsWith("/private/official")),
    ).toMatchObject({
      discoveryMethod: "SITEMAP",
      metadata: { robotsAllowed: false },
    });
    expect(requested).not.toContain("https://example.test/private/from-nav");
    expect(requested).not.toContain("https://example.test/private/official");
    expect(requested).not.toContain("https://outside.test/sitemap.xml");
  });

  it("probes the conventional sitemap when robots does not declare one", async () => {
    const fetcher = (async (input: string | URL | Request) => {
      const locator = typeof input === "string" ? input : input.toString();
      if (locator === "https://example.test/robots.txt") {
        return response("User-agent: *\nDisallow:", "text/plain");
      }
      if (locator === "https://example.test/") return htmlResponse("");
      if (locator === "https://example.test/sitemap.xml") {
        return response(
          "<urlset><url><loc>https://example.test/trademark-guides</loc></url></urlset>",
          "application/xml",
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof globalThis.fetch;

    const provider = new HttpWebsiteDiscoveryProvider(fetcher);
    const result = await provider.discover({
      batchId: "batch_default_sitemap",
      createdAt: "2026-08-08T00:00:00Z",
      seeds: [{ seedId: "seed_default_sitemap", locator: "https://example.test/" }],
      constraints: { maxDepth: 1, maxCandidates: 10 },
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      locator: "https://example.test/trademark-guides",
      discoveryMethod: "SITEMAP",
      discoveredFrom: "https://example.test/sitemap.xml",
    });
  });

  it("falls back to the governed seed when a site exposes no reviewable structure", async () => {
    const requested: string[] = [];
    const fetcher = (async (input: string | URL | Request) => {
      const locator = typeof input === "string" ? input : input.toString();
      requested.push(locator);
      return new Response("forbidden", { status: 403 });
    }) as typeof globalThis.fetch;

    const provider = new HttpWebsiteDiscoveryProvider(fetcher);
    const result = await provider.discover({
      batchId: "batch_seed_fallback",
      createdAt: "2026-08-08T00:00:00Z",
      seeds: [
        {
          seedId: "seed_euipo",
          locator: "https://www.euipo.europa.eu/en/trade-marks/how-to-apply",
        },
      ],
      constraints: {
        maxDepth: 1,
        maxCandidates: 10,
        maxFetches: 8,
        sameHostOnly: true,
        respectRobots: true,
        discoverSitemaps: true,
      },
    });

    expect(requested).toEqual([
      "https://www.euipo.europa.eu/robots.txt",
      "https://www.euipo.europa.eu/en/trade-marks/how-to-apply",
      "https://www.euipo.europa.eu/sitemap.xml",
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      locator: "https://www.euipo.europa.eu/en/trade-marks/how-to-apply",
      status: "DISCOVERED",
      discoveryMethod: "SEED",
      depth: 0,
      metadata: {
        seedFallback: true,
        fallbackReason: "NO_REVIEWABLE_STRUCTURE",
      },
    });
  });

  it("bounds network work independently from candidate count", async () => {
    const requested: string[] = [];
    const fetcher = (async (input: string | URL | Request) => {
      const locator = typeof input === "string" ? input : input.toString();
      requested.push(locator);
      if (locator.endsWith("/robots.txt")) return response("User-agent: *", "text/plain");
      return htmlResponse('<a href="/one">One</a><a href="/two">Two</a>');
    }) as typeof globalThis.fetch;

    const provider = new HttpWebsiteDiscoveryProvider(fetcher);
    const result = await provider.discover({
      batchId: "batch_fetch_budget",
      createdAt: "2026-08-08T00:00:00Z",
      seeds: [{ seedId: "seed_fetch_budget", locator: "https://example.test/" }],
      constraints: {
        maxDepth: 2,
        maxCandidates: 100,
        maxFetches: 2,
      },
    });

    expect(requested).toEqual(["https://example.test/robots.txt", "https://example.test/"]);
    expect(result.map((candidate) => candidate.locator)).toEqual([
      "https://example.test/one",
      "https://example.test/two",
    ]);
  });
});
