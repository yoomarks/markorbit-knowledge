import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TmclassPublicClient,
  retryDelayMs,
  type Options,
} from "./run-tmclass-live-corpus-capture.js";

function options(maxAttempts: number): Options {
  return {
    outputRoot: "unused",
    languages: ["en"],
    niceClasses: [1],
    capture: "index",
    concurrency: 1,
    detailBatchSize: 1,
    searchBatchSize: 1,
    searchPageSize: 100,
    minStartIntervalMs: 100,
    timeoutMs: 5_000,
    maxAttempts,
    httpTransport: "fetch",
    browserExecutable: undefined,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TMclass live corpus request retry", () => {
  it("treats zero max attempts as unlimited for transient failures", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("temporary timeout"))
      .mockResolvedValueOnce(new Response("<html>ok</html>", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const captured = await new TmclassPublicClient(options(0)).capture(
      "https://euipo.europa.eu/ec2/example",
      true,
    );

    expect(captured.html).toBe("<html>ok</html>");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails immediately for non-retryable HTTP responses", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("missing", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new TmclassPublicClient(options(0)).capture("https://euipo.europa.eu/ec2/missing", true),
    ).rejects.toThrow("TMCLASS_HTTP_404");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a successful response that fails content validation", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("<html>temporary block</html>", { status: 200 }))
      .mockResolvedValueOnce(new Response("<html>valid result</html>", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const captured = await new TmclassPublicClient(options(0)).capture(
      "https://euipo.europa.eu/ec2/search/ajaxSearch",
      true,
      (entry) => {
        if (!entry.html.includes("valid result")) throw new Error("invalid search response");
      },
    );

    expect(captured.html).toContain("valid result");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("_=");
    expect(fetchMock.mock.calls[0]![0]).not.toBe(fetchMock.mock.calls[1]![0]);
  });

  it("caps exponential and Retry-After backoff at fifteen minutes", () => {
    expect(retryDelayMs(2)).toBe(4_000);
    expect(retryDelayMs(100)).toBe(15 * 60_000);
    expect(retryDelayMs(1, "120")).toBe(120_000);
    expect(retryDelayMs(1, "3600")).toBe(15 * 60_000);
  });
});
