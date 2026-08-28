import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type { ArtifactKind, ExecutionExecutor } from "@markorbit/contracts";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import type {
  Crawl4AiArtifactManifest,
  Crawl4AiRunnerResponse,
} from "./crawl4ai-subprocess-acquirer";

const PROTOCOL_VERSION = "1.0" as const;
const DEFAULT_ENDPOINT = "https://api.brightdata.com/request";
const PAGE_OUTPUT_KINDS = new Set<ArtifactKind>(["HTML", "MARKDOWN"]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const HARD_MAX_REQUESTS_PER_RUN = 50;
const DEFAULT_MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 64 * 1024 * 1024;

export type BrightDataUnlockedPage = { sourceUri: string; html: string };

export interface BrightDataWebUnlocker {
  unlock(url: string): Promise<BrightDataUnlockedPage>;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type BrightDataWebUnlockerClientOptions = {
  apiToken: string;
  zone: string;
  endpoint?: string;
  fetcher?: FetchLike;
  maxResponseBytes?: number;
};

export class BrightDataWebUnlockerClient implements BrightDataWebUnlocker {
  private readonly apiToken: string;
  private readonly zone: string;
  private readonly endpoint: string;
  private readonly fetcher: FetchLike;
  private readonly maxResponseBytes: number;

  constructor(options: BrightDataWebUnlockerClientOptions) {
    this.apiToken = options.apiToken.trim();
    this.zone = options.zone.trim();
    if (!this.apiToken) throw new Error("Bright Data apiToken is required");
    if (!this.zone) throw new Error("Bright Data Web Unlocker zone is required");
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.fetcher = options.fetcher ?? fetch;
    this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_ARTIFACT_BYTES;
  }

  async unlock(url: string): Promise<BrightDataUnlockedPage> {
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ zone: this.zone, url, format: "raw" }),
      });
    } catch {
      throw new CollectionAcquisitionError(
        "BRIGHTDATA_DELIVERY_UNKNOWN",
        "Bright Data request delivery state is unknown; automatic replay is disabled",
        false,
      );
    }

    if (!response.ok) {
      const quotaOrPayment = response.status === 402 || response.status === 429;
      throw new CollectionAcquisitionError(
        quotaOrPayment
          ? "BRIGHTDATA_QUOTA_OR_PAYMENT_REQUIRED"
          : `BRIGHTDATA_HTTP_${response.status}`,
        quotaOrPayment
          ? "Bright Data free allowance, rate, or provider-side payment boundary was reached"
          : `Bright Data Web Unlocker failed with HTTP ${response.status}`,
        false,
      );
    }

    let html: string;
    try {
      html = await response.text();
    } catch {
      throw new CollectionAcquisitionError(
        "BRIGHTDATA_RESPONSE_UNKNOWN",
        "Bright Data response body could not be read; automatic replay is disabled",
        false,
      );
    }
    if (!html.trim()) {
      throw new CollectionAcquisitionError(
        "BRIGHTDATA_EMPTY_RESPONSE",
        "Bright Data Web Unlocker returned an empty response",
        false,
      );
    }
    if (Buffer.byteLength(html, "utf8") > this.maxResponseBytes) {
      throw new CollectionAcquisitionError(
        "BRIGHTDATA_RESPONSE_TOO_LARGE",
        "Bright Data Web Unlocker response exceeded the governed page byte limit",
        false,
      );
    }
    return { sourceUri: url, html };
  }
}

export type RawHtmlProcessorRequest = {
  pages: BrightDataUnlockedPage[];
  outputKinds: ArtifactKind[];
  maxArtifactBytes: number;
  maxTotalBytes: number;
};

export interface RawHtmlArtifactProcessor {
  process(request: RawHtmlProcessorRequest): Promise<AcquiredCollectionArtifact[]>;
}

export type Crawl4AiRawHtmlSubprocessProcessorOptions = {
  pythonExecutable?: string;
  scriptPath?: string;
  cwd?: string;
  timeoutMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
};

function safeEnvironment(): NodeJS.ProcessEnv {
  const allowed = [
    "PATH",
    "HOME",
    "USERPROFILE",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "PLAYWRIGHT_BROWSERS_PATH",
  ] as const;
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const key of allowed) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

