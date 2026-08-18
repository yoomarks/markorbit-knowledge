import { describe, expect, it } from "vitest";
import {
  sourceFailureDomain,
  summarizeSourceFailureRootCauses,
  type SourceFailureEvidence,
} from "../source-failure-root-causes";

function failure(overrides: Partial<SourceFailureEvidence> = {}): SourceFailureEvidence {
  return {
    sourceId: "src_1",
    sourceName: "Source 1",
    canonicalUri: "https://example.com/news",
    code: "CRAWL4AI_TIMEOUT",
    message: "Collector exceeded the governed timeout",
    retryable: true,
    occurredAt: "2026-08-18T10:00:00.000Z",
    ...overrides,
  };
}

describe("source failure root causes", () => {
  it("normalizes failure domains safely", () => {
    expect(sourceFailureDomain("https://WWW.Example.com/path")).toBe("www.example.com");
    expect(sourceFailureDomain("not a url")).toBe("unknown");
    expect(sourceFailureDomain(null)).toBe("unknown");
  });

  it("clusters failures by code, domain and retryability", () => {
    const summary = summarizeSourceFailureRootCauses([
      failure(),
      failure({
        sourceId: "src_2",
        sourceName: "Source 2",
        canonicalUri: "https://example.com/rules",
        occurredAt: "2026-08-18T10:05:00.000Z",
        message: "Latest timeout sample",
      }),
      failure({
        sourceId: "src_3",
        sourceName: "Source 3",
        code: "HTTP_403",
        retryable: false,
        occurredAt: "2026-08-18T09:00:00.000Z",
      }),
    ]);

    expect(summary).toMatchObject({
      sourcesWithFailureEvidence: 3,
      retryableSources: 2,
      terminalSources: 1,
    });
    expect(summary.clusters).toHaveLength(2);
    expect(summary.clusters[0]).toMatchObject({
      code: "CRAWL4AI_TIMEOUT",
      domain: "example.com",
      retryable: true,
      sourceCount: 2,
      sourceIds: ["src_1", "src_2"],
      latestOccurredAt: "2026-08-18T10:05:00.000Z",
      sampleMessage: "Latest timeout sample",
    });
  });

  it("keeps the same error code separate across upstream domains", () => {
    const summary = summarizeSourceFailureRootCauses([
      failure({ sourceId: "src_a", canonicalUri: "https://a.example/news" }),
      failure({ sourceId: "src_b", canonicalUri: "https://b.example/news" }),
    ]);

    expect(summary.clusters.map((cluster) => cluster.domain).sort()).toEqual([
      "a.example",
      "b.example",
    ]);
  });
});
