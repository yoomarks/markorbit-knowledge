import type { ExecutionExecutor } from "@markorbit/contracts";
import { describe, expect, it } from "vitest";
import {
  BrightDataFallbackAcquirer,
  BrightDataWebUnlockerClient,
  type BrightDataWebUnlocker,
  type RawHtmlArtifactProcessor,
} from "./bright-data-fallback-acquirer";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";

const EXECUTOR: ExecutionExecutor = {
  executorId: "crawl4ai-python",
  version: "1.0.0",
  mode: "PRODUCTION",
};

function context(outputKinds: string[] = ["HTML"]): ArtifactBackedExecutionContext {
  return {
    workerId: "worker-1",
    leaseToken: "lease-token",
    lease: { id: "lease-1" },
    job: {
      sourceSnapshot: {
        canonicalUri: "https://example.gov/page",
        entrypoints: [{ uri: "https://example.gov/page" }],
      },
      planSnapshot: { output: { artifactKinds: outputKinds } },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

function artifact(sourceUri = "https://example.gov/page"): AcquiredCollectionArtifact {
  return {
    artifactKind: "HTML",
    mimeType: "text/html",
    originalName: "page.html",
    sourceUri,
    canonicalUri: sourceUri,
    content: Buffer.from("<html>ok</html>"),
  };
}

function primary(run: () => Promise<AcquiredCollectionArtifact[]>): CollectionArtifactAcquirer {
  return { executor: EXECUTOR, acquire: run };
}

describe("BrightDataFallbackAcquirer", () => {
  it("does not call Bright Data when primary Crawl4AI succeeds", async () => {
    let unlockCalls = 0;
    const unlocker: BrightDataWebUnlocker = {
      async unlock(url) {
        unlockCalls += 1;
        return { sourceUri: url, html: "<html>fallback</html>" };
      },
    };
    const processor: RawHtmlArtifactProcessor = {
      async process() {
        throw new Error("processor should not be called");
      },
    };
    const expected = [artifact()];
    const acquirer = new BrightDataFallbackAcquirer({
      primary: primary(async () => expected),
      unlocker,
      processor,
    });

    await expect(acquirer.acquire(context())).resolves.toBe(expected);
    expect(unlockCalls).toBe(0);
  });

  it("uses one unlock request and Crawl4AI raw processor after eligible fetch failure", async () => {
    let unlockCalls = 0;
    let processorInput: Parameters<RawHtmlArtifactProcessor["process"]>[0] | undefined;
    const unlocker: BrightDataWebUnlocker = {
      async unlock(url) {
        unlockCalls += 1;
        return { sourceUri: url, html: "<html><body>unlocked</body></html>" };
      },
    };
    const expected = [artifact()];
    const processor: RawHtmlArtifactProcessor = {
      async process(input) {
        processorInput = input;
        return expected;
      },
    };
    const acquirer = new BrightDataFallbackAcquirer({
      primary: primary(async () => {
        throw new CollectionAcquisitionError("CRAWL4AI_FETCH_FAILED", "blocked", true);
      }),
      unlocker,
      processor,
      maxRequestsPerRun: 2,
    });

    await expect(acquirer.acquire(context(["HTML", "MARKDOWN"]))).resolves.toBe(expected);
    expect(unlockCalls).toBe(1);
    expect(processorInput).toMatchObject({
      pages: [
        { sourceUri: "https://example.gov/page", html: "<html><body>unlocked</body></html>" },
      ],
      outputKinds: ["HTML", "MARKDOWN"],
    });
  });

  it("does not use the fallback for attachment or non-fetch failures", async () => {
    let unlockCalls = 0;
    const unlocker: BrightDataWebUnlocker = {
      async unlock(url) {
        unlockCalls += 1;
        return { sourceUri: url, html: "<html>fallback</html>" };
      },
    };
    const processor: RawHtmlArtifactProcessor = {
      async process() {
        return [artifact()];
      },
    };
    const fetchError = new CollectionAcquisitionError("CRAWL4AI_FETCH_FAILED", "blocked", true);
    const attachmentAcquirer = new BrightDataFallbackAcquirer({
      primary: primary(async () => {
        throw fetchError;
      }),
      unlocker,
      processor,
    });
    await expect(attachmentAcquirer.acquire(context(["PDF"]))).rejects.toBe(fetchError);

    const policyError = new CollectionAcquisitionError(
      "CROSS_DOMAIN_REDIRECT_BLOCKED",
      "blocked",
      false,
    );
    const policyAcquirer = new BrightDataFallbackAcquirer({
      primary: primary(async () => {
        throw policyError;
      }),
      unlocker,
      processor,
    });
    await expect(policyAcquirer.acquire(context())).rejects.toBe(policyError);
    expect(unlockCalls).toBe(0);
  });

  it("fails closed before provider calls when the local request cap cannot cover the start URLs", async () => {
    let unlockCalls = 0;
    const unlocker: BrightDataWebUnlocker = {
      async unlock(url) {
        unlockCalls += 1;
        return { sourceUri: url, html: "<html>fallback</html>" };
      },
    };
    const acquirer = new BrightDataFallbackAcquirer({
      primary: primary(async () => {
        throw new CollectionAcquisitionError("CRAWL4AI_FETCH_FAILED", "blocked", true);
      }),
      unlocker,
      processor: {
        async process() {
          return [artifact()];
        },
      },
      maxRequestsPerRun: 1,
    });
    const twoUrls = context();
    (twoUrls.job.sourceSnapshot.entrypoints as Array<{ uri: string }>).push({
      uri: "https://example.gov/two",
    });

    await expect(acquirer.acquire(twoUrls)).rejects.toMatchObject({
      code: "BRIGHTDATA_FALLBACK_REQUEST_BUDGET_EXCEEDED",
      retryable: false,
    });
    expect(unlockCalls).toBe(0);
  });
});

describe("BrightDataWebUnlockerClient", () => {
  it("uses the direct API raw format and never retries an ambiguous request", async () => {
    let calls = 0;
    let requestBody: Record<string, unknown> | undefined;
    const client = new BrightDataWebUnlockerClient({
      apiToken: "secret-token",
      zone: "free-zone",
      fetcher: async (_input, init) => {
        calls += 1;
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        throw new Error("socket reset after send");
      },
    });

    await expect(client.unlock("https://example.gov/page")).rejects.toMatchObject({
      code: "BRIGHTDATA_DELIVERY_UNKNOWN",
      retryable: false,
    });
    expect(requestBody).toEqual({
      zone: "free-zone",
      url: "https://example.gov/page",
      format: "raw",
    });
    expect(calls).toBe(1);
  });

  it("fails closed on provider quota/payment responses", async () => {
    const client = new BrightDataWebUnlockerClient({
      apiToken: "secret-token",
      zone: "free-zone",
      fetcher: async () => new Response("quota", { status: 429 }),
    });

    await expect(client.unlock("https://example.gov/page")).rejects.toMatchObject({
      code: "BRIGHTDATA_QUOTA_OR_PAYMENT_REQUIRED",
      retryable: false,
    });
  });
});
