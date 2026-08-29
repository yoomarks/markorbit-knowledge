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

const PAGE_A_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const PAGE_B_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const ATTACHMENT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAX";
const PAGE_A_OLD_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAY";
const ATTACHMENT_OLD_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAZ";

function context(changeWatch = false): ArtifactBackedExecutionContext {
  return {
    workerId: "wrk_fixture",
    leaseToken: "lease-token",
    lease: { id: "lse_fixture" },
    job: {
      jobType: changeWatch ? "PAGE_UPDATE_CHECK" : "WEB_CRAWL",
      planSnapshot: {
        schedule: changeWatch
          ? { mode: "CHANGE_WATCH", pollIntervalSeconds: 300 }
          : { mode: "INTERVAL", intervalSeconds: 3600 },
        output: { artifactKinds: ["HTML", "PDF"] },
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
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
          parentCanonicalUris: ["https://example.com/page-b", "https://example.com/page-a"],
          content: bytes("%PDF-1.4 fixture"),
        },
        {
          artifactKind: "HTML" as const,
          mimeType: "text/html",
          originalName: "page-b.html",
          sourceUri: "https://example.com/page-b",
          canonicalUri: "https://example.com/page-b",
          content: bytes("<html>b</html>"),
        },
        {
          artifactKind: "HTML" as const,
          mimeType: "text/html",
          originalName: "page-a.html",
          sourceUri: "https://example.com/page-a",
          canonicalUri: "https://example.com/page-a",
          content: bytes("<html>a</html>"),
        },
      ];
    },
  };
}

function client(
  options: {
    unchangedArtifacts?: Map<string, string | null>;
  } = {},
): {
  implementation: ArtifactBackedExecutionClient;
  descriptors: ArtifactUploadDescriptor[];
  failures: Array<{ code: string; message: string; retryable: boolean }>;
} {
  const descriptors: ArtifactUploadDescriptor[] = [];
  const sessions = new Map<string, ArtifactUploadDescriptor>();
  const failures: Array<{ code: string; message: string; retryable: boolean }> = [];
  let nextSession = 0;

  const artifactIdFor = (descriptor: ArtifactUploadDescriptor): string => {
    if (descriptor.canonicalUri === "https://example.com/page-a") return PAGE_A_ID;
    if (descriptor.canonicalUri === "https://example.com/page-b") return PAGE_B_ID;
    return ATTACHMENT_ID;
  };

  const implementation: ArtifactBackedExecutionClient = {
    async start() {
      return {} as ExecutionAttempt;
    },
    async checkArtifactContent(_context, input) {
      if (options.unchangedArtifacts?.has(input.canonicalUri)) {
        return {
          unchanged: true,
          latestArtifactId: options.unchangedArtifacts.get(input.canonicalUri) ?? null,
          latestSha256: "a".repeat(64),
        };
      }
      return { unchanged: false, latestArtifactId: null, latestSha256: null };
    },
    async uploading() {},
    async createArtifactSession(_context, descriptor) {
      nextSession += 1;
      const sessionId = `session-${nextSession}`;
      descriptors.push(descriptor);
      sessions.set(sessionId, descriptor);
      return { id: sessionId } as ArtifactIngestionSession;
    },
    async uploadArtifactContent() {},
    async finalizeArtifact(_context, sessionId) {
      const descriptor = sessions.get(sessionId)!;
      return {
        id: `receipt-${sessionId}`,
        artifactId: artifactIdFor(descriptor),
      } as ArtifactIngestionReceipt;
    },
    async verifying() {},
    async complete() {},
    async fail(_context, failure) {
      failures.push(failure);
    },
  };
  return { implementation, descriptors, failures };
}

