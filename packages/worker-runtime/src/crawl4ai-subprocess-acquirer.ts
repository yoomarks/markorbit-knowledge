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

const PROTOCOL_VERSION = "1.0" as const;
const SUPPORTED_OUTPUT_KINDS = new Set<ArtifactKind>([
  "HTML",
  "MARKDOWN",
  "PDF",
  "DOCX",
  "XLSX",
  "CSV",
  "JSON",
  "XML",
  "EMAIL",
  "IMAGE",
  "TEXT",
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type Crawl4AiRunnerRequest = {
  protocolVersion: typeof PROTOCOL_VERSION;
  outputDirectory: string;
  startUrls: string[];
  outputKinds: ArtifactKind[];
  maxDepth: number;
  maxItems: number;
  renderJavascript: boolean;
  fetchAttachments: boolean;
  respectRobots: boolean;
  rateLimitPerMinute: number;
  timeoutSeconds: number;
  includePatterns: string[];
  excludePatterns: string[];
  locale?: string;
  maxArtifactBytes: number;
  maxTotalBytes: number;
  requireEgressProxy: boolean;
};

export type Crawl4AiArtifactManifest = {
  artifactKind: ArtifactKind;
  mimeType: string;
  originalName: string;
  sourceUri: string;
  canonicalUri?: string;
  publishedAt?: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
};

export type Crawl4AiRunnerResponse =
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      ok: true;
      artifacts: Crawl4AiArtifactManifest[];
      pagesAttempted: number;
      totalBytes: number;
    }
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      ok: false;
      error: { code: string; message: string; retryable: boolean };
    };

export interface Crawl4AiProcessRunner {
  run(request: Crawl4AiRunnerRequest, timeoutMs: number): Promise<Crawl4AiRunnerResponse>;
}

export type Crawl4AiSubprocessRunnerOptions = {
  pythonExecutable?: string;
  scriptPath?: string;
  cwd?: string;
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
    "MARKORBIT_CRAWL4AI_EGRESS_PROXY",
  ] as const;
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const key of allowed) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

function redact(value: string): string {
  const proxy = process.env.MARKORBIT_CRAWL4AI_EGRESS_PROXY;
  if (!proxy) return value;
  return value.split(proxy).join("[REDACTED_EGRESS_PROXY]");
}

function parseRunnerResponse(stdout: string): Crawl4AiRunnerResponse {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new CollectionAcquisitionError(
      "CRAWL4AI_PROTOCOL_INVALID",
      "Crawl4AI subprocess did not return valid JSON",
      true,
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CollectionAcquisitionError(
      "CRAWL4AI_PROTOCOL_INVALID",
      "Crawl4AI subprocess returned an invalid response envelope",
      true,
    );
  }
  const record = value as Record<string, unknown>;
  if (record.protocolVersion !== PROTOCOL_VERSION || typeof record.ok !== "boolean") {
    throw new CollectionAcquisitionError(
      "CRAWL4AI_PROTOCOL_INVALID",
      "Crawl4AI subprocess protocol version or response status is invalid",
      true,
    );
  }
  if (record.ok === false) {
    const error = record.error;
    if (typeof error !== "object" || error === null || Array.isArray(error)) {
      throw new CollectionAcquisitionError(
        "CRAWL4AI_PROTOCOL_INVALID",
        "Crawl4AI subprocess error envelope is invalid",
        true,
      );
    }
    const failure = error as Record<string, unknown>;
    if (
      typeof failure.code !== "string" ||
      typeof failure.message !== "string" ||
      typeof failure.retryable !== "boolean"
    ) {
      throw new CollectionAcquisitionError(
        "CRAWL4AI_PROTOCOL_INVALID",
        "Crawl4AI subprocess error fields are invalid",
        true,
      );
    }
    return {
      protocolVersion: PROTOCOL_VERSION,
      ok: false,
      error: {
        code: failure.code,
        message: failure.message,
        retryable: failure.retryable,
      },
    };
  }
  if (!Array.isArray(record.artifacts)) {
    throw new CollectionAcquisitionError(
      "CRAWL4AI_PROTOCOL_INVALID",
      "Crawl4AI subprocess did not return an artifact manifest",
      true,
    );
  }
  return value as Crawl4AiRunnerResponse;
}

