import { describe, expect, it } from "vitest";
import {
  CRAWL4AI_MAX_DEPTH,
  CRAWL4AI_MAX_ITEMS,
  CRAWL4AI_MAX_PATTERN_LENGTH,
  CRAWL4AI_MAX_PATTERNS_PER_LIST,
  CRAWL4AI_MAX_RATE_LIMIT_PER_MINUTE,
  CRAWL4AI_MAX_TIMEOUT_SECONDS,
  type Job,
} from "@markorbit/contracts";
import type { ArtifactBackedExecutionContext } from "../src/artifact-backed-collection-executor";
import {
  Crawl4AiSubprocessAcquirer,
  type Crawl4AiProcessRunner,
} from "../src/crawl4ai-subprocess-acquirer";

function context(policyOverrides: Record<string, unknown>): ArtifactBackedExecutionContext {
  return {
    job: {
      connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
      sourceSnapshot: {
        sourceType: "WEB",
        entrypoints: [{ uri: "https://example.com/trademarks" }],
        canonicalUri: "https://example.com/trademarks",
      },
      planSnapshot: {
        output: { artifactKinds: ["HTML"] },
        policy: {
          includePatterns: [],
          excludePatterns: [],
          maxDepth: 1,
          maxItems: 10,
          renderJavascript: false,
          fetchAttachments: false,
          respectRobots: true,
          rateLimitPerMinute: 30,
          timeoutSeconds: 30,
          retry: { maxAttempts: 3, backoffSeconds: 5 },
          locale: "en-US",
          ...policyOverrides,
        },
      },
    } as unknown as Job,
  } as ArtifactBackedExecutionContext;
}

describe("Crawl4AI subprocess policy safety", () => {
  it("rejects Python protocol policy overflows before spawning the runner", async () => {
    let runnerCalls = 0;
    const runner: Crawl4AiProcessRunner = {
      async run() {
        runnerCalls += 1;
        throw new Error("runner should not start for invalid policy");
      },
    };
    const acquirer = new Crawl4AiSubprocessAcquirer({ runner, requireEgressProxy: false });
    const oversizedLocale = `en-${Array.from({ length: 22 }, () => "US").join("-")}`;
    const cases: Record<string, unknown>[] = [
      { maxDepth: CRAWL4AI_MAX_DEPTH + 1 },
      { maxItems: CRAWL4AI_MAX_ITEMS + 1 },
      { rateLimitPerMinute: CRAWL4AI_MAX_RATE_LIMIT_PER_MINUTE + 1 },
      { timeoutSeconds: CRAWL4AI_MAX_TIMEOUT_SECONDS + 1 },
      {
        includePatterns: Array.from(
          { length: CRAWL4AI_MAX_PATTERNS_PER_LIST + 1 },
          (_, index) => `/include/${index}`,
        ),
      },
      {
        excludePatterns: Array.from(
          { length: CRAWL4AI_MAX_PATTERNS_PER_LIST + 1 },
          (_, index) => `/exclude/${index}`,
        ),
      },
      { includePatterns: [`/${"a".repeat(CRAWL4AI_MAX_PATTERN_LENGTH)}`] },
      { locale: oversizedLocale },
    ];

    for (const policyOverride of cases) {
      await expect(acquirer.acquire(context(policyOverride))).rejects.toMatchObject({
        retryable: false,
      });
    }
    expect(runnerCalls).toBe(0);
  });

  it("caps custom Worker maxDepth/maxItems options at the Python protocol maxima", async () => {
    let runnerCalls = 0;
    const runner: Crawl4AiProcessRunner = {
      async run() {
        runnerCalls += 1;
        throw new Error("runner should not start");
      },
    };
    const acquirer = new Crawl4AiSubprocessAcquirer({
      runner,
      requireEgressProxy: false,
      maxDepth: CRAWL4AI_MAX_DEPTH + 100,
      maxItems: CRAWL4AI_MAX_ITEMS + 100,
    });

    await expect(
      acquirer.acquire(context({ maxDepth: CRAWL4AI_MAX_DEPTH + 1 })),
    ).rejects.toMatchObject({ code: "CRAWL_DEPTH_LIMIT_EXCEEDED", retryable: false });
    await expect(
      acquirer.acquire(context({ maxItems: CRAWL4AI_MAX_ITEMS + 1 })),
    ).rejects.toMatchObject({ code: "CRAWL_ITEM_LIMIT_EXCEEDED", retryable: false });
    expect(runnerCalls).toBe(0);
  });
});
