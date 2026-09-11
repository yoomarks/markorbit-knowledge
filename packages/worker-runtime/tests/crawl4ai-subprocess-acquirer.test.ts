import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Job } from "@markorbit/contracts";
import {
  Crawl4AiSubprocessAcquirer,
  SubprocessCrawl4AiRunner,
  type Crawl4AiProcessRunner,
  type Crawl4AiRunnerRequest,
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
    let seenMaxConcurrency = -1;
    const runner: Crawl4AiProcessRunner = {
      async run(request) {
        seenMaxDepth = request.maxDepth;
        seenMaxConcurrency = request.maxConcurrency;
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
    expect(seenMaxConcurrency).toBe(4);
    expect(artifacts).toHaveLength(1);
    expect(new TextDecoder().decode(artifacts[0]?.content)).toContain("official");
  });

  it("retains structured sidecar diagnostics for acquisition learning", async () => {
    const runner: Crawl4AiProcessRunner = {
      async run(request) {
        const content = new TextEncoder().encode("<html>telemetry</html>");
        const sha256 = createHash("sha256").update(content).digest("hex");
        await writeFile(join(request.outputDirectory, "telemetry.html"), content);
        return {
          protocolVersion: "1.0",
          ok: true,
          pagesAttempted: 3,
          totalBytes: content.byteLength,
          diagnostics: {
            pagesAttempted: 3,
            pagesSucceeded: 2,
            pagesFailed: 1,
            redirects: 1,
            internalLinksDiscovered: 7,
            maxDepthObserved: 2,
            attachmentsAttempted: 1,
            httpStatusCounts: { "200": 2, "404": 1 },
          },
          artifacts: [
            {
              artifactKind: "HTML",
              mimeType: "text/html",
              originalName: "telemetry.html",
              sourceUri: "https://example.com/trademarks",
              canonicalUri: "https://example.com/trademarks",
              fileName: "telemetry.html",
              sizeBytes: content.byteLength,
              sha256,
            },
          ],
        };
      },
    };
    const acquirer = new Crawl4AiSubprocessAcquirer({ runner, requireEgressProxy: false });
    await acquirer.acquire(context());
    expect(acquirer.getDiagnostics()).toEqual({
      pagesAttempted: 3,
      pagesSucceeded: 2,
      pagesFailed: 1,
      redirects: 1,
      internalLinksDiscovered: 7,
      maxDepthObserved: 2,
      attachmentsAttempted: 1,
      httpStatusCounts: { "200": 2, "404": 1 },
    });
  });

  it("rejects malformed acquisition diagnostics from the sidecar protocol", async () => {
    const root = await mkdtemp(join(tmpdir(), "markorbit-crawl4ai-diagnostics-test-"));
    const scriptPath = join(root, "invalid-diagnostics.mjs");
    try {
      await writeFile(
        scriptPath,
        'process.stdout.write(JSON.stringify({protocolVersion:"1.0",ok:true,artifacts:[],pagesAttempted:1,totalBytes:0,diagnostics:{pagesAttempted:-1,pagesSucceeded:0,pagesFailed:1,redirects:0,internalLinksDiscovered:0,maxDepthObserved:0,attachmentsAttempted:0,httpStatusCounts:{"500":1}}}));',
      );
      const request: Crawl4AiRunnerRequest = {
        protocolVersion: "1.0",
        outputDirectory: root,
        startUrls: ["https://example.com/trademarks"],
        outputKinds: ["HTML"],
        maxDepth: 0,
        maxItems: 1,
        maxConcurrency: 1,
        renderJavascript: false,
        fetchAttachments: false,
        respectRobots: true,
        rateLimitPerMinute: 1,
        timeoutSeconds: 5,
        includePatterns: [],
        excludePatterns: [],
        maxArtifactBytes: 1024,
        maxTotalBytes: 1024,
        requireEgressProxy: false,
      };
      const runner = new SubprocessCrawl4AiRunner({
        pythonExecutable: process.execPath,
        scriptPath,
        cwd: root,
      });
      await expect(runner.run(request, 5_000)).rejects.toMatchObject({
        code: "CRAWL4AI_PROTOCOL_INVALID",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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
      parentCanonicalUris: ["https://example.com/trademarks-a", "https://example.com/trademarks-b"],
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

  it.skipIf(process.platform === "win32")(
    "kills the whole subprocess group on timeout so descendant pipes cannot hang the Worker",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "markorbit-crawl4ai-timeout-test-"));
      const scriptPath = join(root, "hold-pipe.mjs");
      await writeFile(
        scriptPath,
        [
          'import { spawn } from "node:child_process";',
          'spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: ["ignore", "inherit", "inherit"] });',
          "setInterval(() => {}, 1000);",
        ].join("\n"),
        "utf8",
      );
      try {
        const acquirer = new Crawl4AiSubprocessAcquirer({
          requireEgressProxy: false,
          maxProcessTimeoutMs: 100,
          subprocess: {
            pythonExecutable: process.execPath,
            scriptPath,
            cwd: root,
          },
        });
        await expect(acquirer.acquire(context())).rejects.toMatchObject({
          code: "CRAWL4AI_TIMEOUT",
          retryable: true,
        });
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    5_000,
  );
});
