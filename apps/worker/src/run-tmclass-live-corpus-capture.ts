import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import {
  TMCLASS_DATA_LANGUAGES,
  assertTmclassRobotsAllowsPublicEc2,
  parseTmclassDetailLinks,
  parseTmclassOfficeCodes,
  parseTmclassSearchResult,
  tmclassHar,
  tmclassOfficeConfigurationUrl,
  tmclassRouteUrl,
  tmclassSearchUrl,
  type TmclassHarEntry,
  type TmclassSearchResult,
} from "./tmclass-live-corpus.js";

const SCHEMA_VERSION = "TMCLASS_LIVE_CORPUS_CAPTURE_V1";
const ROBOTS_URL = "https://euipo.europa.eu/robots.txt";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 MarkOrbitKnowledge/1.0";
const execFileAsync = promisify(execFile);

export type Options = {
  outputRoot: string;
  languages: string[];
  niceClasses: number[];
  capture: "index" | "details" | "all";
  concurrency: number;
  detailBatchSize: number;
  searchBatchSize: number;
  searchPageSize: number;
  minStartIntervalMs: number;
  timeoutMs: number;
  maxAttempts: number;
  httpTransport: "auto" | "browser" | "curl" | "fetch";
  browserExecutable?: string;
};

type SearchBatchSummary = {
  schemaVersion: typeof SCHEMA_VERSION;
  kind: "SEARCH";
  language: string;
  niceClass: number;
  searchPageSize: number;
  pages: number[];
  totalResults: number;
  totalPages: number;
  termIds: string[];
  termRowCount?: number;
  unresolvedTermRowCount?: number;
  harSha256: string;
};

type DetailBatchSummary = {
  schemaVersion: typeof SCHEMA_VERSION;
  kind: "TERM" | "CONCEPT" | "CONCEPT_LANGUAGE";
  routes: string[];
  termIds: string[];
  conceptIds: string[];
  conceptLanguageRoutes: string[];
  harSha256: string;
};

type CoverageSummary = {
  schemaVersion: typeof SCHEMA_VERSION;
  language: string;
  officeCodes: string[];
  sourceUri: string;
  observedAt: string;
  harSha256: string;
};

type ClassManifest = {
  schemaVersion: typeof SCHEMA_VERSION;
  language: string;
  niceClass: number;
  totalResults: number;
  totalPages: number;
  searchPageSize: number;
  officeCodes: string[];
  observedAt: string;
};

function assertSearchPageCardinality(input: {
  language: string;
  niceClass: number;
  page: number;
  pageSize: number;
  result: TmclassSearchResult;
}): void {
  const remaining = Math.max(0, input.result.totalResults - (input.page - 1) * input.pageSize);
  const expected = Math.min(input.pageSize, remaining);
  if (
    input.result.termRowCount !== expected ||
    input.result.termIds.length + input.result.unresolvedTermRowCount !== expected
  ) {
    throw new Error(
      `TMCLASS_SEARCH_PAGE_CARDINALITY ${input.language} class ${input.niceClass} page ${input.page} expected ${expected} rows ${input.result.termRowCount} resolved ${input.result.termIds.length} unresolved ${input.result.unresolvedTermRowCount}`,
    );
  }
}

