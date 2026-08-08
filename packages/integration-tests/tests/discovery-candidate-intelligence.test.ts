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

  it("persists intelligence into candidate metadata without changing review state", () => {
    const candidate = enrichDiscoveryCandidate({
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
    });

    expect(candidate.status).toBe("DISCOVERED");
    expect(candidate.metadata).toMatchObject({
      kind: "DOCUMENT",
      robotsAllowed: true,
      reviewPriority: "HIGH",
      intelligenceVersion: "deterministic-v1",
    });
    expect(candidate.metadata?.reasonCodes).toEqual(
      expect.arrayContaining(["FEE_SIGNAL", "FORM_SIGNAL", "DOCUMENT_SIGNAL", "SITEMAP_SIGNAL"]),
    );
  });
});
