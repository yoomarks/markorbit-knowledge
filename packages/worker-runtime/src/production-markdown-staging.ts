import { createHash } from "node:crypto";
import {
  type ConversionLease,
  type RawArtifactReadGrant,
  type RuntimeConverterRef,
  type StagingOutputUploadGrant,
  type StagingValidationOutcome,
} from "@markorbit/contracts";

export const PRODUCTION_MARKDOWN_STAGING_CONVERTER = {
  converterId: "builtin-markdown-staging",
  version: "1.0.0",
} as const satisfies RuntimeConverterRef;

export const PRODUCTION_MARKDOWN_STAGING_LIMITS = {
  maximumInputBytes: 4_500_000,
  maximumOutputBytes: 5_000_000,
} as const;

export type ProductionMarkdownStagingContext = {
  workspaceId: string;
  workerId: string;
  conversionRunId: string;
  conversionAttemptId: string;
  rawArtifactId: string;
  sourceId: string;
  lease: ConversionLease;
  converter: RuntimeConverterRef;
  inputGrant: RawArtifactReadGrant;
  outputGrant: StagingOutputUploadGrant;
};

export type ProductionStagingUploadEvidence = {
  uploadGrantId: string;
  targetPath: string;
  sha256: string;
  sizeBytes: number;
  mediaType: "text/markdown";
};

export type ProductionStagingCommitResult = {
  stagingDocumentId: string;
  stagingStatus: "READY" | "BLOCKED";
  verificationOutcome: StagingValidationOutcome;
  finalizationDecision: "COMPLETED" | "FAILED";
  readyPackageId?: string;
  coreIntakeReceiptId?: string;
};

export interface ProductionRawArtifactReader {
  read(grant: RawArtifactReadGrant): Promise<Uint8Array>;
}

export interface ProductionStagingUploader {
  upload(
    context: ProductionMarkdownStagingContext,
    content: Uint8Array,
    evidence: ProductionStagingUploadEvidence,
    idempotencyKey: string,
  ): Promise<ProductionStagingCommitResult>;
}

export interface ProductionConversionRuntimeClient {
  started(context: ProductionMarkdownStagingContext, idempotencyKey: string): Promise<void>;
  progress(
    context: ProductionMarkdownStagingContext,
    progress: { percent: number; message: string },
    idempotencyKey: string,
  ): Promise<void>;
  outputReady(
    context: ProductionMarkdownStagingContext,
    evidence: ProductionStagingUploadEvidence,
    idempotencyKey: string,
  ): Promise<void>;
  failed(
    context: ProductionMarkdownStagingContext,
    failure: { code: string; message: string; retryable: false },
    idempotencyKey: string,
  ): Promise<void>;
}

export type ProductionMarkdownStagingResult = {
  markdown: Uint8Array;
  evidence: ProductionStagingUploadEvidence;
  commit: ProductionStagingCommitResult;
};

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function quoted(value: string): string {
  return JSON.stringify(value);
}

function assertExactBinding(context: ProductionMarkdownStagingContext): void {
  const expected = PRODUCTION_MARKDOWN_STAGING_CONVERTER;
  if (
    context.converter.converterId !== expected.converterId ||
    context.converter.version !== expected.version ||
    context.lease.converter.converterId !== expected.converterId ||
    context.lease.converter.version !== expected.version
  ) {
    throw new Error("MARKDOWN_STAGING_CONVERTER_IDENTITY_MISMATCH");
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
    throw new Error("MARKDOWN_STAGING_GRANT_SCOPE_MISMATCH");
  }
  if (context.lease.status !== "ACTIVE") throw new Error("MARKDOWN_STAGING_LEASE_NOT_ACTIVE");
  if (context.inputGrant.expectedMime.toLowerCase() !== "text/markdown") {
    throw new Error("MARKDOWN_STAGING_INPUT_MIME_UNSUPPORTED");
  }
  if (context.outputGrant.allowedMediaType !== "text/markdown") {
    throw new Error("MARKDOWN_STAGING_OUTPUT_MEDIA_TYPE_UNSUPPORTED");
  }
}

