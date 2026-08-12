import { describe, expect, it } from "vitest";
import { classifyDiscoveryCandidate, enrichDiscoveryCandidate } from "@markorbit/worker-runtime";

describe("discovery candidate intelligence", () => {
  it("prioritizes trademark guidance and explains why", () => {
    const result = classifyDiscoveryCandidate({
      locator: "https://example.test/trademarks/guidance/apply-for-a-trademark",
      method: "HTML_LINK",
      kind: "PAGE",
      depth: 1,
      robotsAllowed: true,
    });

    expect(result.topic).toBe("TRADEMARKS");
    expect(result.reviewPriority).toBe("HIGH");
    expect(result.relevanceScore).toBeGreaterThanOrEqual(70);
    expect(result.reasonCodes).toContain("TRADEMARK_SIGNAL");
    expect(result.reasonCodes).toContain("GUIDANCE_SIGNAL");
  });

  it("keeps robots-blocked pages visible but lowers review priority", () => {
    const result = classifyDiscoveryCandidate({
      locator: "https://example.test/trademarks/private-search",
      method: "SITEMAP",
      kind: "PAGE",
      depth: 1,
      robotsAllowed: false,
    });

    expect(result.reviewPriority).toBe("LOW");
    expect(result.relevanceScore).toBeLessThanOrEqual(20);
    expect(result.reasonCodes).toContain("ROBOTS_BLOCKED");
  });

  it("keeps the legacy enrichment adapter structural-only", () => {
    const input = {
      candidateId: "cand_test",
      locator: "https://example.test/forms/trademark-fees.pdf",
      discoveredAt: "2026-08-08T00:00:00Z",
      status: "DISCOVERED" as const,
      discoveryMethod: "SITEMAP" as const,
      depth: 1,
      metadata: {
        kind: "DOCUMENT",
        robotsAllowed: true,
      },
    };
    const candidate = enrichDiscoveryCandidate(input);

    expect(candidate).toBe(input);
    expect(candidate.status).toBe("DISCOVERED");
    expect(candidate.metadata).toEqual({
      kind: "DOCUMENT",
      robotsAllowed: true,
    });
    expect(candidate.metadata).not.toHaveProperty("topic");
    expect(candidate.metadata).not.toHaveProperty("relevanceScore");
    expect(candidate.metadata).not.toHaveProperty("reviewPriority");
    expect(candidate.metadata).not.toHaveProperty("intelligenceVersion");
  });
});