export class SubprocessCrawl4AiRunner implements Crawl4AiProcessRunner {
  private readonly pythonExecutable: string;
  private readonly scriptPath: string;
  private readonly cwd: string;
  private readonly maxStdoutBytes: number;
  private readonly maxStderrBytes: number;

  constructor(options: Crawl4AiSubprocessRunnerOptions = {}) {
    this.pythonExecutable =
      options.pythonExecutable ?? process.env.MARKORBIT_CRAWL4AI_PYTHON ?? "python3";
    this.scriptPath =
      options.scriptPath ?? process.env.MARKORBIT_CRAWL4AI_SCRIPT ?? "workers/crawl4ai/acquire.py";
    this.cwd = options.cwd ?? process.cwd();
    this.maxStdoutBytes = options.maxStdoutBytes ?? 1024 * 1024;
    this.maxStderrBytes = options.maxStderrBytes ?? 64 * 1024;
  }

  async run(request: Crawl4AiRunnerRequest, timeoutMs: number): Promise<Crawl4AiRunnerResponse> {
    return await new Promise<Crawl4AiRunnerResponse>((resolvePromise, rejectPromise) => {
      const child = spawn(this.pythonExecutable, [this.scriptPath], {
        cwd: this.cwd,
        env: safeEnvironment(),
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let terminalError: CollectionAcquisitionError | null = null;
      let timedOut = false;

      const terminate = (error: CollectionAcquisitionError) => {
        if (terminalError) return;
        terminalError = error;
        child.kill("SIGKILL");
      };

      const timeout = setTimeout(() => {
        timedOut = true;
        terminate(
          new CollectionAcquisitionError(
            "CRAWL4AI_TIMEOUT",
            "Crawl4AI subprocess exceeded the governed collection timeout",
            true,
          ),
        );
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBytes += chunk.byteLength;
        if (stdoutBytes > this.maxStdoutBytes) {
          terminate(
            new CollectionAcquisitionError(
              "CRAWL4AI_PROTOCOL_OUTPUT_TOO_LARGE",
              "Crawl4AI subprocess response exceeded the protocol output limit",
              false,
            ),
          );
          return;
        }
        stdout.push(chunk);
      });

      child.stderr.on("data", (chunk: Buffer) => {
        if (stderrBytes >= this.maxStderrBytes) return;
        const remaining = this.maxStderrBytes - stderrBytes;
        const bounded = chunk.subarray(0, remaining);
        stderrBytes += bounded.byteLength;
        stderr.push(bounded);
      });

      child.on("error", (error) => {
        clearTimeout(timeout);
        rejectPromise(
          new CollectionAcquisitionError(
            "CRAWL4AI_RUNTIME_UNAVAILABLE",
            `Unable to start Crawl4AI subprocess: ${error.message}`,
            false,
          ),
        );
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        if (terminalError) {
          rejectPromise(terminalError);
          return;
        }
        if (timedOut) return;
        if (code !== 0) {
          const diagnostic = redact(Buffer.concat(stderr).toString("utf8")).trim();
          rejectPromise(
            new CollectionAcquisitionError(
              "CRAWL4AI_PROCESS_FAILED",
              diagnostic
                ? `Crawl4AI subprocess exited with code ${code}: ${diagnostic}`
                : `Crawl4AI subprocess exited with code ${code}`,
              true,
            ),
          );
          return;
        }
        try {
          resolvePromise(parseRunnerResponse(Buffer.concat(stdout).toString("utf8").trim()));
        } catch (error) {
          rejectPromise(error);
        }
      });

      child.stdin.on("error", () => {
        // The close/error handlers own terminal reporting.
      });
      child.stdin.end(JSON.stringify(request));
    });
  }
}

export type Crawl4AiSubprocessAcquirerOptions = {
  runner?: Crawl4AiProcessRunner;
  requireEgressProxy?: boolean;
  maxArtifactBytes?: number;
  maxTotalBytes?: number;
  maxDepth?: number;
  maxItems?: number;
  maxProcessTimeoutMs?: number;
  subprocess?: Crawl4AiSubprocessRunnerOptions;
};

function startUrls(context: ArtifactBackedExecutionContext): string[] {
  const entrypoints = context.job.sourceSnapshot.entrypoints.map((item) => item.uri);
  const values = context.job.sourceSnapshot.canonicalUri
    ? [...entrypoints, context.job.sourceSnapshot.canonicalUri]
    : entrypoints;
  return [...new Set(values)].filter((item) => item.length > 0);
}

function requestedOutputKinds(context: ArtifactBackedExecutionContext): ArtifactKind[] {
  return [...new Set(context.job.planSnapshot.output.artifactKinds)];
}

function assertSupportedJob(
  context: ArtifactBackedExecutionContext,
  maxDepth: number,
  maxItems: number,
): void {
  const { job } = context;
  if (job.connector.connectorId !== "crawl4ai-web") {
    throw new CollectionAcquisitionError(
      "CONNECTOR_NOT_SUPPORTED",
      `Crawl4AI acquirer cannot execute connector ${job.connector.connectorId}`,
      false,
    );
  }
  if (job.sourceSnapshot.sourceType !== "WEB") {
    throw new CollectionAcquisitionError(
      "SOURCE_TYPE_NOT_SUPPORTED",
      `Crawl4AI acquirer requires WEB sources, received ${job.sourceSnapshot.sourceType}`,
      false,
    );
  }
  const outputs = requestedOutputKinds(context);
  if (outputs.some((kind) => !SUPPORTED_OUTPUT_KINDS.has(kind))) {
    throw new CollectionAcquisitionError(
      "OUTPUT_KIND_NOT_SUPPORTED",
      "Crawl4AI production adapter received an unsupported page or attachment artifact kind",
      false,
    );
  }
  if (job.planSnapshot.policy.maxDepth > maxDepth) {
    throw new CollectionAcquisitionError(
      "CRAWL_DEPTH_LIMIT_EXCEEDED",
      `CollectionPlan maxDepth ${job.planSnapshot.policy.maxDepth} exceeds Worker limit ${maxDepth}`,
      false,
    );
  }
  if (job.planSnapshot.policy.maxItems > maxItems) {
    throw new CollectionAcquisitionError(
      "CRAWL_ITEM_LIMIT_EXCEEDED",
      `CollectionPlan maxItems ${job.planSnapshot.policy.maxItems} exceeds Worker limit ${maxItems}`,
      false,
    );
  }
  if (startUrls(context).length === 0) {
    throw new CollectionAcquisitionError(
      "SOURCE_ENTRYPOINT_REQUIRED",
      "Crawl4AI production collection requires at least one Source entrypoint",
      false,
    );
  }
}

function processTimeoutMs(context: ArtifactBackedExecutionContext, maximum: number): number {
  const policy = context.job.planSnapshot.policy;
  const pageBudget = (policy.timeoutSeconds + 5) * 1000 * Math.min(policy.maxItems, 50);
  const rateBudget =
    policy.maxItems <= 1
      ? 0
      : Math.ceil(((policy.maxItems - 1) * 60_000) / policy.rateLimitPerMinute);
  return Math.min(maximum, Math.max(30_000, pageBudget + rateBudget));
}

function isManifest(value: unknown): value is Crawl4AiArtifactManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.artifactKind === "string" &&
    SUPPORTED_OUTPUT_KINDS.has(item.artifactKind as ArtifactKind) &&
    typeof item.mimeType === "string" &&
    item.mimeType.length > 0 &&
    typeof item.originalName === "string" &&
    item.originalName.length > 0 &&
    typeof item.sourceUri === "string" &&
    item.sourceUri.length > 0 &&
    (item.canonicalUri === undefined || typeof item.canonicalUri === "string") &&
    (item.publishedAt === undefined || typeof item.publishedAt === "string") &&
    typeof item.fileName === "string" &&
    item.fileName.length > 0 &&
    typeof item.sizeBytes === "number" &&
    Number.isInteger(item.sizeBytes) &&
    item.sizeBytes > 0 &&
    typeof item.sha256 === "string" &&
    SHA256_PATTERN.test(item.sha256)
  );
}

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

