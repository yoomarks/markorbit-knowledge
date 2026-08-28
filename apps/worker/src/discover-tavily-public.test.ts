import { describe, expect, it } from "vitest";
import { buildTavilyDiscoveryBatch } from "./discover-tavily-public";

describe("buildTavilyDiscoveryBatch", () => {
  it("builds one same-host seed with a one-request provider budget", () => {
    const batch = buildTavilyDiscoveryBatch(
      {
        TAVILY_DISCOVERY_SEED_URL: "https://www.uspto.gov/trademarks/fees-payment-information",
        TAVILY_DISCOVERY_QUERY: "USPTO trademark fee schedule",
        TAVILY_DISCOVERY_MAX_CANDIDATES: "7",
      },
      new Date("2026-08-28T09:00:00.000Z"),
    );

    expect(batch).toMatchObject({
      seeds: [
        {
          seedId: "tavily-seed-1",
          locator: "https://www.uspto.gov/trademarks/fees-payment-information",
          metadata: { discoveryQuery: "USPTO trademark fee schedule" },
        },
      ],
      createdAt: "2026-08-28T09:00:00.000Z",
      constraints: {
        maxCandidates: 7,
        maxFetches: 1,
        sameHostOnly: true,
      },
    });
  });

  it("defaults to five candidates and rejects an oversized local budget", () => {
    expect(
      buildTavilyDiscoveryBatch({
        TAVILY_DISCOVERY_SEED_URL: "https://example.gov/fees",
        TAVILY_DISCOVERY_QUERY: "official fees",
      }).constraints.maxCandidates,
    ).toBe(5);

    expect(() =>
      buildTavilyDiscoveryBatch({
        TAVILY_DISCOVERY_SEED_URL: "https://example.gov/fees",
        TAVILY_DISCOVERY_QUERY: "official fees",
        TAVILY_DISCOVERY_MAX_CANDIDATES: "21",
      }),
    ).toThrow("TAVILY_DISCOVERY_MAX_CANDIDATES must be an integer between 1 and 20");
  });

  it("fails closed for missing query or non-http seeds", () => {
    expect(() =>
      buildTavilyDiscoveryBatch({
        TAVILY_DISCOVERY_SEED_URL: "https://example.gov/fees",
      }),
    ).toThrow("TAVILY_DISCOVERY_QUERY is required");

    expect(() =>
      buildTavilyDiscoveryBatch({
        TAVILY_DISCOVERY_SEED_URL: "file:///tmp/source",
        TAVILY_DISCOVERY_QUERY: "official fees",
      }),
    ).toThrow("TAVILY_DISCOVERY_SEED_URL must use http or https");
  });
});
