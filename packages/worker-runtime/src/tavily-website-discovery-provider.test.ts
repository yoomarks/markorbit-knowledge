import type { SourceDiscoveryBatch } from "@markorbit/contracts";
import { describe, expect, it } from "vitest";
import { TavilyDiscoveryError, TavilyWebsiteDiscoveryProvider } from "./tavily-website-discovery-provider";

function batch(overrides: Partial<SourceDiscoveryBatch> = {}): SourceDiscoveryBatch {
  return {
    batchId: "batch-1",
    seeds: [
      {
        seedId: "seed-1",
        locator: "https://example.gov/trademarks/fees",
        metadata: { discoveryQuery: "official trademark fee schedule" },
      },
    ],
    createdAt: "2026-08-28T00:00:00.000Z",
    constraints: { maxCandidates: 5, maxFetches: 1, sameHostOnly: true },
    ...overrides,
  };
}

describe("TavilyWebsiteDiscoveryProvider", () => {
  it("maps only structural search results and disables answer/content extras", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const provider = new TavilyWebsiteDiscoveryProvider({
      apiToken: "test-token",
      now: () => new Date("2026-08-28T01:02:03.000Z"),
      fetcher: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            results: [
              {
                url: "https://example.gov/trademarks/new-fees#section",
                title: "New fees",
                score: 0.999,
                content: "provider text must not enter candidate metadata",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    const result = await provider.discover(batch());

    expect(requestBody).toMatchObject({
      query: "official trademark fee schedule",
      search_depth: "basic",
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
      auto_parameters: false,
      include_domains: ["example.gov"],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      locator: "https://example.gov/trademarks/new-fees",
      title: "New fees",
      status: "DISCOVERED",
      discoveryMethod: "RELATED_SOURCE",
      discoveredFrom: "https://example.gov/trademarks/fees",
      depth: 1,
      metadata: {
        kind: "search_result",
        provider: "tavily",
        seedId: "seed-1",
        host: "example.gov",
      },
    });
    expect(result[0]?.metadata).not.toHaveProperty("score");
    expect(result[0]?.metadata).not.toHaveProperty("content");
  });

  it("filters cross-host and denied candidates under governed constraints", async () => {
    const provider = new TavilyWebsiteDiscoveryProvider({
      apiToken: "test-token",
      fetcher: async () =>
        new Response(
          JSON.stringify({
            results: [
              { url: "https://other.example/page", title: "Other" },
              { url: "https://example.gov/private/page", title: "Denied" },
              { url: "https://example.gov/public/page", title: "Allowed" },
            ],
          }),
          { status: 200 },
        ),
    });

    const result = await provider.discover(
      batch({
        constraints: {
          maxCandidates: 10,
          maxFetches: 1,
          sameHostOnly: true,
          deniedUrlPatterns: ["/private/"],
        },
      }),
    );

    expect(result.map((item) => item.locator)).toEqual(["https://example.gov/public/page"]);
  });

  it("fails closed on quota/payment boundaries without provider-layer retry", async () => {
    let calls = 0;
    const provider = new TavilyWebsiteDiscoveryProvider({
      apiToken: "test-token",
      fetcher: async () => {
        calls += 1;
        return new Response("quota", { status: 432 });
      },
    });

    await expect(provider.discover(batch())).rejects.toMatchObject<TavilyDiscoveryError>({
      code: "TAVILY_QUOTA_OR_PAYMENT_REQUIRED",
      retryable: false,
    });
    expect(calls).toBe(1);
  });

  it("treats unknown request delivery as non-replayable", async () => {
    let calls = 0;
    const provider = new TavilyWebsiteDiscoveryProvider({
      apiToken: "test-token",
      fetcher: async () => {
        calls += 1;
        throw new Error("socket reset");
      },
    });

    await expect(provider.discover(batch())).rejects.toMatchObject<TavilyDiscoveryError>({
      code: "TAVILY_DELIVERY_UNKNOWN",
      retryable: false,
    });
    expect(calls).toBe(1);
  });
});
