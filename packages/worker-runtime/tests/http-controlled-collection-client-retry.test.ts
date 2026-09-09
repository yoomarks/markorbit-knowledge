import { describe, expect, it, vi } from "vitest";
import {
  HttpControlledCollectionClient,
  WorkerControlPlaneHttpError,
} from "../src/http-controlled-collection-client";
import type { ArtifactBackedExecutionContext } from "../src/artifact-backed-collection-executor";

function jsonResponse(status = 200, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientWith(fetcher: typeof fetch, delays: number[], maxAttempts = 3, baseDelayMs = 10) {
  return new HttpControlledCollectionClient(
    "http://127.0.0.1:3000",
    "wrk_test",
    "credential",
    fetcher,
    { maxAttempts, baseDelayMs, sleep: async (delayMs) => void delays.push(delayMs) },
  );
}
describe("HttpControlledCollectionClient transient retries", () => {
  it("retries network failures for idempotent control-plane requests", async () => {
    const delays: number[] = [];
    let attempts = 0;
    const fetcher = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) throw new TypeError("fetch failed");
      return jsonResponse();
    }) as unknown as typeof fetch;
    const client = clientWith(fetcher, delays);

    await client.heartbeat("test-runtime");

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([10, 20]);
  });

  it("retries transient 503 responses and then succeeds", async () => {
    const delays: number[] = [];
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse()) as unknown as typeof fetch;
    const client = clientWith(fetcher, delays);

    await client.heartbeat("test-runtime");

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([10]);
  });

  it("does not retry non-transient HTTP errors", async () => {
    const delays: number[] = [];
    const fetcher = vi.fn(async () =>
      jsonResponse(401, { error: { message: "denied" } }),
    ) as unknown as typeof fetch;
    const client = clientWith(fetcher, delays);

    const error = await client.heartbeat("test-runtime").catch((value) => value);

    expect(error).toBeInstanceOf(WorkerControlPlaneHttpError);
    expect((error as WorkerControlPlaneHttpError).status).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it("never retries claim transport failures", async () => {
    const delays: number[] = [];
    const fetcher = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const client = clientWith(fetcher, delays);

    const error = await client.claim().catch((value) => value);

    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toBe("fetch failed");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it("classifies exhausted network failures as retryable collection failures", async () => {
    const delays: number[] = [];
    const fetcher = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const client = clientWith(fetcher, delays);

    const error = await client.heartbeat("test-runtime").catch((value) => value);

    expect(error).toMatchObject({
      code: "CONTROL_PLANE_TRANSPORT_FAILED",
      retryable: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([10, 20]);
  });

  it("retries artifact content upload after a transport failure", async () => {
    const delays: number[] = [];
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response(null, { status: 204 })) as unknown as typeof fetch;
    const client = clientWith(fetcher, delays);
    const context = {
      lease: { id: "lease_test" },
      leaseToken: "lease-token",
    } as ArtifactBackedExecutionContext;

    await client.uploadArtifactContent(context, "session-test", new TextEncoder().encode("body"));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([10]);
  });
});