async function readManifestArtifact(
  outputDirectory: string,
  manifest: Crawl4AiArtifactManifest,
  authorizedKinds: ArtifactKind[],
  maxArtifactBytes: number,
): Promise<AcquiredCollectionArtifact> {
  if (!authorizedKinds.includes(manifest.artifactKind)) {
    throw new CollectionAcquisitionError(
      "ARTIFACT_KIND_NOT_AUTHORIZED",
      `Crawl4AI emitted ${manifest.artifactKind} outside the immutable CollectionPlan output`,
      false,
    );
  }
  if (manifest.fileName !== basename(manifest.fileName) || isAbsolute(manifest.fileName)) {
    throw new CollectionAcquisitionError(
      "CRAWL4AI_ARTIFACT_PATH_INVALID",
      "Crawl4AI artifact manifest attempted to escape the temporary output directory",
      false,
    );
  }

  const root = await realpath(outputDirectory);
  const candidate = resolve(root, manifest.fileName);
  const resolved = await realpath(candidate);
  const pathFromRoot = relative(root, resolved);
  if (!pathFromRoot || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw new CollectionAcquisitionError(
      "CRAWL4AI_ARTIFACT_PATH_INVALID",
      "Crawl4AI artifact path is outside the temporary output directory",
      false,
    );
  }

  const metadata = await stat(resolved);
  if (!metadata.isFile()) {
    throw new CollectionAcquisitionError(
      "CRAWL4AI_ARTIFACT_PATH_INVALID",
      "Crawl4AI artifact manifest does not reference a regular file",
      false,
    );
  }
  if (metadata.size !== manifest.sizeBytes || metadata.size > maxArtifactBytes) {
    throw new CollectionAcquisitionError(
      "CRAWL4AI_ARTIFACT_SIZE_MISMATCH",
      "Crawl4AI artifact size does not match the bounded manifest",
      false,
    );
  }

  const content = await readFile(resolved);
  if (sha256(content) !== manifest.sha256) {
    throw new CollectionAcquisitionError(
      "CRAWL4AI_ARTIFACT_DIGEST_MISMATCH",
      "Crawl4AI artifact SHA-256 does not match the subprocess manifest",
      false,
    );
  }

  return {
    artifactKind: manifest.artifactKind,
    mimeType: manifest.mimeType,
    originalName: manifest.originalName,
    sourceUri: manifest.sourceUri,
    ...(manifest.canonicalUri ? { canonicalUri: manifest.canonicalUri } : {}),
    ...(manifest.publishedAt ? { publishedAt: manifest.publishedAt } : {}),
    content,
  };
}

