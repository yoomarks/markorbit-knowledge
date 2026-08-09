import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import type { ArtifactKind, RuntimeConverterRef } from "@markorbit/contracts";
import {
  PRODUCTION_MARKDOWN_STAGING_LIMITS,
  canonicalMarkdownFrontmatter,
  type ProductionConversionRuntimeClient,
  type ProductionMarkdownStagingContext,
  type ProductionMarkdownStagingResult,
  type ProductionRawArtifactReader,
  type ProductionStagingUploadEvidence,
  type ProductionStagingUploader,
} from "./production-markdown-staging";

export const PRODUCTION_RICH_DOCUMENT_MARKDOWN_CONVERTER = {
  converterId: "local-rich-document-markdown",
  version: "1.0.0",
} as const satisfies RuntimeConverterRef;

export const PRODUCTION_OCR_MARKDOWN_CONVERTER = {
  converterId: "local-ocr-markdown",
  version: "1.0.0",
} as const satisfies RuntimeConverterRef;

export const LOCAL_DOCUMENT_EXTRACTION_LIMITS = {
  maximumInputBytes: 25_000_000,
  maximumOutputBodyBytes: 4_500_000,
  maximumCanonicalOutputBytes: PRODUCTION_MARKDOWN_STAGING_LIMITS.maximumOutputBytes,
  maximumPages: 80,
  timeoutSeconds: 180,
  maximumProtocolStdoutBytes: 256_000,
  maximumProtocolStderrBytes: 64_000,
} as const;

const RICH_KINDS = new Set<ArtifactKind>(["DOCX", "XLSX", "CSV", "JSON", "XML", "EMAIL", "TEXT"]);
const OCR_KINDS = new Set<ArtifactKind>(["PDF", "IMAGE"]);
const SHA256 = /^[a-f0-9]{64}$/;
const FAILURE_CODE = /^[A-Z0-9][A-Z0-9_]{1,99}$/;
const PROTOCOL_VERSION = "1.0" as const;

export type LocalDocumentExtractionMode = "RICH" | "OCR";

export type LocalDocumentExtractionRequest = {
  artifactKind: ArtifactKind;
  mimeType: string;
  languages: string[];
  mode: LocalDocumentExtractionMode;
  input: Uint8Array;
  maxOutputBytes?: number;
  maxPages?: number;
  timeoutSeconds?: number;
};

export type LocalDocumentExtractionResult = {
  body: Uint8Array;
  extractionMethod: string;
  pageCount?: number;
};

export class LocalDocumentExtractionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "LocalDocumentExtractionError";
  }
}

export interface LocalDocumentExtractionRunner {
  extract(request: LocalDocumentExtractionRequest): Promise<LocalDocumentExtractionResult>;
}

type RunnerEnvelope =
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      ok: true;
      outputFile: string;
      sizeBytes: number;
      sha256: string;
      extractionMethod: string;
      pageCount?: number;
    }
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      ok: false;
      error: { code: string; message: string; retryable: boolean };
    };

export type SubprocessDocumentExtractionRunnerOptions = {
  pythonExecutable?: string;
  scriptPath?: string;
  cwd?: string;
  maximumProtocolStdoutBytes?: number;
  maximumProtocolStderrBytes?: number;
};

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

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
    "TESSDATA_PREFIX",
    "MARKORBIT_TESSERACT_EXECUTABLE",
    "MARKORBIT_PDFTOPPM_EXECUTABLE",
  ] as const;
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const key of allowed) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

