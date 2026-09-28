import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ArtifactBackedExecutionContext } from "./artifact-backed-collection-executor";
import {
  HttpGlobalTrademarkDurableArtifactReader,
  httpGlobalTrademarkDurableArtifactReaderDescriptor,
} from "./http-global-trademark-durable-artifact-reader";

const WORKER_ID = "wrk_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const CANONICAL = "la-dipo://wopublish/trademarks/list/page/1/fact-admission-request";
function context(): ArtifactBackedExecutionContext {
  return {
    workerId: WORKER_ID,
    leaseToken: "lease-token",
    lease: { id: "lse_01ARZ3NDEKTSV4RRFFQ69G5FAV" },
  } as unknown as ArtifactBackedExecutionContext;
}
function response(content: Uint8Array, sha = createHash("sha256").update(content).digest("hex")) {
  return new Response(content as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-length": String(content.byteLength),
      "x-markorbit-artifact-kind": "JSON",
      "x-markorbit-original-mime": "application/json",
      "x-markorbit-original-name": encodeURIComponent("global-request.json"),
      "x-markorbit-canonical-uri": encodeURIComponent(CANONICAL),
      "x-markorbit-content-sha256": sha,
    },
  });
}
describe("HttpGlobalTrademarkDurableArtifactReader", () => {
  it("reads through the generic lease-scoped fact-admission endpoint and verifies integrity", async () => {
    const content = new TextEncoder().encode('{"schemaVersion":"fixture"}');
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const reader = new HttpGlobalTrademarkDurableArtifactReader(
      "https://knowledge.example.test/",
      WORKER_ID,
      "worker-secret",
      async (input, init) => {
        seen.push({ url: String(input), init });
        return response(content);
      },
    );
    const artifact = await reader.read(ARTIFACT_ID, context());
    expect(seen[0]?.url).toBe(
      "https://knowledge.example.test/api/worker/v1/fact-admissions/artifacts/" +
        ARTIFACT_ID +
        "/content",
    );
    expect(seen[0]?.init?.headers).toMatchObject({
      authorization: "Bearer worker-secret",
      "x-worker-id": WORKER_ID,
      "x-lease-token": "lease-token",
    });
    expect(artifact.canonicalUri).toBe(CANONICAL);
    expect(new TextDecoder().decode(artifact.content)).toBe('{"schemaVersion":"fixture"}');
  });
  it("fails closed on mismatched response bytes and wrong Worker identity", async () => {
    const content = new TextEncoder().encode('{"value":1}');
    const reader = new HttpGlobalTrademarkDurableArtifactReader(
      "https://knowledge.example.test",
      WORKER_ID,
      "worker-secret",
      async () => response(content, "a".repeat(64)),
    );
    await expect(reader.read(ARTIFACT_ID, context())).rejects.toMatchObject({
      code: "KNOWLEDGE_ARTIFACT_READ_INTEGRITY_FAILED",
    });
    const other = context();
    other.workerId = "wrk_01ARZ3NDEKTSV4RRFFQ69G5FAW";
    await expect(reader.read(ARTIFACT_ID, other)).rejects.toMatchObject({
      code: "KNOWLEDGE_ARTIFACT_READ_AUTHORITY_INVALID",
    });
  });
  it("declares lease/job/workspace and SHA boundaries", () => {
    expect(httpGlobalTrademarkDurableArtifactReaderDescriptor()).toEqual({
      endpointScope: "/api/worker/v1/fact-admissions/artifacts/:id/content",
      workerCredentialRequired: true,
      activeLeaseRequired: true,
      jobSnapshotArtifactAuthorizationRequired: true,
      workspaceBoundaryRequired: true,
      responseSha256Verified: true,
    });
  });
});
