import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  launch: vi.fn(),
  waitForResponse: vi.fn(),
  evaluate: vi.fn(),
}));

vi.mock("playwright-core", () => ({
  chromium: { launch: mocks.launch },
}));

import { LaosPlaywrightTransport } from "./laos-playwright-transport.js";

const request = {
  url: "https://online.dip.gov.la/wopublish-search/public/trademarks;jsessionid=ABC?0-1.IBehaviorListener.0-searchForm-searchButton",
  headers: {
    accept: "text/xml",
    "wicket-ajax": "true",
    "wicket-ajax-baseurl": "public/trademarks",
    "x-requested-with": "XMLHttpRequest",
  },
  maxBytes: 1_024,
};

const timeout = () => Object.assign(new Error("response timeout"), { name: "TimeoutError" });

describe("LaosPlaywrightTransport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const response = {
      request: () => ({ method: () => "GET" }),
      url: () => request.url,
      body: async () => Buffer.from("ok"),
      headerValue: async (name: string) => (name === "content-type" ? "text/xml" : null),
      status: () => 200,
    };
    const page = {
      url: () => "https://online.dip.gov.la/wopublish-search/public/trademarks;jsessionid=ABC",
      waitForResponse: mocks.waitForResponse,
      evaluate: mocks.evaluate,
    };
    const context = {
      route: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    mocks.launch.mockResolvedValue({
      newContext: vi.fn().mockResolvedValue(context),
      close: vi.fn().mockResolvedValue(undefined),
    });
    mocks.evaluate.mockResolvedValue(undefined);
    mocks.waitForResponse.mockResolvedValue(response);
  });

  it("retries a bounded transient Wicket response timeout", async () => {
    mocks.waitForResponse.mockRejectedValueOnce(timeout()).mockRejectedValueOnce(timeout());

    const transport = new LaosPlaywrightTransport("browser.exe");
    await expect(transport.get(request)).resolves.toMatchObject({
      status: 200,
      contentType: "text/xml",
    });
    expect(mocks.waitForResponse).toHaveBeenCalledTimes(3);
    expect(mocks.evaluate).toHaveBeenCalledTimes(3);
  });

  it("fails with a retryable governed error after the bounded attempts", async () => {
    mocks.waitForResponse.mockRejectedValue(timeout());

    const transport = new LaosPlaywrightTransport("browser.exe");
    await expect(transport.get(request)).rejects.toMatchObject({
      code: "LA_BROWSER_RESPONSE_TIMEOUT",
      retryable: true,
    });
    expect(mocks.waitForResponse).toHaveBeenCalledTimes(3);
    expect(mocks.evaluate).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-timeout browser failure", async () => {
    mocks.waitForResponse.mockRejectedValue(new Error("browser closed"));

    const transport = new LaosPlaywrightTransport("browser.exe");
    await expect(transport.get(request)).rejects.toThrow("browser closed");
    expect(mocks.waitForResponse).toHaveBeenCalledTimes(1);
    expect(mocks.evaluate).toHaveBeenCalledTimes(1);
  });
});
