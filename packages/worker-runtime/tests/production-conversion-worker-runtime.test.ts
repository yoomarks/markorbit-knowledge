import type { ConversionClaimRequest, ConversionClaimResult } from "@markorbit/contracts";
import { describe, expect, it } from "vitest";
import { HttpProductionConversionClient } from "../src/http-production-conversion-client";
import { PRODUCTION_MARKDOWN_STAGING_CONVERTER } from "../src/production-markdown-staging";
import { ProductionConversionWorkerRuntime } from "../src/production-conversion-worker-runtime";

const WORKSPACE_ID = "wsp_test";
const WORKER_ID = "wrk_test";

function noWork(): ConversionClaimResult {
  return {
    contractVersion: "1.0",
    objectType: "CONVERSION_CLAIM_RESULT",
    id: "ccs_test",
    workspaceId: WORKSPACE_ID,
    workerId: WORKER_ID,
    result: "NO_COMPATIBLE_WORK",
    idempotencyKey: "claim-test",
  } as ConversionClaimResult;
}

function client(
  onClaim: (request: ConversionClaimRequest) => void,
): HttpProductionConversionClient {
  return {
    workerId: WORKER_ID,
    async claim(request: ConversionClaimRequest) {
      onClaim(request);
      return { result: noWork(), replayed: false };
    },
  } as unknown as HttpProductionConversionClient;
}

describe("ProductionConversionWorkerRuntime converter capabilities", () => {
  it("advertises the full production converter set by default", async () => {
    let seen: ConversionClaimRequest | undefined;
    const runtime = new ProductionConversionWorkerRuntime(
      client((request) => {
        seen = request;
      }),
      WORKSPACE_ID,
    );

    await expect(runtime.runOnce()).resolves.toBe(false);
    expect(seen?.supportedConverters).toHaveLength(6);
    expect(seen?.supportedConverters).toContainEqual({
      converterId: PRODUCTION_MARKDOWN_STAGING_CONVERTER.converterId,
      versions: [PRODUCTION_MARKDOWN_STAGING_CONVERTER.version],
    });
  });

  it("can advertise only the explicitly allowed converter", async () => {
    let seen: ConversionClaimRequest | undefined;
    const runtime = new ProductionConversionWorkerRuntime(
      client((request) => {
        seen = request;
      }),
      WORKSPACE_ID,
      { supportedConverters: [PRODUCTION_MARKDOWN_STAGING_CONVERTER] },
    );

    await expect(runtime.runOnce()).resolves.toBe(false);
    expect(seen?.supportedConverters).toEqual([
      {
        converterId: PRODUCTION_MARKDOWN_STAGING_CONVERTER.converterId,
        versions: [PRODUCTION_MARKDOWN_STAGING_CONVERTER.version],
      },
    ]);
  });

  it("rejects empty, unknown, and duplicate converter allowlists", () => {
    const fakeClient = client(() => undefined);
    expect(
      () =>
        new ProductionConversionWorkerRuntime(fakeClient, WORKSPACE_ID, {
          supportedConverters: [],
        }),
    ).toThrow(/SUPPORTED_CONVERTERS_EMPTY/);
    expect(
      () =>
        new ProductionConversionWorkerRuntime(fakeClient, WORKSPACE_ID, {
          supportedConverters: [{ converterId: "unknown", version: "1.0.0" }],
        }),
    ).toThrow(/SUPPORTED_CONVERTER_INVALID/);
    expect(
      () =>
        new ProductionConversionWorkerRuntime(fakeClient, WORKSPACE_ID, {
          supportedConverters: [
            PRODUCTION_MARKDOWN_STAGING_CONVERTER,
            PRODUCTION_MARKDOWN_STAGING_CONVERTER,
          ],
        }),
    ).toThrow(/SUPPORTED_CONVERTER_DUPLICATE/);
  });
});
