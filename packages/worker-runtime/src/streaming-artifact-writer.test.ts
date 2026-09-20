import { describe, expect, it, vi } from "vitest";
import type { ArtifactUploadDescriptor } from "@markorbit/contracts";
import type {
  AcquiredCollectionArtifact,
  ArtifactBackedExecutionClient,
  ArtifactBackedExecutionContext,
} from "./artifact-backed-collection-executor";
import {
  StreamingArtifactWriter,
  streamingArtifactIdempotencyKey,
} from "./streaming-artifact-writer";

const ARTIFACT_A = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ARTIFACT_B = "art_01ARZ3NDEKTSV4RRFFQ69G5FAW";

function context(): ArtifactBackedExecutionContext {
  return {
    leaseToken: "lease-token",
    job: {
      planSnapshot: {
        output: { artifactKinds: ["JSON"] },
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}
function artifact(input: {
  canonicalUri: string;
  content: string;
  parentCanonicalUris?: string[];
}): AcquiredCollectionArtifact {
  return {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: "evidence.json",
    sourceUri: "https://pub.sbj.cnipa.gov.cn/example",
    canonicalUri: input.canonicalUri,
    ...(input.parentCanonicalUris ? { parentCanonicalUris: input.parentCanonicalUris } : {}),
    content: new TextEncoder().encode(input.content),
  };
}

function uploadClient() {
  const descriptors: ArtifactUploadDescriptor[] = [];
  const sessions = new Map<string, ArtifactUploadDescriptor>();
  const ids = [ARTIFACT_A, ARTIFACT_B];
  let cursor = 0;
  const client = {
    checkArtifactContent: vi.fn(async () => ({
      unchanged: false,
      latestArtifactId: null,
      latestSha256: null,
    })),
    createArtifactSession: vi.fn(async (_context, descriptor) => {
      const id = `ing-test-${cursor}`;
      descriptors.push(descriptor);
      sessions.set(id, descriptor);
      return { id } as never;
    }),
    uploadArtifactContent: vi.fn(async () => undefined),
    finalizeArtifact: vi.fn(async (_context, sessionId) => {
      const descriptor = sessions.get(sessionId)!;
      const artifactId = ids[cursor++]!;
      return {
        artifactId,
        contentSha256: descriptor.expectedSha256,
        sizeBytes: descriptor.expectedSizeBytes,
      } as never;
    }),
  } as unknown as ArtifactBackedExecutionClient;
  return { client, descriptors };
}

describe("StreamingArtifactWriter", () => {
  it("finalizes artifacts immediately and resolves canonical parent lineage", async () => {
    const fixture = uploadClient();
    const writer = new StreamingArtifactWriter(context(), fixture.client);
    const raw = artifact({
      canonicalUri: "cnipa://gazette/source/1/raw",
      content: '{"raw":1}',
    });
    const projection = artifact({
      canonicalUri: "cnipa://gazette/source/1/projection",
      content: '{"projection":1}',
      parentCanonicalUris: [raw.canonicalUri!],
    });

    const rawResult = await writer.write(raw);
    const projectionResult = await writer.write(projection);

    expect(rawResult).toMatchObject({
      artifactId: ARTIFACT_A,
      reused: false,
    });
    expect(projectionResult).toMatchObject({
      artifactId: ARTIFACT_B,
      reused: false,
    });
    expect(fixture.descriptors[0]?.parentArtifactIds).toBeUndefined();
    expect(fixture.descriptors[1]?.parentArtifactIds).toEqual([ARTIFACT_A]);
    expect(writer.knownArtifactId(raw.canonicalUri!)).toBe(ARTIFACT_A);
    expect(writer.knownArtifactId(projection.canonicalUri!)).toBe(ARTIFACT_B);
  });

  it("reuses an already durable identical canonical artifact before upload", async () => {
    const client = {
      checkArtifactContent: vi.fn(async () => ({
        unchanged: true,
        latestArtifactId: ARTIFACT_A,
        latestSha256: "a".repeat(64),
      })),
      createArtifactSession: vi.fn(),
      uploadArtifactContent: vi.fn(),
      finalizeArtifact: vi.fn(),
    } as unknown as ArtifactBackedExecutionClient;
    const writer = new StreamingArtifactWriter(context(), client);
    const result = await writer.write(
      artifact({
        canonicalUri: "cnipa://gazette/source/1/raw",
        content: '{"raw":1}',
      }),
    );
    expect(result).toMatchObject({
      artifactId: ARTIFACT_A,
      reused: true,
    });
    expect(client.createArtifactSession).not.toHaveBeenCalled();
    expect(writer.knownArtifactId("cnipa://gazette/source/1/raw")).toBe(ARTIFACT_A);
  });

  it("fails closed when a child arrives before its canonical parent is durable", async () => {
    const fixture = uploadClient();
    const writer = new StreamingArtifactWriter(context(), fixture.client);
    await expect(
      writer.write(
        artifact({
          canonicalUri: "cnipa://gazette/source/1/projection",
          content: '{"projection":1}',
          parentCanonicalUris: ["cnipa://gazette/source/1/raw"],
        }),
      ),
    ).rejects.toMatchObject({
      code: "STREAM_ARTIFACT_PARENT_NOT_DURABLE",
      retryable: false,
    });
    expect(fixture.client.checkArtifactContent).not.toHaveBeenCalled();
  });

  it("can retain only cross-checkpoint identities needed by the next checkpoint", () => {
    const fixture = uploadClient();
    const writer = new StreamingArtifactWriter(context(), fixture.client);
    writer.remember("cnipa://gazette/dataset/identity", ARTIFACT_A);
    writer.remember("cnipa://gazette/checkpoint/1-3", ARTIFACT_B);
    writer.retainCanonicalUris(["cnipa://gazette/dataset/identity"]);
    expect(writer.knownArtifactId("cnipa://gazette/dataset/identity")).toBe(ARTIFACT_A);
    expect(writer.knownArtifactId("cnipa://gazette/checkpoint/1-3")).toBeNull();
  });

  it("uses a bounded deterministic idempotency key", () => {
    const value = streamingArtifactIdempotencyKey(
      artifact({
        canonicalUri: "cnipa://gazette/source/1/raw",
        content: '{"raw":1}',
      }),
    );
    expect(value).toMatch(/^stream-artifact-[a-f0-9]{16}-[a-f0-9]{16}$/u);
    expect(value.length).toBeLessThanOrEqual(128);
  });
});
