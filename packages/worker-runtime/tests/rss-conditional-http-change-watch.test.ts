import { describe, expect, it } from "vitest";
import type { ArtifactBackedExecutionContext } from "../src/artifact-backed-collection-executor";
import {
  createConditionalHttpChangeWatch,
  type HttpValidatorClient,
} from "../src/conditional-http-change-watch";
import { RssArtifactAcquirer } from "../src/rss-acquirer";
import type { ApiTransport } from "../src/api-acquirer";

function context(): ArtifactBackedExecutionContext {
  return {
    workerId: "wrk_fixture",
    leaseToken: "lease-token",
    lease: { id: "lse_fixture" },
    job: {
      jobType: "WEB_CRAWL",
      connector: { connectorId: "rss-worker", version: "1.0.0" },
      sourceSnapshot: {
        sourceType: "RSS",
        connectorConfig: { feedUrl: "https://feeds.example.test/news.xml" },
      },
      planSnapshot: {
        schedule: { mode: "CHANGE_WATCH", pollIntervalSeconds: 300 },
        output: { artifactKinds: ["XML", "JSON"] },
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

describe("RSS conditional HTTP change watch", () => {
  it("preserves the governed 304 no-change signal instead of converting it into an RSS transport failure", async () => {
    const validators: HttpValidatorClient = {
      async read() {
        return { etag: '"rss-v2"', lastModified: null };
      },
      async write() {},
    };
    const baseTransport: ApiTransport = async (request) => {
      expect(request.headers["if-none-match"]).toBe('"rss-v2"');
      return { statusCode: 304, headers: {}, body: new Uint8Array() };
    };
    const conditional = createConditionalHttpChangeWatch(baseTransport, validators);
    const acquirer = conditional.wrap(
      new RssArtifactAcquirer({
        resolver: async () => [{ address: "93.184.216.34", family: 4 }],
        transport: conditional.transport,
      }),
    );

    await expect(acquirer.acquire(context())).rejects.toMatchObject({
      name: "CollectionNotModifiedSignal",
      code: "HTTP_NOT_MODIFIED",
      canonicalUri: "https://feeds.example.test/news.xml",
    });
  });
});