function isManifest(value: unknown): value is Crawl4AiArtifactManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.artifactKind === "string" &&
    PAGE_OUTPUT_KINDS.has(item.artifactKind as ArtifactKind) &&
    typeof item.mimeType === "string" &&
    typeof item.originalName === "string" &&
    typeof item.sourceUri === "string" &&
    typeof item.fileName === "string" &&
    typeof item.sizeBytes === "number" &&
    Number.isInteger(item.sizeBytes) &&
    item.sizeBytes > 0 &&
    typeof item.sha256 === "string" &&
    SHA256_PATTERN.test(item.sha256)
  );
}

function parseProcessorResponse(stdout: string): Crawl4AiRunnerResponse {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new CollectionAcquisitionError(
      "CRAWL4AI_RAW_PROTOCOL_INVALID",
      "Raw HTML processor did not return valid JSON",
      false,
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CollectionAcquisitionError(
      "CRAWL4AI_RAW_PROTOCOL_INVALID",
      "Raw HTML processor returned an invalid response envelope",
      false,
    );
  }
  const record = value as Record<string, unknown>;
  if (record.protocolVersion !== PROTOCOL_VERSION || typeof record.ok !== "boolean") {
    throw new CollectionAcquisitionError(
      "CRAWL4AI_RAW_PROTOCOL_INVALID",
      "Raw HTML processor protocol version or response status is invalid",
      false,
    );
  }
  return value as Crawl4AiRunnerResponse;
}

async function readArtifact(
  outputDirectory: string,
  manifest: Crawl4AiArtifactManifest,
  outputKinds: ArtifactKind[],
  maxArtifactBytes: number,
): Promise<AcquiredCollectionArtifact> {
  if (!outputKinds.includes(manifest.artifactKind)) {
    throw new CollectionAcquisitionError(
      "ARTIFACT_KIND_NOT_AUTHORIZED",
      `Raw HTML processor emitted ${manifest.artifactKind} outside the immutable CollectionPlan output`,
      false,
    );
  }
  if (manifest.fileName !== basename(manifest.fileName) || isAbsolute(manifest.fileName)) {
    throw new CollectionAcquisitionError(
      "CRAWL4AI_RAW_ARTIFACT_PATH_INVALID",
      "Raw HTML processor artifact path is invalid",
      false,
    );
  }
  const root = await realpath(outputDirectory);
  const resolved = await realpath(resolve(root, manifest.fileName));
  const pathFromRoot = relative(root, resolved);
  if (!pathFromRoot || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw new CollectionAcquisitionError(
      "CRAWL4AI_RAW_ARTIFACT_PATH_INVALID",
      "Raw HTML processor artifact path escaped the temporary output directory",
      false,
    );
  }
  const metadata = await stat(resolved);
  if (
    !metadata.isFile() ||
    metadata.size !== manifest.sizeBytes ||
    metadata.size > maxArtifactBytes
  ) {
    throw new CollectionAcquisitionError(
      "CRAWL4AI_RAW_ARTIFACT_SIZE_MISMATCH",
      "Raw HTML processor artifact size does not match its bounded manifest",
      false,
    );
  }
  const content = await readFile(resolved);
  const digest = createHash("sha256").update(content).digest("hex");
  if (digest !== manifest.sha256) {
    throw new CollectionAcquisitionError(
      "CRAWL4AI_RAW_ARTIFACT_DIGEST_MISMATCH",
      "Raw HTML processor artifact digest does not match its manifest",
      false,
    );
  }
  return {
    artifactKind: manifest.artifactKind,
    mimeType: manifest.mimeType,
    originalName: manifest.originalName,
    sourceUri: manifest.sourceUri,
    ...(manifest.canonicalUri ? { canonicalUri: manifest.canonicalUri } : {}),
    content,
  };
}

export class Crawl4AiRawHtmlSubprocessProcessor implements RawHtmlArtifactProcessor {
  private readonly pythonExecutable: string;
  private readonly scriptPath: string;
  private readonly cwd: string;
  private readonly timeoutMs: number;
  private readonly maxStdoutBytes: number;
  private readonly maxStderrBytes: number;

