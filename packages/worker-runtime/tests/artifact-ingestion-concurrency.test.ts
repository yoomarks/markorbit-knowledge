import { describe, expect, it } from "vitest";
import type {
  ArtifactIngestionReceipt,
  ArtifactIngestionSession,
  ArtifactUploadDescriptor,
  ExecutionAttempt,
} from "@markorbit/contracts";
import {
  ArtifactBackedCollectionExecutor,
  type ArtifactBackedExecutionClient,
  type ArtifactBackedExecutionContext,
  type CollectionArtifactAcquirer,
} from "../src/artifact-backed-collection-executor";

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function context(kinds: Array<"HTML" | "PDF"> = ["HTML"]): ArtifactBackedExecutionContext {
  return {
    workerId: "wrk_fixture",
    leaseToken: "lease-token",
    lease: { id: "lse_fixture" },
    job: {
      jobType: "WEB_CRAWL",
      planSnapshot: { output: { artifactKinds: kinds } },
    },
  } as unknown as ArtifactBackedExecutionContext;
}
function htmlAcquirer(count: number): CollectionArtifactAcquirer {
  return {
    executor: { executorId: "fixture", version: "1.0.0", mode: "FIXTURE" },
    async acquire() {
      return Array.from({ length: count }, (_, index) => ({
        artifactKind: "HTML" as const,
        mimeType: "text/html",
        originalName: `page-${index}.html`,
        sourceUri: `https://example.com/page-${index}`,
        canonicalUri: `https://example.com/page-${index}`,
        content: bytes(`<html>${index}</html>`),
      }));
    },
  };
}

type Fixture = {
  implementation: ArtifactBackedExecutionClient;
  maxActive: () => number;
  finalizedUris: string[];
  descriptors: ArtifactUploadDescriptor[];
};

function client(delayMs = 5): Fixture {
  const descriptors: ArtifactUploadDescriptor[] = [];
  const sessions = new Map<string, ArtifactUploadDescriptor>();
  const finalizedUris: string[] = [];
  let active = 0;
  let peak = 0;
  let nextSession = 0;
  const implementation: ArtifactBackedExecutionClient = {
    async start() {
      return {} as ExecutionAttempt;
    },
    async uploading() {},
    async createArtifactSession(_context, descriptor) {
      nextSession += 1;
      active += 1;
      peak = Math.max(peak, active);
      const id = `session-${nextSession}`;
      descriptors.push(descriptor);
      sessions.set(id, descriptor);
      return { id } as ArtifactIngestionSession;
    },
    async uploadArtifactContent() {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    },
    async finalizeArtifact(_context, sessionId) {
      const descriptor = sessions.get(sessionId)!;
      finalizedUris.push(descriptor.canonicalUri ?? descriptor.sourceUri);
      active -= 1;
      return {
        id: `receipt-${sessionId}`,
        artifactId: `art_${sessionId}`,
      } as ArtifactIngestionReceipt;
    },
    async verifying() {},
    async complete() {},
    async fail() {},
  };
  return {
    implementation,
    maxActive: () => peak,
    finalizedUris,
    descriptors,
  };
}

function lineageAcquirer(): CollectionArtifactAcquirer {
  return {
    executor: { executorId: "fixture", version: "1.0.0", mode: "FIXTURE" },
    async acquire() {
      return [
        {
          artifactKind: "PDF" as const,
          mimeType: "application/pdf",
          originalName: "rules.pdf",
          sourceUri: "https://example.com/rules.pdf",
          canonicalUri: "https://example.com/rules.pdf",
          parentCanonicalUris: ["https://example.com/a", "https://example.com/b"],
          content: bytes("%PDF fixture"),
        },
        {
          artifactKind: "HTML" as const,
          mimeType: "text/html",
          originalName: "a.html",
          sourceUri: "https://example.com/a",
          canonicalUri: "https://example.com/a",
          content: bytes("a"),
        },
        {
          artifactKind: "HTML" as const,
          mimeType: "text/html",
          originalName: "b.html",
          sourceUri: "https://example.com/b",
          canonicalUri: "https://example.com/b",
          content: bytes("b"),
        },
      ];
    },
  };
}

describe("artifact ingestion concurrency", () => {
  it("runs independent artifact ingestion concurrently within the configured bound", async () => {
    const fixture = client();
    const executor = new ArtifactBackedCollectionExecutor(htmlAcquirer(8), fixture.implementation, {
      ingestionConcurrency: 3,
    });

    const receipt = await executor.execute(context());

    expect(receipt).toBeTruthy();
    expect(receipt?.metadataOnly).toBe(false);
    if (!receipt || receipt.metadataOnly) throw new Error("Expected artifact ingestion receipt");
    expect(receipt.artifactReceiptIds).toHaveLength(8);
    expect(fixture.maxActive()).toBe(3);
  });
  it("waits for the whole parent layer before creating attachment sessions", async () => {
    const fixture = client(10);
    const executor = new ArtifactBackedCollectionExecutor(
      lineageAcquirer(),
      fixture.implementation,
      { ingestionConcurrency: 2 },
    );

    await executor.execute(context(["HTML", "PDF"]));

    expect(fixture.finalizedUris.slice(0, 2).sort()).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
    expect(fixture.finalizedUris[2]).toBe("https://example.com/rules.pdf");
    expect(fixture.descriptors[2]?.parentArtifactIds).toEqual(["art_session-1", "art_session-2"]);
  });

  it("rejects unsafe ingestion concurrency", () => {
    const fixture = client();
    expect(
      () =>
        new ArtifactBackedCollectionExecutor(htmlAcquirer(1), fixture.implementation, {
          ingestionConcurrency: 17,
        }),
    ).toThrow(/1 to 16/);
  });
});
