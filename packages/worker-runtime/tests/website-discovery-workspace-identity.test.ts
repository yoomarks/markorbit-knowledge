import { describe, expect, it } from "vitest";
import type { SourceDiscoveryBatch } from "@markorbit/contracts";
import { HttpWebsiteDiscoveryProvider } from "../src/http-website-discovery-provider";
import { TavilyWebsiteDiscoveryProvider } from "../src/tavily-website-discovery-provider";

function batch(workspaceId: string): SourceDiscoveryBatch {
  return {
    batchId: `disc_${workspaceId}`,
    workspaceId,
    createdAt: "2026-09-13T00:00:00.000Z",
    seeds: [{ seedId: `seed_${workspaceId}`, locator: "https://same.example.com/" }],
    constraints: {
      maxDepth: 1,
      maxCandidates: 5,
      maxFetches: 5,
      respectRobots: false,
      discoverSitemaps: false,
    },
  };
}

describe("workspace-scoped website discovery candidate identity", () => {
  it("scopes HTTP deterministic IDs by workspace", async () => {
    const fetcher: typeof fetch = async () =>
      new Response("<html><body>No links</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    const provider = new HttpWebsiteDiscoveryProvider(fetcher);
    const firstA = await provider.discover(batch("wksp_A"));
    const secondA = await provider.discover(batch("wksp_A"));
    const firstB = await provider.discover(batch("wksp_B"));

    expect(firstA).toHaveLength(1);
    expect(firstA[0]?.candidateId).toBe(secondA[0]?.candidateId);
    expect(firstA[0]?.candidateId).not.toBe(firstB[0]?.candidateId);
  });

  it("scopes Tavily deterministic IDs by workspace", async () => {
    const fetcher = async () =>
      new Response(JSON.stringify({ results: [{ url: "https://same.example.com/trademarks" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const provider = new TavilyWebsiteDiscoveryProvider({
      apiToken: "test-token",
      fetcher,
      now: () => new Date("2026-09-13T00:00:00.000Z"),
    });
    const firstA = await provider.discover(batch("wksp_A"));
    const secondA = await provider.discover(batch("wksp_A"));
    const firstB = await provider.discover(batch("wksp_B"));

    expect(firstA).toHaveLength(1);
    expect(firstA[0]?.candidateId).toBe(secondA[0]?.candidateId);
    expect(firstA[0]?.candidateId).not.toBe(firstB[0]?.candidateId);
  });
});