function parseEnvelope(stdout: string): RunnerEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new LocalDocumentExtractionError(
      "DOCUMENT_EXTRACTION_PROTOCOL_INVALID",
      "Document extraction subprocess did not return valid JSON",
      true,
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new LocalDocumentExtractionError(
      "DOCUMENT_EXTRACTION_PROTOCOL_INVALID",
      "Document extraction subprocess returned an invalid envelope",
      true,
    );
  }
  const record = value as Record<string, unknown>;
  if (record.protocolVersion !== PROTOCOL_VERSION || typeof record.ok !== "boolean") {
    throw new LocalDocumentExtractionError(
      "DOCUMENT_EXTRACTION_PROTOCOL_INVALID",
      "Document extraction protocol version or status is invalid",
      true,
    );
  }
  if (record.ok === false) {
    const error = record.error;
    if (typeof error !== "object" || error === null || Array.isArray(error)) {
      throw new LocalDocumentExtractionError(
        "DOCUMENT_EXTRACTION_PROTOCOL_INVALID",
        "Document extraction error envelope is invalid",
        true,
      );
    }
    const failure = error as Record<string, unknown>;
    if (
      typeof failure.code !== "string" ||
      !FAILURE_CODE.test(failure.code) ||
      typeof failure.message !== "string" ||
      typeof failure.retryable !== "boolean"
    ) {
      throw new LocalDocumentExtractionError(
        "DOCUMENT_EXTRACTION_PROTOCOL_INVALID",
        "Document extraction error fields are invalid",
        true,
      );
    }
    throw new LocalDocumentExtractionError(
      failure.code,
      failure.message.slice(0, 1000),
      failure.retryable,
    );
  }
  if (
    typeof record.outputFile !== "string" ||
    basename(record.outputFile) !== record.outputFile ||
    typeof record.sizeBytes !== "number" ||
    !Number.isSafeInteger(record.sizeBytes) ||
    record.sizeBytes <= 0 ||
    typeof record.sha256 !== "string" ||
    !SHA256.test(record.sha256) ||
    typeof record.extractionMethod !== "string" ||
    !/^[A-Z0-9][A-Z0-9_]{1,79}$/.test(record.extractionMethod) ||
    (record.pageCount !== undefined &&
      (typeof record.pageCount !== "number" ||
        !Number.isSafeInteger(record.pageCount) ||
        record.pageCount <= 0))
  ) {
    throw new LocalDocumentExtractionError(
      "DOCUMENT_EXTRACTION_PROTOCOL_INVALID",
      "Document extraction success fields are invalid",
      true,
    );
  }
  return record as RunnerEnvelope;
}

function assertRequest(request: LocalDocumentExtractionRequest): void {
  if (!request.mimeType.trim()) {
    throw new LocalDocumentExtractionError("DOCUMENT_EXTRACTION_MIME_INVALID", "mimeType is required");
  }
  if (request.input.byteLength <= 0 || request.input.byteLength > LOCAL_DOCUMENT_EXTRACTION_LIMITS.maximumInputBytes) {
    throw new LocalDocumentExtractionError(
      "DOCUMENT_EXTRACTION_INPUT_SIZE_INVALID",
      "Document extraction input size is outside governed limits",
    );
  }
  if (request.mode === "RICH" && !RICH_KINDS.has(request.artifactKind)) {
    throw new LocalDocumentExtractionError(
      "RICH_INPUT_UNSUPPORTED",
      `Artifact kind ${request.artifactKind} is not supported by rich extraction`,
    );
  }
  if (request.mode === "OCR" && !OCR_KINDS.has(request.artifactKind)) {
    throw new LocalDocumentExtractionError(
      "OCR_INPUT_UNSUPPORTED",
      `Artifact kind ${request.artifactKind} is not supported by OCR extraction`,
    );
  }
}

export class SubprocessDocumentExtractionRunner implements LocalDocumentExtractionRunner {
  private readonly pythonExecutable: string;
  private readonly scriptPath: string;
  private readonly cwd: string;
  private readonly maximumProtocolStdoutBytes: number;
  private readonly maximumProtocolStderrBytes: number;

  constructor(options: SubprocessDocumentExtractionRunnerOptions = {}) {
    this.pythonExecutable =
      options.pythonExecutable ?? process.env.MARKORBIT_DOCUMENT_EXTRACTION_PYTHON ?? "python3";
    this.scriptPath =
      options.scriptPath ??
      process.env.MARKORBIT_DOCUMENT_EXTRACTION_SCRIPT ??
      "workers/document_extraction/extract.py";
    this.cwd = options.cwd ?? process.env.MARKORBIT_REPOSITORY_ROOT ?? process.cwd();
    this.maximumProtocolStdoutBytes =
      options.maximumProtocolStdoutBytes ?? LOCAL_DOCUMENT_EXTRACTION_LIMITS.maximumProtocolStdoutBytes;
    this.maximumProtocolStderrBytes =
      options.maximumProtocolStderrBytes ?? LOCAL_DOCUMENT_EXTRACTION_LIMITS.maximumProtocolStderrBytes;
  }