function integer(
  value: string | undefined,
  fallback: number,
  label: string,
  min: number,
  max: number,
) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer in ${min}..${max}`);
  }
  return parsed;
}

function options(argv: string[]): Options {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag ?? "argument"}`);
    }
    if (values.has(flag)) throw new Error(`Duplicate argument ${flag}`);
    values.set(flag, value);
    index += 1;
  }
  const allowed = new Set([
    "--output-root",
    "--languages",
    "--nice-classes",
    "--capture",
    "--concurrency",
    "--detail-batch-size",
    "--search-batch-size",
    "--search-page-size",
    "--min-start-interval-ms",
    "--timeout-ms",
    "--max-attempts",
    "--http-transport",
    "--browser-executable",
  ]);
  const unknown = [...values.keys()].filter((flag) => !allowed.has(flag));
  if (unknown.length > 0) throw new Error(`Unsupported argument ${unknown[0]}`);
  const outputRoot = values.get("--output-root")?.trim();
  if (!outputRoot) throw new Error("--output-root is required");
  const supported = new Set<string>(TMCLASS_DATA_LANGUAGES);
  const requested = values.get("--languages")?.trim() || "all";
  const languages =
    requested === "all"
      ? [...TMCLASS_DATA_LANGUAGES]
      : [...new Set(requested.split(",").map((value) => value.trim().toLowerCase()))];
  if (languages.length === 0 || languages.some((language) => !supported.has(language))) {
    throw new Error("--languages must be 'all' or a comma-separated subset of TMclass languages");
  }
  const requestedClasses = values.get("--nice-classes")?.trim() || "all";
  const niceClasses =
    requestedClasses === "all"
      ? Array.from({ length: 45 }, (_, index) => index + 1)
      : [...new Set(requestedClasses.split(",").map((value) => Number(value.trim())))].sort(
          (left, right) => left - right,
        );
  if (
    niceClasses.length === 0 ||
    niceClasses.some(
      (niceClass) => !Number.isSafeInteger(niceClass) || niceClass < 1 || niceClass > 45,
    )
  ) {
    throw new Error("--nice-classes must be 'all' or a comma-separated subset of 1..45");
  }
  const capture = values.get("--capture")?.trim() || "all";
  if (capture !== "index" && capture !== "details" && capture !== "all") {
    throw new Error("--capture must be 'index', 'details' or 'all'");
  }
  const httpTransport = values.get("--http-transport")?.trim() || "auto";
  if (
    httpTransport !== "auto" &&
    httpTransport !== "browser" &&
    httpTransport !== "curl" &&
    httpTransport !== "fetch"
  ) {
    throw new Error("--http-transport must be 'auto', 'browser', 'curl' or 'fetch'");
  }
  const browserExecutable = values.get("--browser-executable")?.trim();
  if (httpTransport === "browser" && !browserExecutable) {
    throw new Error("--browser-executable is required with browser transport");
  }
  return {
    outputRoot: path.resolve(outputRoot),
    languages,
    niceClasses,
    capture,
    concurrency: integer(values.get("--concurrency"), 4, "--concurrency", 1, 12),
    detailBatchSize: integer(
      values.get("--detail-batch-size"),
      250,
      "--detail-batch-size",
      1,
      1_000,
    ),
    searchBatchSize: integer(values.get("--search-batch-size"), 20, "--search-batch-size", 1, 100),
    searchPageSize: integer(values.get("--search-page-size"), 100, "--search-page-size", 1, 1_000),
    minStartIntervalMs: integer(
      values.get("--min-start-interval-ms"),
      250,
      "--min-start-interval-ms",
      100,
      60_000,
    ),
    timeoutMs: integer(values.get("--timeout-ms"), 45_000, "--timeout-ms", 5_000, 180_000),
    maxAttempts: integer(values.get("--max-attempts"), 4, "--max-attempts", 0, 1_000),
    httpTransport,
    browserExecutable: browserExecutable ? path.resolve(browserExecutable) : undefined,
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

class RequestGate {
  private tail: Promise<void> = Promise.resolve();
  private nextStart = 0;

  constructor(private readonly minimumIntervalMs: number) {}

  async wait(): Promise<void> {
    const turn = this.tail.then(async () => {
      const remaining = this.nextStart - Date.now();
      if (remaining > 0) await delay(remaining);
      this.nextStart = Date.now() + this.minimumIntervalMs;
    });
    this.tail = turn.catch(() => undefined);
    await turn;
  }
}

class NonRetryableTmclassError extends Error {}

const MAX_RETRY_DELAY_MS = 15 * 60_000;

export function retryDelayMs(attempt: number, retryAfter: string | null = null): number {
  const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, MAX_RETRY_DELAY_MS);
  }
  return Math.min(attempt * attempt * 1_000, MAX_RETRY_DELAY_MS);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function cacheBustedUri(sourceUri: string): string {
  const url = new URL(sourceUri);
  url.searchParams.set("_", String(Date.now()));
  return url.toString();
}

type HttpResult = {
  status: number;
  html: string;
  retryAfter: string | null;
};