  constructor(options: Crawl4AiRawHtmlSubprocessProcessorOptions = {}) {
    this.pythonExecutable =
      options.pythonExecutable ?? process.env.MARKORBIT_CRAWL4AI_PYTHON ?? "python3";
    this.scriptPath = options.scriptPath ?? "workers/crawl4ai/process_raw_html.py";
    this.cwd = options.cwd ?? process.cwd();
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.maxStdoutBytes = options.maxStdoutBytes ?? 1024 * 1024;
    this.maxStderrBytes = options.maxStderrBytes ?? 64 * 1024;
  }

  async process(request: RawHtmlProcessorRequest): Promise<AcquiredCollectionArtifact[]> {
    const outputDirectory = await mkdtemp(join(tmpdir(), "markorbit-crawl4ai-raw-"));
    try {
      const response = await new Promise<Crawl4AiRunnerResponse>(
        (resolvePromise, rejectPromise) => {
          const child = spawn(this.pythonExecutable, [this.scriptPath], {
            cwd: this.cwd,
            env: safeEnvironment(),
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
          });
          const stdout: Buffer[] = [];
          let stdoutBytes = 0;
          let stderrBytes = 0;
          const stderr: Buffer[] = [];
          let terminal = false;
          const fail = (error: CollectionAcquisitionError) => {
            if (terminal) return;
            terminal = true;
            child.kill("SIGKILL");
            rejectPromise(error);
          };
          const timer = setTimeout(
            () =>
              fail(
                new CollectionAcquisitionError(
                  "CRAWL4AI_RAW_TIMEOUT",
                  "Raw HTML processor timed out",
                  false,
                ),
              ),
            this.timeoutMs,
          );
          child.stdout.on("data", (chunk: Buffer) => {
            stdoutBytes += chunk.byteLength;
            if (stdoutBytes > this.maxStdoutBytes) {
              fail(
                new CollectionAcquisitionError(
                  "CRAWL4AI_RAW_PROTOCOL_TOO_LARGE",
                  "Raw HTML processor protocol output exceeded its limit",
                  false,
                ),
              );
              return;
            }
            stdout.push(chunk);
          });
          child.stderr.on("data", (chunk: Buffer) => {
            if (stderrBytes >= this.maxStderrBytes) return;
            const bounded = chunk.subarray(0, this.maxStderrBytes - stderrBytes);
            stderrBytes += bounded.byteLength;
            stderr.push(bounded);
          });
          child.on("error", (error) => {
            clearTimeout(timer);
            if (!terminal) {
              terminal = true;
              rejectPromise(
                new CollectionAcquisitionError(
                  "CRAWL4AI_RAW_RUNTIME_UNAVAILABLE",
                  `Unable to start raw HTML processor: ${error.message}`,
                  false,
                ),
              );
            }
          });
          child.on("close", (code) => {
            clearTimeout(timer);
            if (terminal) return;
            terminal = true;
            if (code !== 0) {
              const diagnostic = Buffer.concat(stderr).toString("utf8").trim().slice(0, 1000);
              rejectPromise(
                new CollectionAcquisitionError(
                  "CRAWL4AI_RAW_PROCESS_FAILED",
                  diagnostic
                    ? `Raw HTML processor exited with code ${code}: ${diagnostic}`
                    : `Raw HTML processor exited with code ${code}`,
                  false,
                ),
              );
              return;
            }
            try {
              resolvePromise(parseProcessorResponse(Buffer.concat(stdout).toString("utf8").trim()));
            } catch (error) {
              rejectPromise(error);
            }
          });
          child.stdin.on("error", () => undefined);
          child.stdin.end(
            JSON.stringify({
              protocolVersion: PROTOCOL_VERSION,
              outputDirectory,
              pages: request.pages,
              outputKinds: request.outputKinds,
              maxArtifactBytes: request.maxArtifactBytes,
              maxTotalBytes: request.maxTotalBytes,
            }),
          );
        },
      );

      if (!response.ok) {
        throw new CollectionAcquisitionError(response.error.code, response.error.message, false);
      }
      const artifacts: AcquiredCollectionArtifact[] = [];
      let totalBytes = 0;
      for (const manifest of response.artifacts) {
        if (!isManifest(manifest)) {
          throw new CollectionAcquisitionError(
            "CRAWL4AI_RAW_PROTOCOL_INVALID",
            "Raw HTML processor returned an invalid artifact manifest",
            false,
          );
        }
        const artifact = await readArtifact(
          outputDirectory,
          manifest,
          request.outputKinds,
          request.maxArtifactBytes,
        );
        totalBytes += artifact.content.byteLength;
        if (totalBytes > request.maxTotalBytes) {
          throw new CollectionAcquisitionError(
            "COLLECTION_TOO_LARGE",
            "Unlocked collection exceeded the governed total byte limit",
            false,
          );
        }
        artifacts.push(artifact);
      }
      if (artifacts.length === 0 || response.totalBytes !== totalBytes) {
        throw new CollectionAcquisitionError(
          "CRAWL4AI_RAW_ARTIFACT_SIZE_MISMATCH",
          "Raw HTML processor byte manifest is incomplete",
          false,
        );
      }
      return artifacts;
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }
}

export type BrightDataFallbackAcquirerOptions = {
  primary: CollectionArtifactAcquirer;
  unlocker: BrightDataWebUnlocker;
  processor?: RawHtmlArtifactProcessor;
  enabled?: boolean;
  maxRequestsPerRun?: number;
  maxArtifactBytes?: number;
  maxTotalBytes?: number;
};

function startUrls(context: ArtifactBackedExecutionContext): string[] {
  const entrypoints = context.job.sourceSnapshot.entrypoints.map((item) => item.uri);
  const values = context.job.sourceSnapshot.canonicalUri
    ? [...entrypoints, context.job.sourceSnapshot.canonicalUri]
    : entrypoints;
  return [...new Set(values)].filter(Boolean);
}

/**
 * Optional anti-bot fallback around the primary Crawl4AI acquirer. It never
 * replaces normal crawling and never retries an external request internally.
 */
export class BrightDataFallbackAcquirer implements CollectionArtifactAcquirer {
  readonly executor: ExecutionExecutor;
  private readonly primary: CollectionArtifactAcquirer;
  private readonly unlocker: BrightDataWebUnlocker;
  private readonly processor: RawHtmlArtifactProcessor;
  private readonly enabled: boolean;
  private readonly maxRequestsPerRun: number;
  private readonly maxArtifactBytes: number;
  private readonly maxTotalBytes: number;