function decodeUtf8(content: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true })
    .decode(content)
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
}

export function convertProductionMarkdownToStaging(
  context: ProductionMarkdownStagingContext,
  input: Uint8Array,
): Uint8Array {
  assertExactBinding(context);
  if (input.byteLength !== context.inputGrant.expectedBytes) {
    throw new Error("MARKDOWN_STAGING_INPUT_SIZE_MISMATCH");
  }
  if (input.byteLength > PRODUCTION_MARKDOWN_STAGING_LIMITS.maximumInputBytes) {
    throw new Error("MARKDOWN_STAGING_INPUT_TOO_LARGE");
  }
  if (sha256(input) !== context.inputGrant.expectedSha256) {
    throw new Error("MARKDOWN_STAGING_INPUT_DIGEST_MISMATCH");
  }

  const body = decodeUtf8(input);
  if (!body.trim()) throw new Error("MARKDOWN_STAGING_INPUT_EMPTY");
  const frontmatter = [
    "---",
    "markorbit:",
    `  workspaceId: ${quoted(context.workspaceId)}`,
    `  sourceId: ${quoted(context.sourceId)}`,
    `  rawArtifactId: ${quoted(context.rawArtifactId)}`,
    `  conversionRunId: ${quoted(context.conversionRunId)}`,
    `  converterId: ${quoted(PRODUCTION_MARKDOWN_STAGING_CONVERTER.converterId)}`,
    `  converterVersion: ${quoted(PRODUCTION_MARKDOWN_STAGING_CONVERTER.version)}`,
    `  inputSha256: ${quoted(context.inputGrant.expectedSha256)}`,
    "---",
    "",
  ].join("\n");
  const output = new TextEncoder().encode(
    `${frontmatter}${body}${body.endsWith("\n") ? "" : "\n"}`,
  );
  const maximumOutput = Math.min(
    PRODUCTION_MARKDOWN_STAGING_LIMITS.maximumOutputBytes,
    context.outputGrant.maximumBytes,
  );
  if (output.byteLength > maximumOutput) throw new Error("MARKDOWN_STAGING_OUTPUT_TOO_LARGE");
  return output;
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

function failureCode(error: unknown): string {
  const raw = error instanceof Error ? error.message : "MARKDOWN_STAGING_CONVERSION_FAILED";
  return /^[A-Z0-9][A-Z0-9_]{1,99}$/.test(raw)
    ? raw
    : "MARKDOWN_STAGING_CONVERSION_FAILED";
}

export class ProductionMarkdownStagingExecutor {
  async execute(
    context: ProductionMarkdownStagingContext,
    reader: ProductionRawArtifactReader,
    uploader: ProductionStagingUploader,
    client: ProductionConversionRuntimeClient,
  ): Promise<ProductionMarkdownStagingResult | null> {
    const prefix = `markdown-staging-${context.lease.id}`;
    let outputReported = false;
    try {
      assertExactBinding(context);
      await client.started(context, `${prefix}-started`);
      await client.progress(
        context,
        { percent: 25, message: "Reading immutable Markdown RawArtifact" },
        `${prefix}-read`,
      );
      const input = await reader.read(context.inputGrant);
      const markdown = convertProductionMarkdownToStaging(context, input);
      const evidence = outputEvidence(context, markdown);
      await client.progress(
        context,
        { percent: 75, message: "Reporting deterministic Markdown output evidence" },
        `${prefix}-output-evidence`,
      );
      await client.outputReady(context, evidence, `${prefix}-output-ready`);
      outputReported = true;
      const commit = await uploader.upload(
        context,
        markdown,
        evidence,
        `${prefix}-staging-commit`,
      );
      return { markdown, evidence, commit };
    } catch (error) {
      if (!outputReported) {
        await client.failed(
          context,
          {
            code: failureCode(error),
            message:
              error instanceof Error ? error.message : "Controlled Markdown staging conversion failed",
            retryable: false,
          },
          `${prefix}-failed`,
        );
      }
      return null;
    }
  }
}
