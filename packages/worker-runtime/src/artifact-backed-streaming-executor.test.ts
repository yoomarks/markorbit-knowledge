import { describe, expect, it } from "vitest";
import type {
  ArtifactIngestionReceipt,
  ArtifactIngestionSession,
  ArtifactUploadDescriptor,
  ExecutionAttempt,
  ExecutionReceipt,
  Job,
  JobLease,
} from "@markorbit/contracts";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionClient,
  type ArtifactBackedExecutionContext,
  type CollectionArtifactAcquirer,
  StreamingArtifactBackedCollectionExecutor,
} from "./artifact-backed-collection-executor";
import {
  ControlledCollectionWorkerRuntime,
  type ControlledCollectionWorkerClient,
} from "./controlled-collection-worker-runtime";

const encoder = new TextEncoder();
const rootUri = "la-dipo://wopublish/trademarks/list/page/";
function page(index: number): readonly AcquiredCollectionArtifact[] {
  const rawUri = rootUri + index + "/redacted-response";
  return [
    {
      artifactKind: "HTML",
      mimeType: "text/html",
      originalName: "page-" + index + ".html",
      sourceUri: "https://online.dip.gov.la/wopublish-search/public/trademarks?0",
      canonicalUri: rawUri,
      content: encoder.encode("<html>page " + index + "</html>"),
    },
    {
      artifactKind: "JSON",
      mimeType: "application/json",
      originalName: "page-" + index + "-ids.json",
      sourceUri: "https://online.dip.gov.la/wopublish-search/public/trademarks?0",
      canonicalUri: rootUri + index + "/source-id-projection",
      parentCanonicalUris: [rawUri],
      content: encoder.encode(JSON.stringify({ sourceRecordIds: ["LA" + index] })),
    },
  ];
}
function context(): ArtifactBackedExecutionContext {
  return {
    workerId: "wrk_fixture",
    leaseToken: "valid-lease-token",
    lease: { id: "lse_fixture" } as JobLease,
    job: {
      planSnapshot: {
        schedule: { mode: "MANUAL" },
        output: { artifactKinds: ["HTML", "JSON"] },
      },
    } as Job,
  };
}
type Recorded = {
  events: string[];
  descriptors: ArtifactUploadDescriptor[];
  completed: ExecutionReceipt[];
  failures: Array<{ code: string; message: string; retryable: boolean }>;
};
function client(): { api: ArtifactBackedExecutionClient; record: Recorded } {
  const record: Recorded = { events: [], descriptors: [], completed: [], failures: [] };
  const sessions = new Map<string, ArtifactUploadDescriptor>();
  let sequence = 0;
  const api: ArtifactBackedExecutionClient = {
    async start() {
      record.events.push("start");
      return {} as ExecutionAttempt;
    },
    async uploading() {
      record.events.push("uploading");
    },
    async createArtifactSession(_context, descriptor) {
      record.descriptors.push(descriptor);
      const id = "ais_" + String(++sequence).padStart(26, "0");
      sessions.set(id, descriptor);
      record.events.push("create:" + descriptor.canonicalUri);
      return { id } as ArtifactIngestionSession;
    },
    async uploadArtifactContent(_context, sessionId, content) {
      expect(content.byteLength).toBe(sessions.get(sessionId)?.expectedSizeBytes);
    },
    async finalizeArtifact(_context, sessionId) {
      const descriptor = sessions.get(sessionId);
      if (!descriptor) throw new Error("missing session");
      record.events.push("finalize:" + descriptor.canonicalUri);
      const suffix = sessionId.slice(4);
      return {
        id: "air_" + suffix,
        artifactId: "art_" + suffix,
      } as ArtifactIngestionReceipt;
    },
    async verifying() {
      record.events.push("verifying");
    },
    async complete(_context, receipt) {
      record.events.push("complete");
      record.completed.push(receipt);
    },
    async fail(_context, failure) {
      record.events.push("fail");
      record.failures.push(failure);
    },
  };
  return { api, record };
}
describe("governed streaming ArtifactBackedCollectionExecutor", () => {
  it("finalizes each entire page and its raw parent before fetching the next", async () => {
    const { api, record } = client();
    const acquirer: CollectionArtifactAcquirer = {
      executor: { executorId: "la-test", version: "1.0.0", mode: "PRODUCTION" },
      acquire: async () => {
        throw new Error("must not use bulk acquire");
      },
      isStreamingJob: () => true,
      async *acquireBatches() {
        record.events.push("fetch:1");
        yield page(1);
        expect(record.events).toContain("finalize:" + rootUri + "1/source-id-projection");
        record.events.push("fetch:2");
        yield page(2);
      },
    };
    const receipt = await new StreamingArtifactBackedCollectionExecutor(acquirer, api, {
      ingestionConcurrency: 1,
    }).execute(context());
    expect(record.events.indexOf("fetch:2")).toBeGreaterThan(
      record.events.indexOf("finalize:" + rootUri + "1/source-id-projection"),
    );
    expect(record.events.filter((item) => item === "uploading")).toHaveLength(1);
    expect(record.events.at(-1)).toBe("complete");
    expect(receipt).toMatchObject({
      itemsObserved: 4,
      metadataOnly: false,
    });
    if (receipt.metadataOnly)
      throw new Error("Streaming evidence receipt must not be metadata-only");
    expect(receipt.artifactReceiptIds).toHaveLength(4);
    expect(record.descriptors[1]?.parentArtifactIds).toEqual(["art_" + "1".padStart(26, "0")]);
    expect(record.descriptors[3]?.parentArtifactIds).toEqual(["art_" + "3".padStart(26, "0")]);
    expect(record.failures).toEqual([]);
  });

  it("retains already-finalized page evidence and marks job failed on source drift", async () => {
    const { api, record } = client();
    const acquirer: CollectionArtifactAcquirer = {
      executor: { executorId: "la-test", version: "1.0.0", mode: "PRODUCTION" },
      acquire: async () => [],
      isStreamingJob: () => true,
      async *acquireBatches() {
        yield page(1);
        throw new Error("next Wicket page drifted");
      },
    };
    await expect(
      new StreamingArtifactBackedCollectionExecutor(acquirer, api).execute(context()),
    ).rejects.toThrow("next Wicket page drifted");
    expect(record.events).toContain("finalize:" + rootUri + "1/source-id-projection");
    expect(record.completed).toEqual([]);
    expect(record.failures).toHaveLength(1);
    expect(record.failures[0]?.retryable).toBe(false);
  });

  it("fails closed on cross-page canonical duplication and no lease", async () => {
    const { api, record } = client();
    const acquirer: CollectionArtifactAcquirer = {
      executor: { executorId: "la-test", version: "1.0.0", mode: "PRODUCTION" },
      acquire: async () => [],
      isStreamingJob: () => true,
      async *acquireBatches() {
        yield page(1);
        yield page(1);
      },
    };
    await expect(
      new StreamingArtifactBackedCollectionExecutor(acquirer, api).execute(context()),
    ).rejects.toMatchObject({ code: "STREAM_CANONICAL_URI_REPEATED" });
    expect(record.descriptors).toHaveLength(2);
    expect(record.completed).toHaveLength(0);
    const badLease = { ...context(), leaseToken: "" };
    await expect(
      new StreamingArtifactBackedCollectionExecutor(acquirer, api).execute(badLease),
    ).rejects.toMatchObject({ code: "LEASE_TOKEN_REQUIRED" });
  });
  it("selects streaming only after a true controlled Worker claim and opt-in", async () => {
    const { api, record } = client();
    const claimContext = context();
    const controlled: ControlledCollectionWorkerClient = {
      ...api,
      workerId: claimContext.workerId,
      async heartbeat() {},
      async renewLease() {
        return claimContext.lease;
      },
      async claim() {
        return {
          job: claimContext.job,
          lease: claimContext.lease,
          leaseToken: claimContext.leaseToken,
        };
      },
    };
    const acquirer: CollectionArtifactAcquirer = {
      executor: { executorId: "la-test", version: "1.0.0", mode: "PRODUCTION" },
      acquire: async () => {
        throw new Error("bulk path should not be called");
      },
      isStreamingJob: () => true,
      async *acquireBatches() {
        yield page(1);
      },
    };
    const processed = await new ControlledCollectionWorkerRuntime(controlled, acquirer, {
      keepAliveIntervalMs: 1_000,
    }).runOnce();
    expect(processed).toBe(true);
    expect(record.completed).toHaveLength(1);
    expect(record.completed[0]?.itemsObserved).toBe(2);
    expect(record.failures).toEqual([]);
  });
});
