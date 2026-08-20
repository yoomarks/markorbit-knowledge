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

  it("polls only reviewed entrypoints for PAGE_UPDATE_CHECK instead of recursively crawling", async () => {
    const ctx = context();
    ctx.job.jobType = "PAGE_UPDATE_CHECK";
    ctx.job.sourceSnapshot.entrypoints = [
      { uri: "https://example.com/trademarks" },
      { uri: "https://example.com/fees" },
    ];
    ctx.job.sourceSnapshot.canonicalUri = "https://example.com/trademarks";
    ctx.job.planSnapshot.policy.maxDepth = 5;
    ctx.job.planSnapshot.policy.maxItems = 2;
    let seenDepth = -1;
    let seenUrls: string[] = [];
    const runner: Crawl4AiProcessRunner = {
      async run(request) {
        seenDepth = request.maxDepth;
        seenUrls = request.startUrls;
        const content = new TextEncoder().encode("<html>watch</html>");
        const sha256 = createHash("sha256").update(content).digest("hex");
        await writeFile(join(request.outputDirectory, "watch.html"), content);
        return {
          protocolVersion: "1.0",
          ok: true,
          pagesAttempted: 2,
          totalBytes: content.byteLength,
          artifacts: [
            {
              artifactKind: "HTML",
              mimeType: "text/html",
              originalName: "watch.html",
              sourceUri: "https://example.com/trademarks",
              canonicalUri: "https://example.com/trademarks",
              fileName: "watch.html",
              sizeBytes: content.byteLength,
              sha256,
            },
          ],
        };
      },
    };
    const acquirer = new Crawl4AiSubprocessAcquirer({ runner, requireEgressProxy: false });
    await acquirer.acquire(ctx);
    expect(seenDepth).toBe(0);
    expect(seenUrls).toEqual(["https://example.com/trademarks", "https://example.com/fees"]);
  });

  it("rejects legacy PAGE_UPDATE_CHECK snapshots whose maxItems cannot cover all entrypoints", async () => {
    const ctx = context();
    ctx.job.jobType = "PAGE_UPDATE_CHECK";
    ctx.job.sourceSnapshot.entrypoints = [
      { uri: "https://example.com/a" },
      { uri: "https://example.com/b" },
    ];
    ctx.job.sourceSnapshot.canonicalUri = "https://example.com/a";
    ctx.job.planSnapshot.policy.maxItems = 1;
    let invoked = false;
    const runner: Crawl4AiProcessRunner = {
      async run() {
        invoked = true;
        throw new Error("runner must not be invoked");
      },
    };
    const acquirer = new Crawl4AiSubprocessAcquirer({ runner, requireEgressProxy: false });
    await expect(acquirer.acquire(ctx)).rejects.toMatchObject({
      code: "CHANGE_WATCH_ENTRYPOINT_BUDGET_EXCEEDED",
      retryable: false,
    });
    expect(invoked).toBe(false);
  });

  it("passes explicit attachment authorization, lineage hints and verified PDF bytes", async () => {
    const ctx = context();
    ctx.job.planSnapshot.policy.fetchAttachments = true;
    ctx.job.planSnapshot.output.artifactKinds = ["HTML", "PDF"];
    let authorized = false;
    const runner: Crawl4AiProcessRunner = {
      async run(request) {
        authorized = request.fetchAttachments;
        const content = new TextEncoder().encode("%PDF-1.4\nfixture\n%%EOF\n");
        const sha256 = createHash("sha256").update(content).digest("hex");
        await writeFile(join(request.outputDirectory, "guide.pdf"), content);
        return {
          protocolVersion: "1.0",
          ok: true,
          pagesAttempted: 1,
          totalBytes: content.byteLength,
          artifacts: [
            {
              artifactKind: "PDF",
              mimeType: "application/pdf",
              originalName: "guide.pdf",
              sourceUri: "https://example.com/guide.pdf",
              canonicalUri: "https://example.com/guide.pdf",
              parentCanonicalUris: [
                "https://example.com/trademarks-b",
                "https://example.com/trademarks-a",
                "https://example.com/trademarks-a",
              ],
              fileName: "guide.pdf",
              sizeBytes: content.byteLength,
              sha256,
            },
          ],
        };
      },
    };
    const acquirer = new Crawl4AiSubprocessAcquirer({ runner, requireEgressProxy: false });
    const artifacts = await acquirer.acquire(ctx);
    expect(authorized).toBe(true);
    expect(artifacts[0]).toMatchObject({
      artifactKind: "PDF",
      parentCanonicalUris: [
        "https://example.com/trademarks-a",
        "https://example.com/trademarks-b",
      ],
    });
  });

  it("rejects non-HTTP attachment parent lineage from the sidecar", async () => {
    const ctx = context();
    ctx.job.planSnapshot.policy.fetchAttachments = true;
    ctx.job.planSnapshot.output.artifactKinds = ["PDF"];
    const runner: Crawl4AiProcessRunner = {
      async run(request) {
        const content = new TextEncoder().encode("%PDF-1.4\nfixture\n%%EOF\n");
        const sha256 = createHash("sha256").update(content).digest("hex");
        await writeFile(join(request.outputDirectory, "guide.pdf"), content);
        return {
          protocolVersion: "1.0",
          ok: true,
          pagesAttempted: 1,
          totalBytes: content.byteLength,
          artifacts: [
            {
              artifactKind: "PDF",
              mimeType: "application/pdf",
              originalName: "guide.pdf",
              sourceUri: "https://example.com/guide.pdf",
              canonicalUri: "https://example.com/guide.pdf",
              parentCanonicalUris: ["file:///tmp/source.html"],
              fileName: "guide.pdf",
              sizeBytes: content.byteLength,
              sha256,
            },
          ],
        };
      },
    };
    const acquirer = new Crawl4AiSubprocessAcquirer({ runner, requireEgressProxy: false });
    await expect(acquirer.acquire(ctx)).rejects.toMatchObject({
      code: "CRAWL4AI_PROTOCOL_INVALID",
      retryable: false,
    });
  });
});
