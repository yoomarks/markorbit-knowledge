import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Response,
} from "playwright-core";
import { CollectionAcquisitionError } from "@markorbit/worker-runtime";
import {
  LAOS_ORIGIN,
  type LaosHttpRequest,
  type LaosHttpResponse,
  type LaosHttpTransport,
} from "@markorbit/worker-runtime";

const fail = (code: string, message: string) =>
  new CollectionAcquisitionError(code, message, false);

const isPlaywrightTimeout = (error: unknown): boolean =>
  error instanceof Error && error.name === "TimeoutError";
const target = (input: string): URL => {
  const url = new URL(input);
  if (
    url.origin !== LAOS_ORIGIN ||
    url.username ||
    url.password ||
    url.hash ||
    !/^\/wopublish-search\/(?:public\/(?:trademarks|detail\/trademarks)|service\/trademarks\/application\/LA(?:M)?\d{3,10}\/logo)(?:;jsessionid=[A-Za-z0-9]+)?$/.test(
      url.pathname,
    )
  ) {
    throw fail("LA_NETWORK_TARGET_REJECTED", "Request is not an official WoPublish route");
  }
  return url;
};

/** Source-specific transport inside the existing Worker, not a second crawler service. */
export class LaosPlaywrightTransport implements LaosHttpTransport {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;

  constructor(
    private readonly executablePath: string | undefined = process.env
      .MARKORBIT_LA_BROWSER_EXECUTABLE_PATH,
  ) {}

  private async ensurePage(): Promise<Page> {
    if (this.page) return this.page;
    if (!this.executablePath) {
      throw fail(
        "LA_BROWSER_NOT_CONFIGURED",
        "The bounded WoPublish Worker requires a browser executable",
      );
    }
    try {
      this.browser = await chromium.launch({
        executablePath: this.executablePath,
        headless: true,
        timeout: 30_000,
      });
      this.context = await this.browser.newContext({ locale: "en-US", ignoreHTTPSErrors: false });
      await this.context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== LAOS_ORIGIN || url.protocol !== "https:") {
          await route.abort();
          return;
        }
        await route.continue();
      });
      this.page = await this.context.newPage();
      return this.page;
    } catch {
      await this.close();
      throw fail(
        "LA_BROWSER_RUNTIME_UNAVAILABLE",
        "Official-source browser runtime could not start",
      );
    }
  }

  async get(input: LaosHttpRequest): Promise<LaosHttpResponse> {
    const url = target(input.url);
    const page = await this.ensurePage();
    let response: Response | null;
    if (input.headers["wicket-ajax"] === "true") {
      if (!page.url().startsWith(LAOS_ORIGIN + "/wopublish-search/public/trademarks")) {
        throw fail(
          "LA_BROWSER_SESSION_MISSING",
          "A Wicket page must be opened before its AJAX callback",
        );
      }
      const expected = url.toString();
      const browserHeaders = Object.fromEntries(
        Object.entries(input.headers).filter(([key]) =>
          ["accept", "wicket-ajax", "wicket-ajax-baseurl", "x-requested-with"].includes(
            key.toLowerCase(),
          ),
        ),
      );
      try {
        const result = await page.evaluate(
          async ({ address, headers }) => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30_000);
            try {
              const response = await fetch(address, {
                method: "GET",
                headers,
                credentials: "same-origin",
                redirect: "manual",
                signal: controller.signal,
              });
              const bytes = new Uint8Array(await response.arrayBuffer());
              let binary = "";
              for (let offset = 0; offset < bytes.length; offset += 0x8000) {
                binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
              }
              return {
                status: response.status,
                url: response.url,
                contentType: response.headers.get("content-type"),
                retryAfter: response.headers.get("retry-after"),
                bodyBase64: btoa(binary),
              };
            } finally {
              clearTimeout(timeout);
            }
          },
          { address: expected, headers: browserHeaders },
        );
        if (new URL(result.url).origin !== LAOS_ORIGIN) {
          throw fail(
            "LA_BROWSER_SOURCE_REDIRECT",
            "Browser did not return the official HTTPS source",
          );
        }
        const body = new Uint8Array(Buffer.from(result.bodyBase64, "base64"));
        if (body.byteLength > input.maxBytes) {
          throw fail(
            "LA_RESPONSE_SIZE_INVALID",
            "WoPublish response exceeded its governed byte limit",
          );
        }
        return {
          status: result.status,
          body,
          contentType: result.contentType ?? "application/octet-stream",
          observedAt: new Date().toISOString(),
          ...(result.retryAfter ? { headers: { "retry-after": result.retryAfter } } : {}),
        };
      } catch (error) {
        if (error instanceof CollectionAcquisitionError) throw error;
        if (isPlaywrightTimeout(error)) {
          throw new CollectionAcquisitionError(
            "LA_BROWSER_RESPONSE_TIMEOUT",
            "Official WoPublish AJAX response outcome is uncertain after timeout",
            false,
          );
        }
        throw new CollectionAcquisitionError(
          "LA_BROWSER_AJAX_UNCERTAIN",
          "Official WoPublish AJAX response outcome is uncertain",
          false,
        );
      }
    } else if (url.pathname.endsWith("/logo")) {
      const expected = url.toString();
      const wait = page.waitForResponse(
        (res) => res.url() === expected && res.request().method() === "GET",
        { timeout: 30_000 },
      );
      await page.evaluate(async (address) => {
        const result = await fetch(address, { credentials: "same-origin", cache: "no-store" });
        await result.arrayBuffer();
      }, expected);
      response = await wait;
    } else {
      response = await page.goto(url.toString(), {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
    }
    if (!response || new URL(response.url()).origin !== LAOS_ORIGIN) {
      throw fail("LA_BROWSER_SOURCE_REDIRECT", "Browser did not return the official HTTPS source");
    }
    const body = new Uint8Array(await response.body());
    if (body.byteLength > input.maxBytes) {
      throw fail("LA_RESPONSE_SIZE_INVALID", "WoPublish response exceeded its governed byte limit");
    }
    const mime = (await response.headerValue("content-type")) ?? "application/octet-stream";
    const retryAfter = await response.headerValue("retry-after");
    return {
      status: response.status(),
      body,
      contentType: mime,
      observedAt: new Date().toISOString(),
      ...(retryAfter ? { headers: { "retry-after": retryAfter } } : {}),
    };
  }

  async close(): Promise<void> {
    try {
      await this.context?.close();
    } finally {
      await this.browser?.close();
    }
    this.page = undefined;
    this.context = undefined;
    this.browser = undefined;
  }
}
