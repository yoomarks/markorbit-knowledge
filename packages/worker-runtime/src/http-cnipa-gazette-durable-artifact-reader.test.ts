import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ArtifactBackedExecutionContext } from "./artifact-backed-collection-executor";
import {
  HttpCnipaGazetteDurableArtifactReader,
  httpCnipaGazetteDurableArtifactReaderDescriptor,
} from "./http-cnipa-gazette-durable-artifact-reader";

const WORKER_ID = "wrk_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";

function context(): ArtifactBackedExecutionContext {
  return {
    workerId: WORKER_ID,
    leaseToken: "lease-secret",
    lease: { id: "lse_01ARZ3NDEKTSV4RRFFQ69G5FAV" },
  } as unknown as ArtifactBackedExecutionContext;
}

function artifactResponse(
  content: Uint8Array,
  sha = createHash("sha256").update(content).digest("hex"),
) {
  return new Response(content as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-length": String(content.byteLength),
      "x-markorbit-artifact-kind": "JSON",
      "x-markorbit-original-mime": "application/json",
      "x-markorbit-original-name": encodeURIComponent("request.json"),
      "x-markorbit-canonical-uri": encodeURIComponent(
        "cnipa://trademark-gazette/issue/75/dataset/abc/fact-admission/chunk/1-1/request",
      ),
      "x-markorbit-content-sha256": sha,
    },
  });
}

describe("HttpCnipaGazetteDurableArtifactReader", () => {
  it("reads through the Worker lease-scoped endpoint and verifies response integrity", async () => {
    const content = new TextEncoder().encode('{"schemaVersion":"fixture"}');
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const reader = new HttpCnipaGazetteDurableArtifactReader(
      "https://knowledge.example.test/",
      WORKER_ID,
      "worker-secret",
      async (input, init) => {
        seen.push({ url: String(input), init });
        return artifactResponse(content);
      },
    );

    const artifact = await reader.read(ARTIFACT_ID, context());

    expect(seen[0]?.url).toBe(
      `https://knowledge.example.test/api/worker/v1/cnipa-gazette/artifacts/${ARTIFACT_ID}/content`,
    );
    expect(seen[0]?.init?.headers).toMatchObject({
      authorization: "Bearer worker-secret",
      "x-worker-id": WORKER_ID,
      "x-lease-id": "lse_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "x-lease-token": "lease-secret",
    });
    expect(artifact).toMatchObject({
      artifactKind: "JSON",
      mimeType: "application/json",
      originalName: "request.json",
      sourceUri: `markorbit://raw-artifact/${ARTIFACT_ID}`,
      canonicalUri:
        "cnipa://trademark-gazette/issue/75/dataset/abc/fact-admission/chunk/1-1/request",
    });
    expect(new TextDecoder().decode(artifact.content)).toBe('{"schemaVersion":"fixture"}');
  });

  it("fails closed before use when response bytes do not match the control-plane SHA", async () => {
    const content = new TextEncoder().encode('{"value":1}');
    const reader = new HttpCnipaGazetteDurableArtifactReader(
      "https://knowledge.example.test",
      WORKER_ID,
      "worker-secret",
      async () => artifactResponse(content, "a".repeat(64)),
    );

    await expect(reader.read(ARTIFACT_ID, context())).rejects.toMatchObject({
      code: "KNOWLEDGE_ARTIFACT_READ_INTEGRITY_FAILED",
      retryable: false,
    });
  });

  it("rejects a context claimed by another Worker before making an HTTP request", async () => {
    let called = false;
    const reader = new HttpCnipaGazetteDurableArtifactReader(
      "https://knowledge.example.test",
      WORKER_ID,
      "worker-secret",
      async () => {
        called = true;
        return new Response();
      },
    );
    const input = context();
    input.workerId = "wrk_01ARZ3NDEKTSV4RRFFQ69G5FAW";

    await expect(reader.read(ARTIFACT_ID, input)).rejects.toMatchObject({
      code: "KNOWLEDGE_ARTIFACT_READ_AUTHORITY_INVALID",
    });
    expect(called).toBe(false);
  });

  it("declares the lease/job/workspace and SHA boundaries", () => {
    expect(httpCnipaGazetteDurableArtifactReaderDescriptor()).toEqual({
      endpointScope: "/api/worker/v1/cnipa-gazette/artifacts/:id/content",
      workerCredentialRequired: true,
      activeLeaseRequired: true,
      jobSnapshotArtifactAuthorizationRequired: true,
      workspaceBoundaryRequired: true,
      responseSha256Verified: true,
    });
  });
});
