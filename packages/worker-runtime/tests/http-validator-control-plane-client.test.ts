import { describe, expect, it, vi } from "vitest";
import type { ArtifactBackedExecutionContext } from "../src/artifact-backed-collection-executor";
import { HttpValidatorControlPlaneClient } from "../src/conditional-http-change-watch";

const context = {
  lease: { id: "lse_fixture" },
  leaseToken: "lease-token",
} as ArtifactBackedExecutionContext;

describe("HttpValidatorControlPlaneClient", () => {
  it("uses the active Worker credential and lease token for checkpoint reads", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        authorization: "Bearer worker-secret",
        "x-lease-token": "lease-token",
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        workerId: "wrk_fixture",
        leaseId: "lse_fixture",
        operation: "READ",
        canonicalUri: "https://example.com/feed",
      });
      return new Response(
        JSON.stringify({
          checkpoint: { etag: '"v1"', lastModified: "Tue, 18 Aug 2026 10:00:00 GMT" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const client = new HttpValidatorControlPlaneClient(
      "https://control.example.test/",
      "wrk_fixture",
      "worker-secret",
      fetcher as typeof fetch,
    );

    await expect(client.read(context, "https://example.com/feed")).resolves.toEqual({
      etag: '"v1"',
      lastModified: "Tue, 18 Aug 2026 10:00:00 GMT",
    });
  });
});