async function curlRequest(input: {
  requestUri: string;
  headers: Record<string, string>;
  timeoutMs: number;
}): Promise<HttpResult> {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "markorbit-tmclass-"));
  const bodyPath = path.join(temporaryRoot, "body.html");
  const headersPath = path.join(temporaryRoot, "headers.txt");
  try {
    const executable = process.platform === "win32" ? "curl.exe" : "curl";
    const headerArguments = Object.entries(input.headers).flatMap(([name, value]) => [
      "--header",
      `${name}: ${value}`,
    ]);
    const { stdout } = await execFileAsync(
      executable,
      [
        "--silent",
        "--show-error",
        "--location",
        "--compressed",
        "--max-time",
        String(Math.ceil(input.timeoutMs / 1_000)),
        "--output",
        bodyPath,
        "--dump-header",
        headersPath,
        "--write-out",
        "%{http_code}",
        ...headerArguments,
        input.requestUri,
      ],
      {
        encoding: "utf8",
        timeout: input.timeoutMs + 10_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
    );
    const html = await readFile(bodyPath, "utf8");
    const responseHeaders = await readFile(headersPath, "utf8");
    const retryAfter =
      [...responseHeaders.matchAll(/^retry-after:\s*(.+?)\s*$/gimu)].at(-1)?.[1] ?? null;
    return { status: Number(stdout.trim()), html, retryAfter };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export class TmclassPublicClient {
  private readonly gate: RequestGate;
  private browser?: Browser;
  private browserContext?: BrowserContext;
  private browserContextPromise?: Promise<BrowserContext>;

  constructor(private readonly configured: Options) {
    this.gate = new RequestGate(configured.minStartIntervalMs);
  }

  private async context(): Promise<BrowserContext> {
    if (this.browser?.isConnected() && this.browserContext) return this.browserContext;
    if (this.browser && !this.browser.isConnected()) {
      this.browser = undefined;
      this.browserContext = undefined;
      this.browserContextPromise = undefined;
    }
    this.browserContextPromise ??= (async () => {
      const browser = await chromium.launch({
        executablePath: this.configured.browserExecutable,
        headless: true,
      });
      const context = await browser.newContext({ locale: "en-US" });
      this.browser = browser;
      this.browserContext = context;
      return context;
    })();
    try {
      return await this.browserContextPromise;
    } catch (error) {
      this.browserContextPromise = undefined;
      throw error;
    }
  }

  private async browserRequest(
    requestUri: string,
    headers: Record<string, string>,
  ): Promise<HttpResult> {
    const context = await this.context();
    const page = await context.newPage();
    try {
      const extraHeaders = Object.fromEntries(
        Object.entries(headers).filter(([name]) => name !== "user-agent" && name !== "referer"),
      );
      await page.setExtraHTTPHeaders(extraHeaders);
      const response = await page.goto(requestUri, {
        referer: headers.referer,
        timeout: this.configured.timeoutMs,
        waitUntil: "domcontentloaded",
      });
      if (!response) throw new Error(`TMCLASS_BROWSER_RESPONSE_MISSING ${requestUri}`);
      const responseHeaders = await response.allHeaders();
      return {
        status: response.status(),
        html: (await response.body()).toString("utf8"),
        retryAfter: responseHeaders["retry-after"] ?? null,
      };
    } finally {
      await page.close();
    }
  }

  private async request(requestUri: string, headers: Record<string, string>): Promise<HttpResult> {
    const transport =
      this.configured.httpTransport === "auto"
        ? process.platform === "win32"
          ? "curl"
          : "fetch"
        : this.configured.httpTransport;
    if (transport === "curl") {
      return curlRequest({ requestUri, headers, timeoutMs: this.configured.timeoutMs });
    }
    if (transport === "browser") return this.browserRequest(requestUri, headers);
    const response = await fetch(requestUri, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(this.configured.timeoutMs),
    });
    return {
      status: response.status,
      html: await response.text(),
      retryAfter: response.headers.get("retry-after"),
    };
  }

  async capture(
    sourceUri: string,
    ajax: boolean,
    validate?: (entry: TmclassHarEntry) => void,
  ): Promise<TmclassHarEntry> {
    let lastError: unknown;
    for (
      let attempt = 1;
      this.configured.maxAttempts === 0 || attempt <= this.configured.maxAttempts;
      attempt += 1
    ) {
      await this.gate.wait();
      const observedAt = new Date().toISOString();
      const requestUri = ajax ? cacheBustedUri(sourceUri) : sourceUri;
      try {
        const headers: Record<string, string> = {
          accept: ajax ? "text/html, */*; q=0.01" : "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.9",
          referer: "https://euipo.europa.eu/ec2/",
          "user-agent": USER_AGENT,
        };
        if (ajax) headers["x-requested-with"] = "XMLHttpRequest";
        const response = await this.request(requestUri, headers);
        const html = response.html;
        if (response.status === 200 && html.trim()) {
          if (Buffer.byteLength(html, "utf8") > 10 * 1024 * 1024) {
            throw new NonRetryableTmclassError(`TMCLASS_RESPONSE_TOO_LARGE ${requestUri}`);
          }
          const entry = { sourceUri: requestUri, observedAt, html };
          validate?.(entry);
          return entry;
        }
        const retryable =
          response.status === 200 || response.status === 429 || response.status >= 500;
        const error = new Error(
          `TMCLASS_HTTP_${response.status} ${requestUri}${html ? ` ${html.slice(0, 200)}` : ""}`,
        );
        if (!retryable) throw new NonRetryableTmclassError(error.message);
        lastError = error;
        if (this.configured.maxAttempts !== 0 && attempt >= this.configured.maxAttempts) break;
        const waitMs = retryDelayMs(attempt, response.retryAfter);
        process.stderr.write(
          `${JSON.stringify({ phase: "RETRY", sourceUri: requestUri, attempt, waitMs, error: errorMessage(error) })}\n`,
        );
        await delay(waitMs);
      } catch (error) {
        if (error instanceof NonRetryableTmclassError) throw error;
        lastError = new Error(`TMCLASS_FETCH_ATTEMPT_FAILED ${sourceUri} ${errorMessage(error)}`, {
          cause: error,
        });
        if (this.configured.maxAttempts !== 0 && attempt >= this.configured.maxAttempts) break;
        const waitMs = retryDelayMs(attempt);
        process.stderr.write(
          `${JSON.stringify({ phase: "RETRY", sourceUri: requestUri, attempt, waitMs, error: errorMessage(error) })}\n`,
        );
        await delay(waitMs);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`TMCLASS_FETCH_FAILED ${sourceUri}`);
  }

  async close(): Promise<void> {
    await this.browserContext?.close();
    await this.browser?.close();
    this.browserContext = undefined;
    this.browser = undefined;
    this.browserContextPromise = undefined;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(filePath: string, content: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content);
  await rename(temporary, filePath);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function writeHarWithSummary(
  harPath: string,
  entries: readonly TmclassHarEntry[],
  summary: Omit<SearchBatchSummary, "harSha256"> | Omit<DetailBatchSummary, "harSha256">,
): Promise<void> {
  let serialized = `${JSON.stringify(tmclassHar(entries), null, 2)}\n`;
  const summaryPath = harPath.replace(/\.har$/u, ".summary.json");
  if (!(await exists(harPath))) await atomicWrite(harPath, serialized);
  else serialized = await readFile(harPath, "utf8");
  if (!(await exists(summaryPath))) {
    await writeJson(summaryPath, { ...summary, harSha256: sha256(serialized) });
  }
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await operation(values[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function pad(value: number, width = 3): string {
  return String(value).padStart(width, "0");
}

async function ensureRobots(outputRoot: string, client: TmclassPublicClient): Promise<void> {
  const robotsPath = path.join(outputRoot, "coverage", "robots.txt");
  const robots = (await exists(robotsPath))
    ? await readFile(robotsPath, "utf8")
    : (await client.capture(ROBOTS_URL, false)).html;
  assertTmclassRobotsAllowsPublicEc2(robots);
  if (!(await exists(robotsPath))) await atomicWrite(robotsPath, robots);
}

async function ensureCoverage(
  outputRoot: string,
  language: string,
  client: TmclassPublicClient,
): Promise<CoverageSummary> {
  const directory = path.join(outputRoot, "coverage");
  const harPath = path.join(directory, `${language}.har`);
  const summaryPath = path.join(directory, `${language}.summary.json`);
  if (await exists(summaryPath)) {
    const stored = await readJson<CoverageSummary>(summaryPath);
    if (Array.isArray(stored.officeCodes) && stored.officeCodes.length > 0) return stored;
    await rm(summaryPath, { force: true });
    await rm(harPath, { force: true });
  }
  let entry: TmclassHarEntry | undefined;
  if (await exists(harPath)) {
    const har = await readJson<{
      log: {
        entries: Array<{
          startedDateTime: string;
          request: { url: string };
          response: { content: { text: string } };
        }>;
      };
    }>(harPath);
    const stored = har.log.entries[0];
    if (!stored) throw new Error(`TMCLASS_COVERAGE_HAR_EMPTY ${language}`);
    entry = {
      sourceUri: stored.request.url,
      observedAt: stored.startedDateTime,
      html: stored.response.content.text,
    };
    if (parseTmclassOfficeCodes(entry.html).length === 0) {
      await rm(harPath, { force: true });
      entry = undefined;
    }
  }
  entry ??= await client.capture(tmclassOfficeConfigurationUrl(language), true, (candidate) => {
    if (parseTmclassOfficeCodes(candidate.html).length === 0) {
      throw new Error(`TMCLASS_OFFICE_CONFIGURATION_EMPTY ${language}`);
    }
  });
  const officeCodes = parseTmclassOfficeCodes(entry.html);
  if (officeCodes.length === 0) throw new Error(`TMCLASS_OFFICE_VALIDATION_MISSING ${language}`);
  const serialized = `${JSON.stringify(tmclassHar([entry]), null, 2)}\n`;
  if (!(await exists(harPath))) await atomicWrite(harPath, serialized);
  const summary: CoverageSummary = {
    schemaVersion: SCHEMA_VERSION,
    language,
    officeCodes,
    sourceUri: entry.sourceUri,
    observedAt: entry.observedAt,
    harSha256: sha256(serialized),
  };
  await writeJson(summaryPath, summary);
  return summary;
}

async function ensureClassFirstPage(input: {
  outputRoot: string;
  language: string;
  niceClass: number;
  searchPageSize: number;
  officeCodes: string[];
  client: TmclassPublicClient;
}): Promise<ClassManifest> {
  const directory = path.join(
    input.outputRoot,
    "index",
    input.language,
    `class-${pad(input.niceClass, 2)}`,
  );
  const manifestPath = path.join(directory, "manifest.json");
  if (await exists(manifestPath)) {
    const manifest = await readJson<ClassManifest>(manifestPath);
    if ((manifest.searchPageSize ?? 100) !== input.searchPageSize) {
      throw new Error(
        `TMCLASS_SEARCH_PAGE_SIZE_SCOPE_MISMATCH ${input.language} class ${input.niceClass}`,
      );
    }
    return manifest;
  }
  let metadata: TmclassSearchResult | undefined;
  const metadataEntry = await input.client.capture(
    tmclassSearchUrl({
      language: input.language,
      officeCodes: input.officeCodes,
      page: 1,
      niceClass: String(input.niceClass),
      pageSize: 100,
    }),
    true,
    (candidate) => {
      metadata = parseTmclassSearchResult(candidate.html, 100);
    },
  );
  if (!metadata) throw new Error("TMCLASS_SEARCH_METADATA_VALIDATION_MISSING");
  let parsed: TmclassSearchResult | undefined;
  const entry =
    input.searchPageSize === 100
      ? metadataEntry
      : await input.client.capture(
          tmclassSearchUrl({
            language: input.language,
            officeCodes: input.officeCodes,
            page: 1,
            niceClass: String(input.niceClass),
            pageSize: input.searchPageSize,
          }),
          true,
          (candidate) => {
            const result = parseTmclassSearchResult(
              candidate.html,
              input.searchPageSize,
              metadata!.totalResults,
            );
            if (result.elasticMaxResults) {
              throw new NonRetryableTmclassError(
                `TMCLASS_SEARCH_RESULT_CAP ${input.language} class ${input.niceClass}`,
              );
            }
            assertSearchPageCardinality({
              language: input.language,
              niceClass: input.niceClass,
              page: 1,
              pageSize: input.searchPageSize,
              result,
            });
            parsed = result;
          },
        );
  if (input.searchPageSize === 100) parsed = metadata;
  if (!parsed) throw new Error("TMCLASS_SEARCH_PAGE_VALIDATION_MISSING");
  if (parsed.elasticMaxResults) {
    throw new Error(`TMCLASS_SEARCH_RESULT_CAP ${input.language} class ${input.niceClass}`);
  }
  assertSearchPageCardinality({
    language: input.language,
    niceClass: input.niceClass,
    page: 1,
    pageSize: input.searchPageSize,
    result: parsed,
  });
  const harPath = path.join(directory, "pages-000001-000001.har");
  await writeHarWithSummary(
    harPath,
    input.searchPageSize === 100 ? [entry] : [metadataEntry, entry],
    {
      schemaVersion: SCHEMA_VERSION,
      kind: "SEARCH",
      language: input.language,
      niceClass: input.niceClass,
      searchPageSize: input.searchPageSize,
      pages: [1],
      totalResults: parsed.totalResults,
      totalPages: parsed.totalPages,
      termIds: parsed.termIds,
      termRowCount: parsed.termRowCount,
      unresolvedTermRowCount: parsed.unresolvedTermRowCount,
    },
  );
  const manifest: ClassManifest = {
    schemaVersion: SCHEMA_VERSION,
    language: input.language,
    niceClass: input.niceClass,
    totalResults: parsed.totalResults,
    totalPages: parsed.totalPages,
    searchPageSize: input.searchPageSize,
    officeCodes: input.officeCodes,
    observedAt: entry.observedAt,
  };
  await writeJson(manifestPath, manifest);
  return manifest;
}

async function collectLanguageIndex(
  configured: Options,
  language: string,
  client: TmclassPublicClient,
): Promise<void> {
  const coverage = await ensureCoverage(configured.outputRoot, language, client);
  const classes = configured.niceClasses;
  const manifests = await mapConcurrent(classes, configured.concurrency, (niceClass) =>
    ensureClassFirstPage({
      outputRoot: configured.outputRoot,
      language,
      niceClass,
      searchPageSize: configured.searchPageSize,
      officeCodes: coverage.officeCodes,
      client,
    }),
  );
  for (const manifest of manifests) {
    const directory = path.join(
      configured.outputRoot,
      "index",
      language,
      `class-${pad(manifest.niceClass, 2)}`,
    );
    const remaining = Array.from(
      { length: Math.max(0, manifest.totalPages - 1) },
      (_, index) => index + 2,
    );
    for (const pages of chunks(remaining, configured.searchBatchSize)) {
      const harPath = path.join(
        directory,
        `pages-${pad(pages[0]!, 6)}-${pad(pages.at(-1)!, 6)}.har`,
      );
      const summaryPath = harPath.replace(/\.har$/u, ".summary.json");
      if (await exists(summaryPath)) continue;
      const captured = await mapConcurrent(pages, configured.concurrency, async (page) => {
        let result: TmclassSearchResult | undefined;
        const entry = await client.capture(
          tmclassSearchUrl({
            language,
            officeCodes: coverage.officeCodes,
            page,
            niceClass: String(manifest.niceClass),
            pageSize: configured.searchPageSize,
          }),
          true,
          (candidate) => {
            const parsed = parseTmclassSearchResult(
              candidate.html,
              configured.searchPageSize,
              manifest.totalResults,
            );
            if (parsed.elasticMaxResults) {
              throw new NonRetryableTmclassError(
                `TMCLASS_SEARCH_RESULT_CAP ${language} class ${manifest.niceClass}`,
              );
            }
            assertSearchPageCardinality({
              language,
              niceClass: manifest.niceClass,
              page,
              pageSize: configured.searchPageSize,
              result: parsed,
            });
            result = parsed;
          },
        );
        if (!result) throw new Error("TMCLASS_SEARCH_PAGE_VALIDATION_MISSING");
        return { entry, result };
      });
      const entries = captured.map((item) => item.entry);
      const parsed = captured.map((item) => item.result);
      if (
        parsed.some(
          (result) =>
            result.elasticMaxResults ||
            result.totalResults !== manifest.totalResults ||
            result.totalPages !== manifest.totalPages,
        )
      ) {
        throw new Error(`TMCLASS_SEARCH_PAGINATION_DRIFT ${language} class ${manifest.niceClass}`);
      }
      await writeHarWithSummary(harPath, entries, {
        schemaVersion: SCHEMA_VERSION,
        kind: "SEARCH",
        language,
        niceClass: manifest.niceClass,
        searchPageSize: configured.searchPageSize,
        pages,
        totalResults: manifest.totalResults,
        totalPages: manifest.totalPages,
        termIds: [...new Set(parsed.flatMap((result) => result.termIds))].sort(),
        termRowCount: parsed.reduce((total, result) => total + result.termRowCount, 0),
        unresolvedTermRowCount: parsed.reduce(
          (total, result) => total + result.unresolvedTermRowCount,
          0,
        ),
      });
      process.stdout.write(
        `${JSON.stringify({ phase: "INDEX", language, niceClass: manifest.niceClass, throughPage: pages.at(-1), totalPages: manifest.totalPages })}\n`,
      );
    }
  }
}

function processIsAlive(processId: number): boolean {
  if (!Number.isSafeInteger(processId) || processId < 1) return false;
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function acquireLanguageLock(
  outputRoot: string,
  language: string,
): Promise<null | (() => Promise<void>)> {
  const languageRoot = path.join(outputRoot, "index", language);
  const completePath = path.join(languageRoot, "COMPLETE.json");
  const lockRoot = path.join(languageRoot, ".capture-lock");
  const ownerPath = path.join(lockRoot, "owner.json");
  await mkdir(languageRoot, { recursive: true });
  for (;;) {
    if (await exists(completePath)) return null;
    try {
      await mkdir(lockRoot);
      await writeJson(ownerPath, {
        schemaVersion: SCHEMA_VERSION,
        processId: process.pid,
        acquiredAt: new Date().toISOString(),
      });
      return async () => rm(lockRoot, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    try {
      const owner = await readJson<{ processId?: unknown }>(ownerPath);
      if (typeof owner.processId === "number" && !processIsAlive(owner.processId)) {
        await rm(lockRoot, { recursive: true, force: true });
        continue;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await delay(10_000);
  }
}

async function collectLockedLanguageIndex(
  configured: Options,
  language: string,
  client: TmclassPublicClient,
): Promise<void> {
  const release = await acquireLanguageLock(configured.outputRoot, language);
  if (release === null) {
    process.stdout.write(`${JSON.stringify({ phase: "INDEX", language, state: "REUSED" })}\n`);
    return;
  }
  try {
    process.stdout.write(`${JSON.stringify({ phase: "INDEX", language, state: "STARTED" })}\n`);
    await collectLanguageIndex(configured, language, client);
    await writeJson(path.join(configured.outputRoot, "index", language, "COMPLETE.json"), {
      schemaVersion: SCHEMA_VERSION,
      outcome: "TMCLASS_LANGUAGE_INDEX_COMPLETE",
      language,
      niceClasses: configured.niceClasses,
      searchPageSize: configured.searchPageSize,
      completedAt: new Date().toISOString(),
    });
    process.stdout.write(`${JSON.stringify({ phase: "INDEX", language, state: "COMPLETED" })}\n`);
  } finally {
    await release();
  }
}

async function filesRecursively(root: string, suffix: string): Promise<string[]> {
  if (!(await exists(root))) return [];
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await filesRecursively(child, suffix)));
    else if (entry.isFile() && entry.name.endsWith(suffix)) result.push(child);
  }
  return result.sort();
}

async function indexedSearchState(outputRoot: string): Promise<{
  termIds: Set<string>;
  unresolvedTermRowCount: number;
}> {
  const termIds = new Set<string>();
  let unresolvedTermRowCount = 0;
  for (const summaryPath of await filesRecursively(
    path.join(outputRoot, "index"),
    ".summary.json",
  )) {
    const summary = await readJson<SearchBatchSummary>(summaryPath);
    if (summary.kind !== "SEARCH") continue;
    for (const id of summary.termIds) termIds.add(id);
    unresolvedTermRowCount += summary.unresolvedTermRowCount ?? 0;
  }
  return { termIds, unresolvedTermRowCount };
}

async function detailState(outputRoot: string): Promise<{
  termIds: Set<string>;
  conceptIds: Set<string>;
  conceptLanguageRoutes: Set<string>;
  completedRoutes: Set<string>;
  unresolvedSearchTermRowCount: number;
}> {
  const index = await indexedSearchState(outputRoot);
  const termIds = index.termIds;
  const conceptIds = new Set<string>();
  const conceptLanguageRoutes = new Set<string>();
  const completedRoutes = new Set<string>();
  for (const summaryPath of await filesRecursively(
    path.join(outputRoot, "details"),
    ".summary.json",
  )) {
    const summary = await readJson<DetailBatchSummary>(summaryPath);
    for (const route of summary.routes) completedRoutes.add(route);
    for (const id of summary.termIds) termIds.add(id);
    for (const id of summary.conceptIds) conceptIds.add(id);
    for (const route of summary.conceptLanguageRoutes) conceptLanguageRoutes.add(route);
  }
  return {
    termIds,
    conceptIds,
    conceptLanguageRoutes,
    completedRoutes,
    unresolvedSearchTermRowCount: index.unresolvedTermRowCount,
  };
}

function detailDirectory(kind: DetailBatchSummary["kind"]): string {
  if (kind === "TERM") return "term";
  if (kind === "CONCEPT") return "concept";
  return "concept-language";
}

async function captureDetailBatch(input: {
  configured: Options;
  client: TmclassPublicClient;
  state: Awaited<ReturnType<typeof detailState>>;
  kind: DetailBatchSummary["kind"];
  routes: string[];
}): Promise<void> {
  const entries = await mapConcurrent(input.routes, input.configured.concurrency, (route) =>
    input.client.capture(tmclassRouteUrl(route), false),
  );
  const links = entries.map((entry) => parseTmclassDetailLinks(entry.html));
  const discoveredTermIds = [...new Set(links.flatMap((item) => item.termIds))].sort();
  const discoveredConceptIds = [...new Set(links.flatMap((item) => item.conceptIds))].sort();
  const discoveredConceptLanguageRoutes = [
    ...new Set(links.flatMap((item) => item.conceptLanguageRoutes)),
  ].sort();
  const batch = sha256(input.routes.join("\n")).slice(0, 16);
  const harPath = path.join(
    input.configured.outputRoot,
    "details",
    detailDirectory(input.kind),
    `batch-${batch}.har`,
  );
  await writeHarWithSummary(harPath, entries, {
    schemaVersion: SCHEMA_VERSION,
    kind: input.kind,
    routes: input.routes,
    termIds: discoveredTermIds,
    conceptIds: discoveredConceptIds,
    conceptLanguageRoutes: discoveredConceptLanguageRoutes,
  });
  for (const route of input.routes) input.state.completedRoutes.add(route);
  for (const id of discoveredTermIds) input.state.termIds.add(id);
  for (const id of discoveredConceptIds) input.state.conceptIds.add(id);
  for (const route of discoveredConceptLanguageRoutes) {
    input.state.conceptLanguageRoutes.add(route);
  }
  process.stdout.write(
    `${JSON.stringify({ phase: "DETAILS", kind: input.kind, batch, captured: input.routes.length, knownTerms: input.state.termIds.size, knownConcepts: input.state.conceptIds.size })}\n`,
  );
}

function numericRouteIds(ids: Set<string>, kind: "term" | "concept"): string[] {
  return [...ids]
    .sort((left, right) => Number(left) - Number(right))
    .map((id) => `/ec2/${kind}/${id}`);
}

async function collectDetailClosure(
  configured: Options,
  client: TmclassPublicClient,
): Promise<void> {
  const state = await detailState(configured.outputRoot);
  for (;;) {
    const pendingTerms = numericRouteIds(state.termIds, "term").filter(
      (route) => !state.completedRoutes.has(route),
    );
    if (pendingTerms.length > 0) {
      await captureDetailBatch({
        configured,
        client,
        state,
        kind: "TERM",
        routes: pendingTerms.slice(0, configured.detailBatchSize),
      });
      continue;
    }
    const pendingConcepts = numericRouteIds(state.conceptIds, "concept").filter(
      (route) => !state.completedRoutes.has(route),
    );
    if (pendingConcepts.length > 0) {
      await captureDetailBatch({
        configured,
        client,
        state,
        kind: "CONCEPT",
        routes: pendingConcepts.slice(0, configured.detailBatchSize),
      });
      continue;
    }
    const pendingConceptLanguages = [...state.conceptLanguageRoutes]
      .sort()
      .filter((route) => !state.completedRoutes.has(route));
    if (pendingConceptLanguages.length > 0) {
      await captureDetailBatch({
        configured,
        client,
        state,
        kind: "CONCEPT_LANGUAGE",
        routes: pendingConceptLanguages.slice(0, configured.detailBatchSize),
      });
      continue;
    }
    await writeJson(path.join(configured.outputRoot, "COMPLETE.json"), {
      schemaVersion: SCHEMA_VERSION,
      outcome: "TMCLASS_LIVE_CORPUS_CAPTURE_COMPLETE",
      completedAt: new Date().toISOString(),
      languages: configured.languages,
      searchPageSize: configured.searchPageSize,
      termCount: state.termIds.size,
      conceptCount: state.conceptIds.size,
      conceptLanguageRouteCount: state.conceptLanguageRoutes.size,
      capturedDetailRouteCount: state.completedRoutes.size,
      unresolvedSearchTermRowCount: state.unresolvedSearchTermRowCount,
    });
    return;
  }
}

async function writeStatus(configured: Options, phase: string): Promise<void> {
  const isPrimary =
    configured.capture !== "index" &&
    configured.languages.length === TMCLASS_DATA_LANGUAGES.length &&
    configured.languages.every((language, index) => language === TMCLASS_DATA_LANGUAGES[index]);
  const statusName = isPrimary
    ? "STATUS.json"
    : `STATUS-${sha256(`${configured.capture}\n${configured.languages.join(",")}`).slice(0, 12)}.json`;
  await writeJson(path.join(configured.outputRoot, statusName), {
    schemaVersion: SCHEMA_VERSION,
    phase,
    updatedAt: new Date().toISOString(),
    languages: configured.languages,
    niceClasses: configured.niceClasses,
    capture: configured.capture,
    concurrency: configured.concurrency,
    detailBatchSize: configured.detailBatchSize,
    searchBatchSize: configured.searchBatchSize,
    searchPageSize: configured.searchPageSize,
    minStartIntervalMs: configured.minStartIntervalMs,
    httpTransport: configured.httpTransport,
  });
}

async function waitForIndex(configured: Options): Promise<void> {
  for (;;) {
    const missing: string[] = [];
    for (const language of configured.languages) {
      const completePath = path.join(configured.outputRoot, "index", language, "COMPLETE.json");
      if (!(await exists(completePath))) {
        missing.push(language);
        continue;
      }
      const complete = await readJson<{ niceClasses?: unknown; searchPageSize?: unknown }>(
        completePath,
      );
      if (
        !Array.isArray(complete.niceClasses) ||
        complete.niceClasses.join(",") !== configured.niceClasses.join(",") ||
        (complete.searchPageSize ?? 100) !== configured.searchPageSize
      ) {
        throw new Error(`TMCLASS_LANGUAGE_INDEX_SCOPE_MISMATCH ${language}`);
      }
    }
    if (missing.length === 0) return;
    process.stdout.write(
      `${JSON.stringify({ phase: "WAITING_INDEX", missingLanguageCount: missing.length, missingLanguages: missing })}\n`,
    );
    await delay(30_000);
  }
}

async function main(): Promise<void> {
  const configured = options(process.argv.slice(2));
  await mkdir(configured.outputRoot, { recursive: true });
  const client = new TmclassPublicClient(configured);
  try {
    await ensureRobots(configured.outputRoot, client);
    if (configured.capture !== "details") {
      await writeStatus(configured, "INDEX");
      for (const language of configured.languages) {
        await collectLockedLanguageIndex(configured, language, client);
      }
    }
    if (configured.capture === "index") {
      await writeStatus(configured, "INDEX_COMPLETE");
      return;
    }
    await writeStatus(configured, "WAITING_INDEX");
    await waitForIndex(configured);
    await writeStatus(configured, "DETAILS");
    await collectDetailClosure(configured, client);
    await writeStatus(configured, "COMPLETE");
  } finally {
    await client.close();
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
