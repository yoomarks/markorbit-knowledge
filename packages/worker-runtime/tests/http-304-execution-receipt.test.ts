import { describe, expect, it, vi } from "vitest";
import {
  isExecutionReceipt,
  type ExecutionAttempt,
  type ExecutionReceipt,
} from "@markorbit/contracts";
import {
  ArtifactBackedCollectionExecutor,
  CollectionNotModifiedSignal,
  type ArtifactBackedExecutionClient,
  type ArtifactBackedExecutionContext,
  type CollectionArtifactAcquirer,
} from "../src/artifact-backed-collection-executor";

function context(): ArtifactBackedExecutionContext {
  return {
    workerId: "wrk_fixture",
    leaseToken: "lease-token",
    lease: { id: "lse_fixture" },
    job: {
      jobType: "API_COLLECTION",
      planSnapshot: {
        schedule: { mode: "CHANGE_WATCH", pollIntervalSeconds: 300 },
        output: { artifactKinds: ["JSON", "XML"] },
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

describe("HTTP 304 execution receipt", () => {
  it("uses the authorized plan output kinds so the control-plane receipt contract accepts it", async () => {
    const complete = vi.fn(async (_context, receipt: ExecutionReceipt) => {
      expect(isExecutionReceipt(receipt)).toBe(true);
    });
    const client: ArtifactBackedExecutionClient = {
      async start() {
        return {} as ExecutionAttempt;
      },
      async uploading() {},
      async createArtifactSession() {
        throw new Error("not expected");
      },
      async uploadArtifactContent() {},
      async finalizeArtifact() {
        throw new Error("not expected");
      },
      async verifying() {},
      complete,
      async fail() {
        throw new Error("not expected");
      },
    };
    const acquirer: CollectionArtifactAcquirer = {
      executor: { executorId: "api-worker", version: "1.0.0", mode: "PRODUCTION" },
      async acquire() {
        throw new CollectionNotModifiedSignal("https://example.test/feed");
      },
    };

    const receipt = await new ArtifactBackedCollectionExecutor(acquirer, client).execute(context());

    expect(receipt).toMatchObject({
      outputKinds: ["JSON", "XML"],
      itemsObserved: 0,
      bytesPrepared: 0,
      metadataOnly: true,
    });
    expect(receipt && isExecutionReceipt(receipt)).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
