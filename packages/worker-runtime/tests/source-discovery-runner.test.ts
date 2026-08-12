import { describe, expect, it } from "vitest";
import type { SourceCandidate, SourceDiscoveryBatch } from "@markorbit/contracts";
import {
  SourceDiscoveryRunner,
  enrichDiscoveryCandidate,
  type SourceDiscoveryProvider,
} from "../src/source-discovery-runner";

describe("SourceDiscoveryRunner structural boundary", () => {
  it("returns structurally discovered candidates without semantic enrichment", async () => {
    const candidate: SourceCandidate = {
      candidateId: "candidate-1",
      locator: "https://example.test/trademark-fees-and-guidance",
      title: "Trademark fees and legal guidance",
      discoveredAt: "2026-08-12T16:00:00.000Z",
      status: "DISCOVERED",
      discoveredFrom: "https://example.test/sitemap.xml",
      discoveryMethod: "SITEMAP",
      depth: 1,
      metadata: {
        kind: "DOCUMENT",
        robotsAllowed: true,
        httpStatus: 200,
      },
    };
    const batch: SourceDiscoveryBatch = {
      batchId: "batch-1",
      seeds: [{ seedId: "seed-1", locator: "https://example.test/" }],
      createdAt: "2026-08-12T16:00:00.000Z",
      constraints: { maxCandidates: 10, maxDepth: 1 },
    };
    let receivedBatch: SourceDiscoveryBatch | undefined;
    const provider: SourceDiscoveryProvider = {
      async discover(input) {
        receivedBatch = input;
        return [candidate];
      },
    };

    const result = await new SourceDiscoveryRunner(provider).run(batch);

    expect(receivedBatch).toBe(batch);
    expect(result).toEqual([candidate]);
    expect(result[0]).toBe(candidate);
    expect(result[0]?.metadata).toEqual({
      kind: "DOCUMENT",
      robotsAllowed: true,
      httpStatus: 200,
    });
    expect(result[0]?.metadata).not.toHaveProperty("topic");
    expect(result[0]?.metadata).not.toHaveProperty("relevanceScore");
    expect(result[0]?.metadata).not.toHaveProperty("reviewPriority");
    expect(result[0]?.metadata).not.toHaveProperty("intelligenceVersion");
  });

  it("keeps the legacy enrichment helper as a no-op compatibility adapter", () => {
    const candidate: SourceCandidate = {
      candidateId: "candidate-2",
      locator: "https://example.test/legal/news",
      discoveredAt: "2026-08-12T16:00:00.000Z",
      status: "DISCOVERED",
      discoveryMethod: "HTML_LINK",
      metadata: { kind: "PAGE" },
    };

    expect(enrichDiscoveryCandidate(candidate)).toBe(candidate);
  });
});
