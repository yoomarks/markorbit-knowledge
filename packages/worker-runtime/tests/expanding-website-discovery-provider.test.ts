import { describe, expect, it, vi } from "vitest";
import type { SourceCandidate } from "@markorbit/contracts";
import { ExpandingWebsiteDiscoveryProvider, type SourceDiscoveryProvider } from "../src/index";

function candidate(
  candidateId: string,
  locator: string,
  seedLocator: string,
  metadata: Record<string, unknown> = {},
): SourceCandidate {
  return {
    candidateId,
    locator,
    discoveredAt: "2026-08-12T16:10:00.000Z",
    status: "DISCOVERED",
    discoveredFrom: seedLocator,
    discoveryMethod: "HTML_LINK",
    depth: 1,
    metadata,
  };
}

describe("ExpandingWebsiteDiscoveryProvider", () => {
  it("reserves the existing budgets and emits only one-hop external candidates", async () => {
    const seedLocator = "https://example.test/";
    const primaryDiscover = vi.fn(async () => [
      candidate("cand_primary", "https://example.test/internal", seedLocator, {
        kind: "PAGE",
        robotsAllowed: true,
      }),
    ]);
    const externalDiscover = vi.fn(async () => [
      candidate("cand_duplicate", "https://example.test/internal", seedLocator, {
        kind: "PAGE",
        robotsAllowed: true,
      }),
      candidate("cand_external_a", "https://outside.test/article", seedLocator, {
        kind: "PAGE",
        host: "outside.test",
        robotsAllowed: false,
      }),
      candidate("cand_external_b", "https://docs.test/guide.pdf", seedLocator, {
        kind: "DOCUMENT",
        host: "docs.test",
        robotsAllowed: true,
      }),
    ]);
    const primary: SourceDiscoveryProvider = { discover: primaryDiscover };
    const external: SourceDiscoveryProvider = { discover: externalDiscover };
    const provider = new ExpandingWebsiteDiscoveryProvider(primary, external);

    const result = await provider.discover({
      batchId: "disc_test",
      createdAt: "2026-08-12T16:00:00.000Z",
      seeds: [{ seedId: "seed_test", locator: seedLocator }],
      constraints: {
        maxDepth: 2,
        maxCandidates: 100,
        maxFetches: 50,
        sameHostOnly: true,
        respectRobots: true,
        discoverSitemaps: true,
        discoverExternalLinks: true,
        maxExternalCandidates: 25,
      },
    });

    expect(primaryDiscover).toHaveBeenCalledTimes(1);
    expect(primaryDiscover.mock.calls[0]?.[0].constraints).toMatchObject({
      maxCandidates: 75,
      maxFetches: 48,
      sameHostOnly: true,
      discoverExternalLinks: true,
    });
    expect(externalDiscover).toHaveBeenCalledTimes(1);
    expect(externalDiscover.mock.calls[0]?.[0].constraints).toMatchObject({
      maxDepth: 1,
      maxFetches: 2,
      sameHostOnly: false,
      discoverSitemaps: false,
      discoverExternalLinks: false,
    });

    expect(result.map((item) => item.locator)).toEqual([
      "https://example.test/internal",
      "https://outside.test/article",
      "https://docs.test/guide.pdf",
    ]);
    expect(result[1]?.metadata).toMatchObject({
      kind: "PAGE",
      host: "outside.test",
      externalToSeed: true,
      discoveryScope: "EXTERNAL_ONE_HOP",
      seedOrigin: "https://example.test",
      fetchEligibleInOriginatingRun: false,
    });
    expect(result[1]?.metadata).not.toHaveProperty("robotsAllowed");
    expect(result[2]?.metadata).not.toHaveProperty("robotsAllowed");
  });

  it("does not run the external probe unless the batch explicitly enables it", async () => {
    const primaryDiscover = vi.fn(async () => [] as SourceCandidate[]);
    const externalDiscover = vi.fn(async () => [] as SourceCandidate[]);
    const provider = new ExpandingWebsiteDiscoveryProvider(
      { discover: primaryDiscover },
      { discover: externalDiscover },
    );

    await provider.discover({
      batchId: "disc_disabled",
      createdAt: "2026-08-12T16:00:00.000Z",
      seeds: [{ seedId: "seed_disabled", locator: "https://example.test/" }],
      constraints: { maxCandidates: 20, maxFetches: 10 },
    });

    expect(primaryDiscover).toHaveBeenCalledTimes(1);
    expect(externalDiscover).not.toHaveBeenCalled();
  });
});
