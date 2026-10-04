import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  launch: vi.fn(),
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
    const page = {
      url: () => "https://online.dip.gov.la/wopublish-search/public/trademarks;jsessionid=ABC",
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
    mocks.evaluate.mockResolvedValue({
      status: 200,
      url: request.url,
      contentType: "text/xml",
      retryAfter: null,
      bodyBase64: Buffer.from("ok").toString("base64"),
    });
  });

  it("returns the exact in-page Wicket fetch result without a second stateful request", async () => {
    const transport = new LaosPlaywrightTransport("browser.exe");
    const result = await transport.get(request);
    expect(result).toMatchObject({
      status: 200,
      contentType: "text/xml",
    });
    expect(new TextDecoder().decode(result.body)).toBe("ok");
    expect(mocks.evaluate).toHaveBeenCalledTimes(1);
  });

  it("fails closed without replay when a Wicket response outcome is uncertain", async () => {
    mocks.evaluate.mockRejectedValue(timeout());

    const transport = new LaosPlaywrightTransport("browser.exe");
    await expect(transport.get(request)).rejects.toMatchObject({
      code: "LA_BROWSER_RESPONSE_TIMEOUT",
      retryable: false,
    });
    expect(mocks.evaluate).toHaveBeenCalledTimes(1);
  });

  it("classifies an in-page AbortController timeout without replay", async () => {
    mocks.evaluate.mockRejectedValue(
      new Error("page.evaluate: AbortError: This operation was aborted"),
    );

    const transport = new LaosPlaywrightTransport("browser.exe");
    await expect(transport.get(request)).rejects.toMatchObject({
      code: "LA_BROWSER_RESPONSE_TIMEOUT",
      retryable: false,
    });
    expect(mocks.evaluate).toHaveBeenCalledTimes(1);
  });

  it("does not retry a non-timeout browser failure", async () => {
    mocks.evaluate.mockRejectedValue(new Error("browser closed"));

    const transport = new LaosPlaywrightTransport("browser.exe");
    await expect(transport.get(request)).rejects.toMatchObject({
      code: "LA_BROWSER_AJAX_UNCERTAIN",
      retryable: false,
    });
    expect(mocks.evaluate).toHaveBeenCalledTimes(1);
  });
});