describe("attachment parent artifact lineage", () => {
  it("finalizes all parent pages before an attachment and binds every immutable parent id", async () => {
    const fixture = client();
    const executor = new ArtifactBackedCollectionExecutor(
      lineageAcquirer(),
      fixture.implementation,
    );

    await executor.execute(context(false));

    expect(fixture.descriptors.map((descriptor) => descriptor.canonicalUri)).toEqual([
      "https://example.com/page-b",
      "https://example.com/page-a",
      "https://example.com/rules.pdf",
    ]);
    expect(fixture.descriptors[2]?.parentArtifactIds).toEqual([PAGE_A_ID, PAGE_B_ID]);
  });

  it("reuses latest immutable parent ids when change-watch skips unchanged pages", async () => {
    const fixture = client({
      unchangedArtifacts: new Map([
        ["https://example.com/page-a", PAGE_A_ID],
        ["https://example.com/page-b", PAGE_B_ID],
      ]),
    });
    const executor = new ArtifactBackedCollectionExecutor(
      lineageAcquirer(),
      fixture.implementation,
    );

    const receipt = await executor.execute(context(true));

    expect(receipt).toMatchObject({ itemsObserved: 1, metadataOnly: false });
    expect(fixture.descriptors).toHaveLength(1);
    expect(fixture.descriptors[0]).toMatchObject({
      canonicalUri: "https://example.com/rules.pdf",
      parentArtifactIds: [PAGE_A_ID, PAGE_B_ID],
    });
  });

  it("re-observes an unchanged attachment when a parent changes so lineage binds the new parent version", async () => {
    const fixture = client({
      unchangedArtifacts: new Map([
        ["https://example.com/page-b", PAGE_B_ID],
        ["https://example.com/rules.pdf", ATTACHMENT_OLD_ID],
      ]),
    });
    const executor = new ArtifactBackedCollectionExecutor(
      lineageAcquirer(),
      fixture.implementation,
    );

    const receipt = await executor.execute(context(true));

    expect(receipt).toMatchObject({ itemsObserved: 2, metadataOnly: false });
    expect(receipt?.summary).toContain("1 unchanged child artifact(s) were re-observed");
    expect(fixture.descriptors.map((descriptor) => descriptor.canonicalUri)).toEqual([
      "https://example.com/page-a",
      "https://example.com/rules.pdf",
    ]);
    expect(fixture.descriptors[1]).toMatchObject({
      canonicalUri: "https://example.com/rules.pdf",
      parentArtifactIds: [PAGE_A_ID, PAGE_B_ID],
    });
    expect(fixture.descriptors[1]?.parentArtifactIds).not.toContain(PAGE_A_OLD_ID);
  });

  it("keeps the metadata-only fast path when parent pages and attachment are all unchanged", async () => {
    const fixture = client({
      unchangedArtifacts: new Map([
        ["https://example.com/page-a", PAGE_A_ID],
        ["https://example.com/page-b", PAGE_B_ID],
        ["https://example.com/rules.pdf", ATTACHMENT_OLD_ID],
      ]),
    });
    const executor = new ArtifactBackedCollectionExecutor(
      lineageAcquirer(),
      fixture.implementation,
    );

    const receipt = await executor.execute(context(true));

    expect(receipt).toMatchObject({ itemsObserved: 3, bytesPrepared: 0, metadataOnly: true });
    expect(fixture.descriptors).toEqual([]);
  });

  it("fails closed instead of dropping parent lineage when an immutable parent cannot be resolved", async () => {
    const fixture = client({
      unchangedArtifacts: new Map([
        ["https://example.com/page-a", PAGE_A_ID],
        ["https://example.com/page-b", null],
      ]),
    });
    const executor = new ArtifactBackedCollectionExecutor(
      lineageAcquirer(),
      fixture.implementation,
    );

    await expect(executor.execute(context(true))).rejects.toMatchObject({
      code: "ATTACHMENT_PARENT_ARTIFACT_UNRESOLVED",
      retryable: false,
    });
    expect(fixture.descriptors).toEqual([]);
    expect(fixture.failures).toEqual([
      expect.objectContaining({ code: "ATTACHMENT_PARENT_ARTIFACT_UNRESOLVED" }),
    ]);
  });
});