  async extract(request: LocalDocumentExtractionRequest): Promise<LocalDocumentExtractionResult> {
    assertRequest(request);
    const maxOutputBytes = Math.min(
      request.maxOutputBytes ?? LOCAL_DOCUMENT_EXTRACTION_LIMITS.maximumOutputBodyBytes,
      LOCAL_DOCUMENT_EXTRACTION_LIMITS.maximumOutputBodyBytes,
    );
    const maxPages = Math.min(
      request.maxPages ?? LOCAL_DOCUMENT_EXTRACTION_LIMITS.maximumPages,
      LOCAL_DOCUMENT_EXTRACTION_LIMITS.maximumPages,
    );
    const timeoutSeconds = Math.min(
      request.timeoutSeconds ?? LOCAL_DOCUMENT_EXTRACTION_LIMITS.timeoutSeconds,
      LOCAL_DOCUMENT_EXTRACTION_LIMITS.timeoutSeconds,
    );
    if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0) {
      throw new LocalDocumentExtractionError("DOCUMENT_EXTRACTION_LIMIT_INVALID", "maxOutputBytes is invalid");
    }
    if (!Number.isSafeInteger(maxPages) || maxPages <= 0) {
      throw new LocalDocumentExtractionError("DOCUMENT_EXTRACTION_LIMIT_INVALID", "maxPages is invalid");
    }
    if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds <= 0) {
      throw new LocalDocumentExtractionError("DOCUMENT_EXTRACTION_LIMIT_INVALID", "timeoutSeconds is invalid");
    }

    const directory = await mkdtemp(join(tmpdir(), "markorbit-document-extraction-"));
    const inputPath = join(directory, "input.bin");
    const outputPath = join(directory, "output.md");
    try {
      await writeFile(inputPath, request.input, { flag: "wx" });
      const envelope = await this.runSubprocess(
        {
          protocolVersion: PROTOCOL_VERSION,
          inputPath,
          outputPath,
          artifactKind: request.artifactKind,
          mimeType: request.mimeType,
          languages: request.languages,
          mode: request.mode,
          maxOutputBytes,
          maxPages,
          timeoutSeconds,
        },
        timeoutSeconds * 1000 + 5000,
      );
      if (!envelope.ok) {
        throw new LocalDocumentExtractionError(
          envelope.error.code,
          envelope.error.message,
          envelope.error.retryable,
        );
      }
      if (envelope.outputFile !== "output.md") {
        throw new LocalDocumentExtractionError(
          "DOCUMENT_EXTRACTION_OUTPUT_SCOPE_INVALID",
          "Document extraction output file is outside the governed target",
          true,
        );
      }
      const outputReal = await realpath(outputPath);
      const directoryReal = await realpath(directory);
      const scoped = relative(directoryReal, outputReal);
      if (!scoped || scoped.startsWith("..") || resolve(directoryReal, scoped) !== outputReal) {
        throw new LocalDocumentExtractionError(
          "DOCUMENT_EXTRACTION_OUTPUT_SCOPE_INVALID",
          "Document extraction output escaped the governed temporary directory",
          true,
        );
      }
      const info = await stat(outputReal);
      if (!info.isFile() || info.size !== envelope.sizeBytes || info.size > maxOutputBytes) {
        throw new LocalDocumentExtractionError(
          "DOCUMENT_EXTRACTION_OUTPUT_EVIDENCE_MISMATCH",
          "Document extraction output size does not match protocol evidence",
          true,
        );
      }
      const body = new Uint8Array(await readFile(outputReal));
      if (sha256(body) !== envelope.sha256) {
        throw new LocalDocumentExtractionError(
          "DOCUMENT_EXTRACTION_OUTPUT_EVIDENCE_MISMATCH",
          "Document extraction output digest does not match protocol evidence",
          true,
        );
      }
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(body);
      } catch {
        throw new LocalDocumentExtractionError(
          "DOCUMENT_EXTRACTION_OUTPUT_UTF8_INVALID",
          "Extracted Markdown body is not valid UTF-8",
          true,
        );
      }
      if (!text.trim()) {
        throw new LocalDocumentExtractionError(
          "DOCUMENT_EXTRACTION_OUTPUT_EMPTY",
          "Extracted Markdown body is empty",
          true,
        );
      }
      if (text.startsWith("---\nmarkorbit:")) {
        throw new LocalDocumentExtractionError(
          "DOCUMENT_EXTRACTION_FRONTMATTER_FORBIDDEN",
          "Local extractor must not generate canonical MarkOrbit frontmatter",
        );
      }
      return {
        body,
        extractionMethod: envelope.extractionMethod,
        ...(envelope.pageCount === undefined ? {} : { pageCount: envelope.pageCount }),
      };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private async runSubprocess(request: Record<string, unknown>, timeoutMs: number): Promise<RunnerEnvelope> {
    return await new Promise<RunnerEnvelope>((resolvePromise, rejectPromise) => {
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
      let terminal: LocalDocumentExtractionError | null = null;

      const terminate = (error: LocalDocumentExtractionError) => {
        if (terminal) return;
        terminal = error;
        child.kill("SIGKILL");
      };
      const timeout = setTimeout(() => {
        terminate(
          new LocalDocumentExtractionError(
            "DOCUMENT_EXTRACTION_PROCESS_TIMEOUT",
            "Document extraction subprocess exceeded the governed timeout",
            true,
          ),
        );
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBytes += chunk.byteLength;
        if (stdoutBytes > this.maximumProtocolStdoutBytes) {
          terminate(
            new LocalDocumentExtractionError(
              "DOCUMENT_EXTRACTION_PROTOCOL_OUTPUT_TOO_LARGE",
              "Document extraction protocol output exceeded its bound",
            ),
          );
          return;
        }
        stdout.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (stderrBytes >= this.maximumProtocolStderrBytes) return;
        const bounded = chunk.subarray(0, this.maximumProtocolStderrBytes - stderrBytes);
        stderrBytes += bounded.byteLength;
        stderr.push(bounded);
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        rejectPromise(
          new LocalDocumentExtractionError(
            "DOCUMENT_EXTRACTION_RUNTIME_UNAVAILABLE",
            `Unable to start document extraction subprocess: ${error.message}`,
          ),
        );
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (terminal) {
          rejectPromise(terminal);
          return;
        }
        if (code !== 0) {
          const diagnostic = Buffer.concat(stderr).toString("utf8").trim().slice(0, 1000);
          rejectPromise(
            new LocalDocumentExtractionError(
              "DOCUMENT_EXTRACTION_PROCESS_FAILED",
              diagnostic
                ? `Document extraction subprocess exited with code ${code}: ${diagnostic}`
                : `Document extraction subprocess exited with code ${code}`,
              true,
            ),
          );
          return;
        }
        try {
          resolvePromise(parseEnvelope(Buffer.concat(stdout).toString("utf8").trim()));
        } catch (error) {
          rejectPromise(error);
        }
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end(JSON.stringify(request));
    });
  }
}

function modeForConverter(converter: RuntimeConverterRef): LocalDocumentExtractionMode | null {
  if (
    converter.converterId === PRODUCTION_RICH_DOCUMENT_MARKDOWN_CONVERTER.converterId &&
    converter.version === PRODUCTION_RICH_DOCUMENT_MARKDOWN_CONVERTER.version
  ) {
    return "RICH";
  }
  if (
    converter.converterId === PRODUCTION_OCR_MARKDOWN_CONVERTER.converterId &&
    converter.version === PRODUCTION_OCR_MARKDOWN_CONVERTER.version
  ) {
    return "OCR";
  }
  return null;
}

function assertExactBinding(context: ProductionMarkdownStagingContext): LocalDocumentExtractionMode {
  const mode = modeForConverter(context.converter);
  if (!mode || modeForConverter(context.lease.converter) !== mode) {
    throw new LocalDocumentExtractionError(
      "LOCAL_DOCUMENT_EXTRACTION_CONVERTER_IDENTITY_MISMATCH",
      "ConversionRun and lease are not bound to a supported local document extractor",
    );
  }
  const metadata = context.documentMetadata;
  if (
    metadata.workspaceId !== context.workspaceId ||
    metadata.sourceId !== context.sourceId ||
    metadata.rawArtifactId !== context.rawArtifactId ||
    metadata.conversionRunId !== context.conversionRunId ||
    metadata.converterId !== context.converter.converterId ||
    metadata.converterVersion !== context.converter.version ||
    metadata.inputSha256 !== context.inputGrant.expectedSha256
  ) {
    throw new LocalDocumentExtractionError(
      "LOCAL_DOCUMENT_EXTRACTION_CANONICAL_METADATA_MISMATCH",
      "Canonical metadata does not match local extraction control-plane evidence",
    );
  }
  if (
    context.lease.workspaceId !== context.workspaceId ||
    context.lease.workerId !== context.workerId ||
    context.lease.conversionRunId !== context.conversionRunId ||
    context.lease.conversionAttemptId !== context.conversionAttemptId ||
    context.inputGrant.workspaceId !== context.workspaceId ||
    context.inputGrant.workerId !== context.workerId ||
    context.inputGrant.conversionRunId !== context.conversionRunId ||
    context.inputGrant.conversionAttemptId !== context.conversionAttemptId ||
    context.inputGrant.rawArtifactId !== context.rawArtifactId ||
    context.outputGrant.workspaceId !== context.workspaceId ||
    context.outputGrant.workerId !== context.workerId ||
    context.outputGrant.conversionRunId !== context.conversionRunId ||
    context.outputGrant.conversionAttemptId !== context.conversionAttemptId
  ) {
    throw new LocalDocumentExtractionError(
      "LOCAL_DOCUMENT_EXTRACTION_GRANT_SCOPE_MISMATCH",
      "Local document extraction grants are outside the active conversion scope",
    );
  }
  if (context.lease.status !== "ACTIVE") {
    throw new LocalDocumentExtractionError(
      "LOCAL_DOCUMENT_EXTRACTION_LEASE_NOT_ACTIVE",
      "Local document extraction lease is not active",
    );
  }
  if (context.outputGrant.allowedMediaType !== "text/markdown") {
    throw new LocalDocumentExtractionError(
      "LOCAL_DOCUMENT_EXTRACTION_OUTPUT_MEDIA_TYPE_UNSUPPORTED",
      "Local document extraction output must be Markdown",
    );
  }
  if (mode === "RICH" && !RICH_KINDS.has(metadata.artifactKind)) {
    throw new LocalDocumentExtractionError(
      "RICH_INPUT_UNSUPPORTED",
      `Artifact kind ${metadata.artifactKind} is not supported by the rich extractor`,
    );
  }
  if (mode === "OCR" && !OCR_KINDS.has(metadata.artifactKind)) {
    throw new LocalDocumentExtractionError(
      "OCR_INPUT_UNSUPPORTED",
      `Artifact kind ${metadata.artifactKind} is not supported by the OCR extractor`,
    );
  }
  return mode;
}

function outputEvidence(
  context: ProductionMarkdownStagingContext,
  markdown: Uint8Array,
): ProductionStagingUploadEvidence {
  return {
    uploadGrantId: context.outputGrant.id,
    targetPath: context.outputGrant.normalizedTargetPath,
    sha256: sha256(markdown),
    sizeBytes: markdown.byteLength,
    mediaType: "text/markdown",
  };
}

function failure(error: unknown): { code: string; message: string; retryable: false } {
  if (error instanceof LocalDocumentExtractionError) {
    return {
      code: FAILURE_CODE.test(error.code) ? error.code : "LOCAL_DOCUMENT_EXTRACTION_FAILED",
      message: error.message.slice(0, 1000),
      retryable: false,
    };
  }
  const raw = error instanceof Error ? error.message : "LOCAL_DOCUMENT_EXTRACTION_FAILED";
  return {
    code: FAILURE_CODE.test(raw) ? raw : "LOCAL_DOCUMENT_EXTRACTION_FAILED",
    message: raw.slice(0, 1000),
    retryable: false,
  };
}

export class ProductionLocalDocumentExtractionExecutor {
  constructor(private readonly runner: LocalDocumentExtractionRunner = new SubprocessDocumentExtractionRunner()) {}

  async execute(
    context: ProductionMarkdownStagingContext,
    reader: ProductionRawArtifactReader,
    uploader: ProductionStagingUploader,
    client: ProductionConversionRuntimeClient,
  ): Promise<ProductionMarkdownStagingResult | null> {
    const prefix = `local-document-extraction-${context.lease.id}`;
    let outputReported = false;
    try {
      const mode = assertExactBinding(context);
      await client.started(context, `${prefix}-started`);
      await client.progress(
        context,
        { percent: 20, message: `Reading immutable ${context.documentMetadata.artifactKind} RawArtifact` },
        `${prefix}-read`,
      );
      const input = await reader.read(context.inputGrant);
      if (
        input.byteLength !== context.inputGrant.expectedBytes ||
        input.byteLength > LOCAL_DOCUMENT_EXTRACTION_LIMITS.maximumInputBytes ||
        sha256(input) !== context.inputGrant.expectedSha256
      ) {
        throw new LocalDocumentExtractionError(
          "LOCAL_DOCUMENT_EXTRACTION_INPUT_EVIDENCE_MISMATCH",
          "RawArtifact bytes do not match the conversion read grant",
        );
      }
      await client.progress(
        context,
        { percent: 45, message: mode === "OCR" ? "Running governed OCR extraction" : "Running governed rich document extraction" },
        `${prefix}-extract`,
      );
      const extracted = await this.runner.extract({
        artifactKind: context.documentMetadata.artifactKind,
        mimeType: context.inputGrant.expectedMime,
        languages: context.documentMetadata.languages,
        mode,
        input,
        maxOutputBytes: Math.min(
          LOCAL_DOCUMENT_EXTRACTION_LIMITS.maximumOutputBodyBytes,
          context.outputGrant.maximumBytes,
        ),
        maxPages: LOCAL_DOCUMENT_EXTRACTION_LIMITS.maximumPages,
        timeoutSeconds: LOCAL_DOCUMENT_EXTRACTION_LIMITS.timeoutSeconds,
      });
      const body = new TextDecoder("utf-8", { fatal: true }).decode(extracted.body);
      const canonical = new TextEncoder().encode(
        `${canonicalMarkdownFrontmatter(context.documentMetadata)}${body}${body.endsWith("\n") ? "" : "\n"}`,
      );
      const maximumOutput = Math.min(
        LOCAL_DOCUMENT_EXTRACTION_LIMITS.maximumCanonicalOutputBytes,
        context.outputGrant.maximumBytes,
      );
      if (canonical.byteLength > maximumOutput) {
        throw new LocalDocumentExtractionError(
          "LOCAL_DOCUMENT_EXTRACTION_CANONICAL_OUTPUT_TOO_LARGE",
          "Canonical Markdown exceeds the governed Staging output limit",
        );
      }
      const evidence = outputEvidence(context, canonical);
      await client.progress(
        context,
        {
          percent: 80,
          message: `Reporting ${extracted.extractionMethod} Canonical Markdown output evidence`,
        },
        `${prefix}-output-evidence`,
      );
      await client.outputReady(context, evidence, `${prefix}-output-ready`);
      outputReported = true;
      const commit = await uploader.upload(context, canonical, evidence, `${prefix}-staging-commit`);
      return { markdown: canonical, evidence, commit };
    } catch (error) {
      if (!outputReported) {
        await client.failed(context, failure(error), `${prefix}-failed`);
      }
      return null;
    }
  }
}