  constructor(options: BrightDataFallbackAcquirerOptions) {
    this.primary = options.primary;
    this.executor = options.primary.executor;
    this.unlocker = options.unlocker;
    this.processor = options.processor ?? new Crawl4AiRawHtmlSubprocessProcessor();
    this.enabled = options.enabled ?? true;
    this.maxRequestsPerRun = Math.min(
      Math.max(options.maxRequestsPerRun ?? 5, 1),
      HARD_MAX_REQUESTS_PER_RUN,
    );
    this.maxArtifactBytes = options.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES;
    this.maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  }

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    try {
      return await this.primary.acquire(context);
    } catch (error) {
      if (
        !this.enabled ||
        !(error instanceof CollectionAcquisitionError) ||
        error.code !== "CRAWL4AI_FETCH_FAILED"
      ) {
        throw error;
      }

      const outputKinds = [...new Set(context.job.planSnapshot.output.artifactKinds)];
      if (outputKinds.length === 0 || outputKinds.some((kind) => !PAGE_OUTPUT_KINDS.has(kind))) {
        throw error;
      }
      const urls = startUrls(context);
      if (urls.length === 0 || urls.length > this.maxRequestsPerRun) {
        throw new CollectionAcquisitionError(
          "BRIGHTDATA_FALLBACK_REQUEST_BUDGET_EXCEEDED",
          `Bright Data fallback requires ${urls.length} start requests; configured cap is ${this.maxRequestsPerRun}`,
          false,
        );
      }

      const pages: BrightDataUnlockedPage[] = [];
      let unlockedBytes = 0;
      for (const url of urls) {
        const page = await this.unlocker.unlock(url);
        unlockedBytes += Buffer.byteLength(page.html, "utf8");
        if (unlockedBytes > this.maxTotalBytes) {
          throw new CollectionAcquisitionError(
            "COLLECTION_TOO_LARGE",
            "Bright Data fallback exceeded the governed total byte limit before processing",
            false,
          );
        }
        pages.push(page);
      }

      return await this.processor.process({
        pages,
        outputKinds,
        maxArtifactBytes: this.maxArtifactBytes,
        maxTotalBytes: this.maxTotalBytes,
      });
    }
  }
}
