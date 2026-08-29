import { createHash } from "node:crypto";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import {
  CnipaAcquisitionError,
  type CnipaAuthenticatedRequest,
  type CnipaAuthenticatedSessionResponse,
} from "@markorbit/worker-runtime";
import type {
  CnipaAuthenticatedSessionExecutorFactory,
  CnipaClosableAuthenticatedSessionExecutor,
} from "@markorbit/worker-runtime/cnipa-artifact-acquirer";

export type CnipaBearerStorageBinding = {
  area: "localStorage" | "sessionStorage";
  key: string;
  valuePath?: readonly string[];
  prefix?: string;
};

export type CnipaPlaywrightSessionOptions = {
  baseUrl: string;
  sessionEntryUrl: string;
  userDataDir: string;
  executablePath: string;
  headless?: boolean;
  minRequestIntervalMs?: number;
  maxRequestsPerRun?: number;
  maxResponseBytes?: number;
  navigationTimeoutMs?: number;
  bearerStorage?: CnipaBearerStorageBinding;
  treatForbiddenAsReauth?: boolean;
  workingDirectory?: string;
};

type BrowserFetchInput = {
  url: string;
  method: "GET" | "POST";
  jsonBody?: Readonly<Record<string, string | number>>;
  maxResponseBytes: number;
  bearerStorage?: CnipaBearerStorageBinding;
};

type BrowserFetchResult =
  | { kind: "REAUTH_REQUIRED" }
  | { kind: "NETWORK_ERROR" }
  | { kind: "TOO_LARGE"; status: number; sourceUri: string; contentType: string }
  | {
      kind: "RESPONSE";
      status: number;
      sourceUri: string;
      contentType: string;
      bodyBase64: string;
    };

export interface CnipaBrowserPage {
  goto(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<unknown>;
  fetch(input: BrowserFetchInput): Promise<BrowserFetchResult>;
}

export interface CnipaBrowserContext {
  pages(): CnipaBrowserPage[];
  newPage(): Promise<CnipaBrowserPage>;
  close(): Promise<void>;
}

export type CnipaPersistentContextLauncher = (
  userDataDir: string,
  options: { headless: boolean; executablePath: string },
) => Promise<CnipaBrowserContext>;

function browserFetch(page: Page, input: BrowserFetchInput): Promise<BrowserFetchResult> {
  return page.evaluate(async (request): Promise<BrowserFetchResult> => {
    let authorization: string | undefined;
    if (request.bearerStorage) {
      const storage =
        request.bearerStorage.area === "localStorage" ? window.localStorage : window.sessionStorage;
      const raw = storage.getItem(request.bearerStorage.key);
      if (!raw) return { kind: "REAUTH_REQUIRED" };
      let token: unknown = raw;
      if (request.bearerStorage.valuePath?.length) {
        try {
          token = JSON.parse(raw);
        } catch {
          return { kind: "REAUTH_REQUIRED" };
        }
        for (const key of request.bearerStorage.valuePath) {
          if (typeof token !== "object" || token === null || Array.isArray(token)) {
            return { kind: "REAUTH_REQUIRED" };
          }
          token = (token as Record<string, unknown>)[key];
        }
      }
      if (typeof token !== "string" || !token.trim()) return { kind: "REAUTH_REQUIRED" };
      authorization = `${request.bearerStorage.prefix ?? "Bearer "}${token.trim()}`;
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (authorization) headers.Authorization = authorization;
    if (request.jsonBody) headers["Content-Type"] = "application/json";

    let response: Response;
    try {
      response = await fetch(request.url, {
        method: request.method,
        credentials: "include",
        redirect: "follow",
        cache: "no-store",
        headers,
        ...(request.jsonBody ? { body: JSON.stringify(request.jsonBody) } : {}),
      });
    } catch {
      return { kind: "NETWORK_ERROR" };
    }

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > request.maxResponseBytes) {
      return {
        kind: "TOO_LARGE",
        status: response.status,
        sourceUri: response.url,
        contentType,
      };
    }
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(
        ...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)),
      );
    }
    return {
      kind: "RESPONSE",
      status: response.status,
      sourceUri: response.url,
      contentType,
      bodyBase64: btoa(binary),
    };
  }, input);
}

function wrapPage(page: Page): CnipaBrowserPage {
  return {
    goto(url, options) {
      return page.goto(url, options);
    },
    fetch(input) {
      return browserFetch(page, input);
    },
  };
}

