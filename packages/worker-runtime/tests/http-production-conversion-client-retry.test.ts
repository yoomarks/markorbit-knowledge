import type { ConversionClaimRequest, ConversionClaimResult } from "@markorbit/contracts";
import { describe, expect, it, vi } from "vitest";
import { HttpProductionConversionClient } from "../src/http-production-conversion-client";
import type { ProductionMarkdownStagingContext } from "../src/production-markdown-staging";

const WORKSPACE_ID = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const WORKER_ID = "wrk_01ARZ3NDEKTSV4RRFFQ69G5FAW";

function noWork(idempotencyKey = "claim-test"): ConversionClaimResult {
  return {
    contractVersion: "1.0",
    objectType: "CONVERSION_CLAIM_RESULT",
    id: "ccs_01ARZ3NDEKTSV4RRFFQ69G5FAX",
    workspaceId: WORKSPACE_ID,
    workerId: WORKER_ID,
    result: "NO_COMPATIBLE_WORK",
    idempotencyKey,
  } as ConversionClaimResult;
}

function jsonResponse(status = 200, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientWith(fetchImpl: typeof fetch, delays: number[]) {
  return new HttpProductionConversionClient("http://127.0.0.1:3000", WORKER_ID, "credential", {
    fetchImpl,
    maxAttempts: 3,
    baseDelayMs: 10,
    sleep: async (delayMs) => void delays.push(delayMs),
  });
}

function claimRequest(): ConversionClaimRequest {
  return { idempotencyKey: "claim-test" } as ConversionClaimRequest;
}

function stagingContext(): ProductionMarkdownStagingContext {
  return {
    workspaceId: WORKSPACE_ID,
    workerId: WORKER_ID,
    conversionRunId: "cvr_test",
    conversionAttemptId: "cva_test",
    converter: { converterId: "markdown-staging", version: "1.0.0" },
    lease: {
      id: "cvl_test",
      generation: 1,
      tokenReference: "token-ref",
      tokenDigest: "0".repeat(64),
    },
  } as ProductionMarkdownStagingContext;
}

describe("HttpProductionConversionClient transient retries", () => {
  it("retries a replay-safe claim with the same request body after transport failure", async () => {
    const delays: number[] = [];
    const bodies: string[] = [];
    let attempts = 0;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ""));
      attempts += 1;
      if (attempts === 1) throw new TypeError("fetch failed");
      return jsonResponse(200, { result: noWork(), replayed: true });
    }) as unknown as typeof fetch;
    const client = clientWith(fetchImpl, delays);

    const result = await client.claim(claimRequest());

    expect(result.result.result).toBe("NO_COMPATIBLE_WORK");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(bodies[0]).toBe(bodies[1]);
    expect(delays).toEqual([10]);
  });

  it("retries transient claim HTTP responses", async () => {
    const delays: number[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(
        jsonResponse(200, { result: noWork(), replayed: true }),
      ) as unknown as typeof fetch;
    const client = clientWith(fetchImpl, delays);

    await expect(client.claim(claimRequest())).resolves.toMatchObject({ replayed: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([10]);
  });

  it("does not retry non-transient claim errors", async () => {
    const delays: number[] = [];
    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, { error: { message: "denied" } }),
    ) as unknown as typeof fetch;
    const client = clientWith(fetchImpl, delays);

    await expect(client.claim(claimRequest())).rejects.toThrow(/denied/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });
  it("never retries the consuming input read", async () => {
    const delays: number[] = [];
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const client = clientWith(fetchImpl, delays);

    await expect(client.read({ id: "grant-test" } as never)).rejects.toThrow(/fetch failed/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it("retries replay-safe staging output upload after transport failure", async () => {
    const delays: number[] = [];
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          stagingDocumentId: "std_test",
          stagingStatus: "READY",
          verificationOutcome: "PASS",
          finalizationDecision: "COMPLETED",
          readyPackageId: "rpk_test",
        }),
      ) as unknown as typeof fetch;
    const client = clientWith(fetchImpl, delays);

    const result = await client.upload(
      stagingContext(),
      new TextEncoder().encode("---\ntitle: test\n---\nbody"),
      { uploadGrantId: "grant-output" } as never,
      "output-test",
    );
    expect(result.finalizationDecision).toBe("COMPLETED");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([10]);
  });
  it("retries replay-safe runtime reports", async () => {
    const delays: number[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 })) as unknown as typeof fetch;
    const client = clientWith(fetchImpl, delays);

    await client.started(stagingContext(), "report-test");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([10]);
  });
});
