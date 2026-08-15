import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Job } from "@markorbit/contracts";
import type { ArtifactBackedExecutionContext } from "../src/artifact-backed-collection-executor";
import {
  CRAWL4AI_MAX_START_URLS,
  Crawl4AiSubprocessAcquirer,
  type Crawl4AiProcessRunner,
} from "../src/crawl4ai-subprocess-acquirer";

function context(urlCount: number): ArtifactBackedExecutionContext {
  const entrypoints = Array.from({ length: urlCount }, (_, index) => ({
    uri: `https://example.com/trademarks/page-${index + 1}`,
  }));
  const job = {
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    sourceSnapshot: {
      sourceType: "WEB",
      entrypoints,
      canonicalUri: entrypoints[0]?.uri,
    },
    planSnapshot: {
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
        retry: { maxAttempts: 2, backoffSeconds: 5 },
      },
      output: { artifactKinds: ["HTML"] },
    },
  } as unknown as Job;
  return { job } as ArtifactBackedExecutionContext;
}

function successfulRunner(onRequest: (startUrls: string[]) => void): Crawl4AiProcessRunner {
  return {
    async run(request) {
      onRequest(request.startUrls);
      const content = new TextEncoder().encode("<html>budget fixture</html>");
      const sha256 = createHash("sha256").update(content).digest("hex");
      await writeFile(join(request.outputDirectory, "page.html"), content);
      return {
        protocolVersion: "1.0",
        ok: true,
        pagesAttempted: 1,
        totalBytes: content.byteLength,
        artifacts: [
          {
            artifactKind: "HTML",
            mimeType: "text/html",
            originalName: "page.html",
            sourceUri: request.startUrls[0]!,
            canonicalUri: request.startUrls[0]!,
            fileName: "page.html",
            sizeBytes: content.byteLength,
            sha256,
          },
        ],
      };
    },
  };
}

describe("Crawl4AI start URL budget", () => {
  it("passes more than the legacy 50-entrypoint limit without dropping approved URLs", async () => {
    let seen: string[] = [];
    const acquirer = new Crawl4AiSubprocessAcquirer({
      runner: successfulRunner((startUrls) => {
        seen = startUrls;
      }),
      requireEgressProxy: false,
    });

    await acquirer.acquire(context(51));

    expect(seen).toHaveLength(51);
    expect(seen[0]).toBe("https://example.com/trademarks/page-1");
    expect(seen[50]).toBe("https://example.com/trademarks/page-51");
  });

  it("allows the governed maximum of 500 unique start URLs", async () => {
    let seenCount = 0;
    const acquirer = new Crawl4AiSubprocessAcquirer({
      runner: successfulRunner((startUrls) => {
        seenCount = startUrls.length;
      }),
      requireEgressProxy: false,
    });

    await acquirer.acquire(context(CRAWL4AI_MAX_START_URLS));
    expect(seenCount).toBe(CRAWL4AI_MAX_START_URLS);
  });

  it("rejects 501 unique start URLs locally as non-retryable before spawning Python", async () => {
    let runnerCalled = false;
    const runner: Crawl4AiProcessRunner = {
      async run() {
        runnerCalled = true;
        throw new Error("runner must not be called");
      },
    };
    const acquirer = new Crawl4AiSubprocessAcquirer({ runner, requireEgressProxy: false });

    await expect(acquirer.acquire(context(CRAWL4AI_MAX_START_URLS + 1))).rejects.toMatchObject({
      code: "CRAWL_START_URL_BUDGET_EXCEEDED",
      retryable: false,
    });
    expect(runnerCalled).toBe(false);
  });
});