function wrapContext(context: BrowserContext): CnipaBrowserContext {
  return {
    pages() {
      return context.pages().map(wrapPage);
    },
    async newPage() {
      return wrapPage(await context.newPage());
    },
    close() {
      return context.close();
    },
  };
}

export const defaultCnipaPersistentContextLauncher: CnipaPersistentContextLauncher = async (
  userDataDir,
  options,
) =>
  wrapContext(
    await chromium.launchPersistentContext(userDataDir, {
      headless: options.headless,
      executablePath: options.executablePath,
    }),
  );

function integer(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return resolved;
}

function validateOptions(
  options: CnipaPlaywrightSessionOptions,
): Required<
  Pick<
    CnipaPlaywrightSessionOptions,
    | "baseUrl"
    | "sessionEntryUrl"
    | "userDataDir"
    | "executablePath"
    | "headless"
    | "minRequestIntervalMs"
    | "maxRequestsPerRun"
    | "maxResponseBytes"
    | "navigationTimeoutMs"
    | "treatForbiddenAsReauth"
    | "workingDirectory"
  >
> & { bearerStorage?: CnipaBearerStorageBinding } {
  const base = new URL(options.baseUrl);
  if (base.protocol !== "https:" || base.pathname !== "/" || base.search || base.hash) {
    throw new Error("CNIPA baseUrl must be an HTTPS origin without path, query, or fragment");
  }
  const entry = new URL(options.sessionEntryUrl);
  if (
    entry.protocol !== "https:" ||
    entry.origin !== base.origin ||
    entry.username ||
    entry.password
  ) {
    throw new Error("CNIPA sessionEntryUrl must be an HTTPS URL on the configured base origin");
  }
  if (!path.isAbsolute(options.userDataDir)) {
    throw new Error("CNIPA userDataDir must be an absolute runtime-secret path");
  }
  if (!path.isAbsolute(options.executablePath)) {
    throw new Error("CNIPA executablePath must be absolute");
  }
  const workingDirectory = path.resolve(options.workingDirectory ?? process.cwd());
  const userDataDir = path.resolve(options.userDataDir);
  const relative = path.relative(workingDirectory, userDataDir);
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error("CNIPA userDataDir must be stored outside the Worker working directory");
  }
  return {
    baseUrl: base.origin,
    sessionEntryUrl: entry.toString(),
    userDataDir,
    executablePath: path.resolve(options.executablePath),
    headless: options.headless ?? true,
    minRequestIntervalMs: integer(
      options.minRequestIntervalMs,
      2_000,
      0,
      60_000,
      "minRequestIntervalMs",
    ),
    maxRequestsPerRun: integer(options.maxRequestsPerRun, 50, 1, 200, "maxRequestsPerRun"),
    maxResponseBytes: integer(
      options.maxResponseBytes,
      5 * 1024 * 1024,
      1,
      20 * 1024 * 1024,
      "maxResponseBytes",
    ),
    navigationTimeoutMs: integer(
      options.navigationTimeoutMs,
      60_000,
      1_000,
      180_000,
      "navigationTimeoutMs",
    ),
    treatForbiddenAsReauth: options.treatForbiddenAsReauth ?? false,
    workingDirectory,
    ...(options.bearerStorage ? { bearerStorage: options.bearerStorage } : {}),
  };
}

function requestUrl(baseUrl: string, request: CnipaAuthenticatedRequest): string {
  if (
    !request.path.startsWith("/") ||
    request.path.startsWith("//") ||
    request.path.includes("\\")
  ) {
    throw new CnipaAcquisitionError("CNIPA_QUERY_INVALID", "CNIPA request path is invalid", false);
  }
  const url = new URL(request.path, baseUrl);
  if (url.origin !== new URL(baseUrl).origin) {
    throw new CnipaAcquisitionError(
      "CNIPA_QUERY_INVALID",
      "CNIPA request escaped the configured origin",
      false,
    );
  }
  for (const [key, value] of Object.entries(request.query ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

function requestIdentity(request: CnipaAuthenticatedRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        method: request.method,
        path: request.path,
        query: request.query ?? {},
        jsonBody: request.jsonBody ?? {},
      }),
    )
    .digest("hex");
}

function cloneResponse(
  response: CnipaAuthenticatedSessionResponse,
): CnipaAuthenticatedSessionResponse {
  return { ...response, body: new Uint8Array(response.body) };
}

class PlaywrightCnipaSessionExecutor implements CnipaClosableAuthenticatedSessionExecutor {
  private requestCount = 0;
  private lastRequestAt = 0;
  private readonly cache = new Map<string, CnipaAuthenticatedSessionResponse>();