/**
 * Real Crawl4AI acquisition provider behind the governed Worker lease boundary.
 *
 * The Python runtime is intentionally a byte-producing sidecar only. It cannot
 * claim Jobs, mutate CollectionRun state or register RawArtifacts. Those remain
 * authoritative Node/control-plane operations in ArtifactBackedCollectionExecutor.
 */
export class Crawl4AiSubprocessAcquirer implements CollectionArtifactAcquirer {
  readonly executor: ExecutionExecutor = {
    executorId: "crawl4ai-python",
    version: "1.0.0",
    mode: "PRODUCTION",
  };

  private readonly runner: Crawl4AiProcessRunner;
  private readonly requireEgressProxy: boolean;
  private readonly maxArtifactBytes: number;
  private readonly maxTotalBytes: number;
  private readonly maxDepth: number;
  private readonly maxItems: number;
  private readonly maxProcessTimeoutMs: number;

  constructor(options: Crawl4AiSubprocessAcquirerOptions = {}) {
    this.runner = options.runner ?? new SubprocessCrawl4AiRunner(options.subprocess);
    this.requireEgressProxy =
      options.requireEgressProxy ?? process.env.MARKORBIT_CRAWL4AI_REQUIRE_EGRESS_PROXY !== "0";
    this.maxArtifactBytes = options.maxArtifactBytes ?? 16 * 1024 * 1024;
    this.maxTotalBytes = options.maxTotalBytes ?? 64 * 1024 * 1024;
    this.maxDepth = options.maxDepth ?? 5;
    this.maxItems = options.maxItems ?? 500;
    this.maxProcessTimeoutMs = options.maxProcessTimeoutMs ?? 30 * 60 * 1000;
  }

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    assertSupportedJob(context, this.maxDepth, this.maxItems);
    if (this.requireEgressProxy && !process.env.MARKORBIT_CRAWL4AI_EGRESS_PROXY) {
      throw new CollectionAcquisitionError(
        "EGRESS_PROXY_REQUIRED",
        "Production Crawl4AI execution requires MARKORBIT_CRAWL4AI_EGRESS_PROXY",
        false,
      );
    }

