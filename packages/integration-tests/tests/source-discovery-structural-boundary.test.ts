import { describe, expect, it } from "vitest";
import type { SourceCandidate, SourceDiscoveryBatch } from "@markorbit/contracts";
import { SourceDiscoveryRunner, enrichDiscoveryCandidate } from "@markorbit/worker-runtime";

function structuralCandidate(): SourceCandidate {
  return {
    candidateId: "cand_test",
    locator: "https://example.test/forms/trademark-fees.pdf",
    discoveredAt: "2026-08-08T00:00:00Z",
    status: "DISCOVERED",
    discoveryMethod: "SITEMAP",
    depth: 1,
    metadata: {
      kind: "DOCUMENT",
      robotsAllowed: true,
    },
  };
}

const batch: SourceDiscoveryBatch = {
  batchId: "batch_test",
  seeds: [
    {
      seedId: "seed_test",
      locator: "https://example.test/",
    },
  ],
  createdAt: "2026-08-08T00:00:00Z",
  constraints: {
    maxCandidates: 1,
    maxFetches: 1,
    sameHostOnly: true,
  },
};

describe("source discovery structural-only boundary", () => {
  it("does not add topic, relevance, priority, or intelligence metadata", async () => {
    const candidate = structuralCandidate();
    const runner = new SourceDiscoveryRunner({
      async discover() {
        return [candidate];
      },
    });

    const [result] = await runner.run(batch);

    expect(result).toBe(candidate);
    expect(result?.metadata).toEqual({
      kind: "DOCUMENT",
      robotsAllowed: true,
    });
    expect(result?.metadata).not.toHaveProperty("topic");
    expect(result?.metadata).not.toHaveProperty("relevanceScore");
    expect(result?.metadata).not.toHaveProperty("reviewPriority");
    expect(result?.metadata).not.toHaveProperty("intelligenceVersion");
  });

  it("keeps the deprecated enrichment compatibility adapter identity-only", () => {
    const candidate = structuralCandidate();
    const result = enrichDiscoveryCandidate(candidate);

    expect(result).toBe(candidate);
    expect(result.metadata).toEqual({
      kind: "DOCUMENT",
      robotsAllowed: true,
    });
  });
});
