import { describe, expect, it, vi } from "vitest";
import type {
  ArtifactIngestionReceipt,
  ArtifactIngestionSession,
  ExecutionAttempt,
  ExecutionReceipt,
} from "@markorbit/contracts";
import {
  ArtifactBackedCollectionExecutor,
  type ArtifactBackedExecutionClient,
  type ArtifactBackedExecutionContext,
  type CollectionArtifactAcquirer,
} from "../src/artifact-backed-collection-executor";

function context(jobType: "WEB_CRAWL" | "PAGE_UPDATE_CHECK"): ArtifactBackedExecutionContext {
  return {
    workerId: "wrk_fixture",
    leaseToken: "lease-token",
    lease: { id: "lse_fixture" },
    job: {
      jobType,
      planSnapshot: { output: { artifactKinds: ["HTML"] } },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

function acquirer(): CollectionArtifactAcquirer {
  return {
    executor: { executorId: "fixture", version: "1.0.0", mode: "FIXTURE" },
    async acquire() {
      return [
        {
          artifactKind: "HTML" as const,
          mimeType: "text/html",
          originalName: "one.html",
          sourceUri: "https://example.com/one",
          canonicalUri: "https://example.com/one",
          content: new TextEncoder().encode("same"),
        },
        {
          artifactKind: "HTML" as const,
          mimeType: "text/html",
          originalName: "two.html",
          sourceUri: "https://example.com/two",
          canonicalUri: "https://example.com/two",
          content: new TextEncoder().encode("changed"),
        },
      ];
    },
  };
}

function client(options: { unchangedUris?: string[]; failChecks?: boolean } = {}) {
  const completed: ExecutionReceipt[] = [];
  const created: string[] = [];
  const uploaded: string[] = [];
  const finalized: string[] = [];
  const implementation: ArtifactBackedExecutionClient = {
    async start() {
      return {} as ExecutionAttempt;
    },
    async checkArtifactContent(_context, input) {
      if (options.failChecks) throw new Error("comparison unavailable");
      return {
        unchanged: options.unchangedUris?.includes(input.canonicalUri) ?? false,
        latestArtifactId: null,
        latestSha256: null,
      };
    },
    async uploading() {},
    async createArtifactSession(_context, descriptor) {
      created.push(descriptor.canonicalUri ?? descriptor.sourceUri);
      return { id: `session-${created.length}` } as ArtifactIngestionSession;
    },
    async uploadArtifactContent(_context, sessionId) {
      uploaded.push(sessionId);
    },
    async finalizeArtifact(_context, sessionId) {
      finalized.push(sessionId);
      return { id: `receipt-${sessionId}` } as ArtifactIngestionReceipt;
    },
    async verifying() {},
    async complete(_context, receipt) {
      completed.push(receipt);
    },
    async fail() {},
  };
  return { implementation, completed, created, uploaded, finalized };
}

describe("ArtifactBackedCollectionExecutor change-watch incrementality", () => {
  it("completes metadata-only when every observed artifact is unchanged", async () => {
    const fixture = client({
      unchangedUris: ["https://example.com/one", "https://example.com/two"],
    });
    const executor = new ArtifactBackedCollectionExecutor(acquirer(), fixture.implementation);

    const receipt = await executor.execute(context("PAGE_UPDATE_CHECK"));

    expect(receipt).toMatchObject({
      outputKinds: ["HTML"],
      itemsObserved: 2,
      bytesPrepared: 0,
      metadataOnly: true,
    });
    expect(receipt?.artifactReceiptIds).toBeUndefined();
    expect(fixture.created).toEqual([]);
    expect(fixture.uploaded).toEqual([]);
    expect(fixture.finalized).toEqual([]);
    expect(fixture.completed).toHaveLength(1);
  });

  it("uploads only changed artifacts and skips unchanged versions", async () => {
    const fixture = client({ unchangedUris: ["https://example.com/one"] });
    const executor = new ArtifactBackedCollectionExecutor(acquirer(), fixture.implementation);

    const receipt = await executor.execute(context("PAGE_UPDATE_CHECK"));

    expect(receipt).toMatchObject({
      itemsObserved: 1,
      metadataOnly: false,
    });
    expect(receipt?.summary).toContain("skipped 1 unchanged artifact");
    expect(fixture.created).toEqual(["https://example.com/two"]);
    expect(fixture.uploaded).toEqual(["session-1"]);
    expect(fixture.finalized).toEqual(["session-1"]);
  });

  it("fails open to immutable ingestion when identity comparison is unavailable", async () => {
    const fixture = client({ failChecks: true });
    const executor = new ArtifactBackedCollectionExecutor(acquirer(), fixture.implementation);

    const receipt = await executor.execute(context("PAGE_UPDATE_CHECK"));

    expect(receipt).toMatchObject({ itemsObserved: 2, metadataOnly: false });
    expect(fixture.created).toEqual(["https://example.com/one", "https://example.com/two"]);
  });

  it("does not invoke change detection for ordinary web crawls", async () => {
    const fixture = client({
      unchangedUris: ["https://example.com/one", "https://example.com/two"],
    });
    const check = vi.spyOn(fixture.implementation, "checkArtifactContent");
    const executor = new ArtifactBackedCollectionExecutor(acquirer(), fixture.implementation);

    const receipt = await executor.execute(context("WEB_CRAWL"));

    expect(check).not.toHaveBeenCalled();
    expect(receipt).toMatchObject({ itemsObserved: 2, metadataOnly: false });
    expect(fixture.created).toHaveLength(2);
  });
});