    const outputDirectory = await mkdtemp(join(tmpdir(), "markorbit-crawl4ai-"));
    try {
      const policy = context.job.planSnapshot.policy;
      const outputKinds = requestedOutputKinds(context);
      const request: Crawl4AiRunnerRequest = {
        protocolVersion: PROTOCOL_VERSION,
        outputDirectory,
        startUrls: startUrls(context),
        outputKinds,
        maxDepth: policy.maxDepth,
        maxItems: policy.maxItems,
        renderJavascript: policy.renderJavascript,
        fetchAttachments: policy.fetchAttachments,
        respectRobots: policy.respectRobots,
        rateLimitPerMinute: policy.rateLimitPerMinute,
        timeoutSeconds: policy.timeoutSeconds,
        includePatterns: [...policy.includePatterns],
        excludePatterns: [...policy.excludePatterns],
        ...(policy.locale ? { locale: policy.locale } : {}),
        maxArtifactBytes: this.maxArtifactBytes,
        maxTotalBytes: this.maxTotalBytes,
        requireEgressProxy: this.requireEgressProxy,
      };

      const response = await this.runner.run(
        request,
        processTimeoutMs(context, this.maxProcessTimeoutMs),
      );
      if (!response.ok) {
        throw new CollectionAcquisitionError(
          response.error.code,
          response.error.message,
          response.error.retryable,
        );
      }
      if (response.artifacts.length === 0) {
        throw new CollectionAcquisitionError(
          "NO_ARTIFACTS_PRODUCED",
          "Crawl4AI subprocess completed without artifact manifests",
          false,
        );
      }
      if (response.artifacts.length > policy.maxItems * outputKinds.length) {
        throw new CollectionAcquisitionError(
          "CRAWL4AI_PROTOCOL_INVALID",
          "Crawl4AI subprocess exceeded the immutable page/output artifact budget",
          false,
        );
      }

      const artifacts: AcquiredCollectionArtifact[] = [];
      let totalBytes = 0;
      for (const candidate of response.artifacts) {
        if (!isManifest(candidate)) {
          throw new CollectionAcquisitionError(
            "CRAWL4AI_PROTOCOL_INVALID",
            "Crawl4AI subprocess returned an invalid artifact manifest",
            false,
          );
        }
        const artifact = await readManifestArtifact(
          outputDirectory,
          candidate,
          outputKinds,
          this.maxArtifactBytes,
        );
        totalBytes += artifact.content.byteLength;
        if (totalBytes > this.maxTotalBytes) {
          throw new CollectionAcquisitionError(
            "COLLECTION_TOO_LARGE",
            "Crawl4AI collection exceeded the governed total byte limit",
            false,
          );
        }
        artifacts.push(artifact);
      }
      if (response.totalBytes !== totalBytes) {
        throw new CollectionAcquisitionError(
          "CRAWL4AI_ARTIFACT_SIZE_MISMATCH",
          "Crawl4AI response totalBytes does not match verified artifact bytes",
          false,
        );
      }
      return artifacts;
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }
}
