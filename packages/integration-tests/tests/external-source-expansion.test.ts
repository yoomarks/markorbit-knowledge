import { describe, expect, it } from "vitest";
import {
  ExpandingWebsiteDiscoveryProvider,
  HttpWebsiteDiscoveryProvider,
} from "@markorbit/worker-runtime";

function response(body: string, contentType: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": contentType },
  });
}

describe("external source expansion", () => {
  it("discovers cross-origin links without fetching the external targets", async () => {
    const requested: string[] = [];
    const fetcher = (async (input: string | URL | Request) => {
      const locator = typeof input === "string" ? input : input.toString();
      requested.push(locator);

      if (locator === "https://example.test/robots.txt") {
        return response("User-agent: *\nDisallow:", "text/plain");
      }
      if (locator === "https://example.test/") {
        return response(
          [
            '<a href="/internal">Internal</a>',
            '<a href="https://peer.test/services">Peer</a>',
            '<a href="https://office.test/rules.pdf">Office rules</a>',
          ].join(""),
          "text/html",
        );
      }

      throw new Error(`Unexpected fetch: ${locator}`);
    }) as typeof globalThis.fetch;

    const provider = new ExpandingWebsiteDiscoveryProvider(
      new HttpWebsiteDiscoveryProvider(fetcher),
      new HttpWebsiteDiscoveryProvider(fetcher),
    );
    const result = await provider.discover({
      batchId: "disc_external",
      createdAt: "2026-08-12T16:30:00.000Z",
      seeds: [{ seedId: "seed_external", locator: "https://example.test/" }],
      constraints: {
        maxDepth: 1,
        maxCandidates: 10,
        maxFetches: 6,
        sameHostOnly: true,
        respectRobots: true,
        discoverSitemaps: false,
        discoverExternalLinks: true,
        maxExternalCandidates: 4,
      },
    });

    expect(result.map((candidate) => candidate.locator)).toEqual([
      "https://example.test/internal",
      "https://peer.test/services",
      "https://office.test/rules.pdf",
    ]);
    expect(result.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          locator: "https://peer.test/services",
          discoveryMethod: "HTML_LINK",
          discoveredFrom: "https://example.test/",
          metadata: expect.objectContaining({
            externalToSeed: true,
            discoveryScope: "EXTERNAL_ONE_HOP",
            fetchEligibleInOriginatingRun: false,
          }),
        }),
        expect.objectContaining({
          locator: "https://office.test/rules.pdf",
          metadata: expect.objectContaining({
            kind: "DOCUMENT",
            externalToSeed: true,
            fetchEligibleInOriginatingRun: false,
          }),
        }),
      ]),
    );

    expect(requested).toEqual([
      "https://example.test/robots.txt",
      "https://example.test/",
      "https://example.test/robots.txt",
      "https://example.test/",
    ]);
    expect(requested).not.toContain("https://peer.test/services");
    expect(requested).not.toContain("https://office.test/rules.pdf");
  });
});
