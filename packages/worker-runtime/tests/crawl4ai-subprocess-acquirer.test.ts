import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Job } from "@markorbit/contracts";
import {
  Crawl4AiSubprocessAcquirer,
  type Crawl4AiProcessRunner,
} from "../src/crawl4ai-subprocess-acquirer";
import type { ArtifactBackedExecutionContext } from "../src/artifact-backed-collection-executor";

function context(): ArtifactBackedExecutionContext {
  const job = {
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    sourceSnapshot: {
      sourceType: "WEB",
      entrypoints: [{ uri: "https://example.com/trademarks" }],
      canonicalUri: "https://example.com/trademarks",
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
        rateLimitPerMinute: 12,
        timeoutSeconds: 30,
        retry: { maxAttempts: 2, backoffSeconds: 5 },
        locale: "en-US",
      },
      output: { artifactKinds: ["HTML"] },
    },
  } as unknown as Job;
  return { job } as ArtifactBackedExecutionContext;
}

describe("Crawl4AiSubprocessAcquirer", () => {
  it("maps a governed plan and verifies sidecar bytes", async () => {
    let seenMaxDepth = -1;
    const runner: Crawl4AiProcessRunner = {
      async run(request) {
        seenMaxDepth = request.maxDepth;
        const content = new TextEncoder().encode("<html>official</html>");
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
              sourceUri: "https://example.com/trademarks",
              canonicalUri: "https://example.com/trademarks",
              fileName: "page.html",
              sizeBytes: content.byteLength,
              sha256,
            },
          ],
        };
      },
    };
    const acquirer = new Crawl4AiSubprocessAcquirer({ runner, requireEgressProxy: false });
    const artifacts = await acquirer.acquire(context());
    expect(seenMaxDepth).toBe(1);
    expect(artifacts).toHaveLength(1);
    expect(new TextDecoder().decode(artifacts[0]?.content)).toContain("official");
  });
});
