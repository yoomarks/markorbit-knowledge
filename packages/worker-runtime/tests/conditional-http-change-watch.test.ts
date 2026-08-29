import { describe, expect, it, vi } from "vitest";
import type { ExecutionAttempt } from "@markorbit/contracts";
import {
  ArtifactBackedCollectionExecutor,
  CollectionNotModifiedSignal,
  type ArtifactBackedExecutionClient,
  type ArtifactBackedExecutionContext,
  type CollectionArtifactAcquirer,
} from "../src/artifact-backed-collection-executor";
import {
  createConditionalHttpChangeWatch,
  type HttpValidatorClient,
} from "../src/conditional-http-change-watch";
import type { ApiTransport, ApiTransportResponse } from "../src/api-acquirer";

function context(mode: "CHANGE_WATCH" | "INTERVAL" = "CHANGE_WATCH") {
  return {
    workerId: "wrk_fixture",
    leaseToken: "lease-token",
    lease: { id: "lse_fixture" },
    job: {
      jobType: "API_COLLECTION",
      planSnapshot: {
        schedule:
          mode === "CHANGE_WATCH"
            ? { mode: "CHANGE_WATCH", pollIntervalSeconds: 300 }
            : { mode: "INTERVAL", intervalSeconds: 3600 },
        output: { artifactKinds: ["JSON"] },
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

const request = {
  hostname: "example.com",
  resolvedAddress: "203.0.113.10",
  family: 4 as const,
  port: 443,
  servername: "example.com",
  path: "/feed?b=2&a=1",
  hostHeader: "example.com",
  headers: { accept: "application/json" },
  timeoutMs: 10_000,
  maxResponseBytes: 1024,
};

describe("conditional HTTP change watch", () => {
  it("sends validators and converts a governed 304 into a no-change signal", async () => {
    const base: ApiTransport = vi.fn(async (input) => {
      expect(input.headers["if-none-match"]).toBe('"v2"');
      expect(input.headers["if-modified-since"]).toBe("Mon, 17 Aug 2026 10:00:00 GMT");
      return { statusCode: 304, headers: {}, body: new Uint8Array() };
    });
    const validators: HttpValidatorClient = {
      async read() {
        return {
          etag: '"v2"',
          lastModified: "Mon, 17 Aug 2026 10:00:00 GMT",
        };
      },
      async write() {
        throw new Error("not expected");
      },
    };
    const conditional = createConditionalHttpChangeWatch(base, validators);
    const acquirer: CollectionArtifactAcquirer = conditional.wrap({
      executor: { executorId: "fixture", version: "1.0.0", mode: "FIXTURE" },
      async acquire() {
        await conditional.transport(request);
        return [];
      },
    });

    await expect(acquirer.acquire(context())).rejects.toMatchObject({
      name: "CollectionNotModifiedSignal",
      code: "HTTP_NOT_MODIFIED",
      canonicalUri: "https://example.com/feed?b=2&a=1",
    });
  });

  it("persists fresh response validators but never makes evidence depend on checkpoint writes", async () => {
    const write = vi.fn(async () => {
      throw new Error("checkpoint unavailable");
    });
    const validators: HttpValidatorClient = {
      async read() {
        return null;
      },
      write,
    };
    const base: ApiTransport = vi.fn(async () => ({
      statusCode: 200,
      headers: {
        etag: '"v3"',
        "last-modified": "Tue, 18 Aug 2026 10:00:00 GMT",
      },
      body: new TextEncoder().encode('{"ok":true}'),
    }));
    const conditional = createConditionalHttpChangeWatch(base, validators);
    let observed: ApiTransportResponse | null = null;
    const acquirer = conditional.wrap({
      executor: { executorId: "fixture", version: "1.0.0", mode: "FIXTURE" },
      async acquire() {
        observed = await conditional.transport(request);
        return [];
      },
    });

    await acquirer.acquire(context());

    expect(observed).toMatchObject({ statusCode: 200 });
    expect(write).toHaveBeenCalledWith(expect.anything(), "https://example.com/feed?b=2&a=1", {
      etag: '"v3"',
      lastModified: "Tue, 18 Aug 2026 10:00:00 GMT",
    });
  });

  it("does not consult validators for ordinary interval collection", async () => {
    const read = vi.fn(async () => ({ etag: '"v2"', lastModified: null }));
    const validators: HttpValidatorClient = { read, async write() {} };
    const base: ApiTransport = vi.fn(async (input) => ({
      statusCode: 200,
      headers: {},
      body: new TextEncoder().encode(JSON.stringify(input.headers)),
    }));
    const conditional = createConditionalHttpChangeWatch(base, validators);
    const acquirer = conditional.wrap({
      executor: { executorId: "fixture", version: "1.0.0", mode: "FIXTURE" },
      async acquire() {
        await conditional.transport(request);
        return [];
      },
    });

    await acquirer.acquire(context("INTERVAL"));
    expect(read).not.toHaveBeenCalled();
    expect(base).toHaveBeenCalledWith(request);
  });
});

describe("ArtifactBackedCollectionExecutor HTTP 304 completion", () => {
  it("records 304 as metadata-only success without failure or RawArtifact upload", async () => {
    const complete = vi.fn(async () => {});
    const fail = vi.fn(async () => {});
    const createArtifactSession = vi.fn();
    const client: ArtifactBackedExecutionClient = {
      async start() {
        return {} as ExecutionAttempt;
      },
      async uploading() {},
      createArtifactSession,
      async uploadArtifactContent() {},
      async finalizeArtifact() {
        throw new Error("not expected");
      },
      async verifying() {},
      complete,
      fail,
    };
    const acquirer: CollectionArtifactAcquirer = {
      executor: { executorId: "api-worker", version: "1.0.0", mode: "PRODUCTION" },
      async acquire() {
        throw new CollectionNotModifiedSignal("https://example.com/feed");
      },
    };

    const receipt = await new ArtifactBackedCollectionExecutor(acquirer, client).execute(context());

    expect(receipt).toMatchObject({
      outputKinds: ["JSON"],
      itemsObserved: 0,
      bytesPrepared: 0,
      metadataOnly: true,
    });
    expect(receipt?.summary).toContain("no modification");
    expect(createArtifactSession).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it("clears a stale validator checkpoint when a successful response stops advertising validators", async () => {
    const write = vi.fn(async () => {});
    const validators: HttpValidatorClient = {
      async read() {
        return { etag: '"old"', lastModified: null };
      },
      write,
    };
    const base: ApiTransport = vi.fn(async () => ({
      statusCode: 200,
      headers: {},
      body: new TextEncoder().encode('{"ok":true}'),
    }));
    const conditional = createConditionalHttpChangeWatch(base, validators);
    const acquirer = conditional.wrap({
      executor: { executorId: "fixture", version: "1.0.0", mode: "FIXTURE" },
      async acquire() {
        await conditional.transport(request);
        return [];
      },
    });

    await acquirer.acquire(context());

    expect(write).toHaveBeenCalledWith(expect.anything(), "https://example.com/feed?b=2&a=1", {
      etag: null,
      lastModified: null,
    });
  });
});