  constructor(
    private readonly context: CnipaBrowserContext,
    private readonly page: CnipaBrowserPage,
    private readonly options: ReturnType<typeof validateOptions>,
  ) {}

  async execute(request: CnipaAuthenticatedRequest): Promise<CnipaAuthenticatedSessionResponse> {
    const cacheKey = requestIdentity(request);
    const cached = this.cache.get(cacheKey);
    if (cached) return cloneResponse(cached);
    if (this.requestCount >= this.options.maxRequestsPerRun) {
      throw new CnipaAcquisitionError(
        "CNIPA_COVERAGE_UNKNOWN",
        `CNIPA local request ceiling ${this.options.maxRequestsPerRun} reached; collection stopped without claiming completeness`,
        false,
      );
    }

    const elapsed = Date.now() - this.lastRequestAt;
    if (this.lastRequestAt > 0 && elapsed < this.options.minRequestIntervalMs) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.options.minRequestIntervalMs - elapsed),
      );
    }
    this.requestCount += 1;
    this.lastRequestAt = Date.now();

    const url = requestUrl(this.options.baseUrl, request);
    const result = await this.page.fetch({
      url,
      method: request.method,
      ...(request.jsonBody ? { jsonBody: request.jsonBody } : {}),
      maxResponseBytes: this.options.maxResponseBytes,
      ...(this.options.bearerStorage ? { bearerStorage: this.options.bearerStorage } : {}),
    });

    if (result.kind === "REAUTH_REQUIRED") {
      return {
        status: 401,
        sourceUri: url,
        contentType: "application/json",
        observedAt: new Date().toISOString(),
        body: new Uint8Array(),
        securityState: "REAUTH_REQUIRED",
      };
    }
    if (result.kind === "NETWORK_ERROR") {
      throw new CnipaAcquisitionError(
        "CNIPA_DELIVERY_UNKNOWN",
        "CNIPA browser fetch outcome is unknown; automatic replay is disabled",
        false,
      );
    }
    if (result.kind === "TOO_LARGE") {
      throw new CnipaAcquisitionError(
        "CNIPA_SOURCE_REJECTED",
        `CNIPA response exceeded the configured ${this.options.maxResponseBytes}-byte evidence bound`,
        false,
        result.status,
      );
    }

    const securityState =
      result.status === 401 || (result.status === 403 && this.options.treatForbiddenAsReauth)
        ? "REAUTH_REQUIRED"
        : result.status === 403
          ? "ACCESS_DENIED"
          : result.status === 429
            ? "RATE_LIMITED"
            : "OK";
    const response: CnipaAuthenticatedSessionResponse = {
      status: result.status,
      sourceUri: result.sourceUri,
      contentType: result.contentType,
      observedAt: new Date().toISOString(),
      body: Buffer.from(result.bodyBase64, "base64"),
      securityState,
    };
    if (result.status >= 200 && result.status < 300)
      this.cache.set(cacheKey, cloneResponse(response));
    return response;
  }

  async close(): Promise<void> {
    this.cache.clear();
    await this.context.close();
  }
}

export class CnipaPlaywrightSessionExecutorFactory implements CnipaAuthenticatedSessionExecutorFactory {
  private readonly options: ReturnType<typeof validateOptions>;

  constructor(
    options: CnipaPlaywrightSessionOptions,
    private readonly launcher: CnipaPersistentContextLauncher = defaultCnipaPersistentContextLauncher,
  ) {
    this.options = validateOptions(options);
  }

  async create(): Promise<CnipaClosableAuthenticatedSessionExecutor> {
    let context: CnipaBrowserContext | undefined;
    try {
      context = await this.launcher(this.options.userDataDir, {
        headless: this.options.headless,
        executablePath: this.options.executablePath,
      });
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(this.options.sessionEntryUrl, {
        waitUntil: "domcontentloaded",
        timeout: this.options.navigationTimeoutMs,
      });
      return new PlaywrightCnipaSessionExecutor(context, page, this.options);
    } catch (error) {
      if (context) {
        try {
          await context.close();
        } catch {
          // Preserve the launch/navigation error.
        }
      }
      throw new CnipaAcquisitionError(
        "CNIPA_REAUTH_REQUIRED",
        "CNIPA persistent browser session could not be opened; operator login/runtime repair is required",
        false,
        undefined,
        error instanceof Error ? { cause: error } : undefined,
      );
    }
  }
}
