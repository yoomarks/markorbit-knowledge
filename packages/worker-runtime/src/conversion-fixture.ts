import { createHash } from "node:crypto";
import {
  type ConversionLease,
  type RawArtifactReadGrant,
  type RuntimeConverterRef,
  type StagingOutputUploadGrant,
} from "@markorbit/contracts";

export const FIXTURE_TEXT_MARKDOWN_CONVERTER = {
  converterId: "builtin-text-markdown",
  version: "1.0.0",
} as const satisfies RuntimeConverterRef;

export const FIXTURE_TEXT_MARKDOWN_LIMITS = {
  maximumInputBytes: 1_000_000,
  maximumOutputBytes: 1_250_000,
} as const;

export type FixtureConversionContext = {
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

export type FixtureUploadEvidence = {
  uploadGrantId: string;
  targetPath: string;
  sha256: string;
  sizeBytes: number;
  mediaType: "text/markdown";
};

export interface FixtureRawArtifactReader {
  read(grant: RawArtifactReadGrant): Promise<Uint8Array>;
}

export interface FixtureStagingUploader {
  upload(grant: StagingOutputUploadGrant, content: Uint8Array): Promise<FixtureUploadEvidence>;
}

export interface FixtureConversionRuntimeClient {
  started(context: FixtureConversionContext, idempotencyKey: string): Promise<void>;
  progress(
    context: FixtureConversionContext,
    progress: { percent: number; message: string },
    idempotencyKey: string,
  ): Promise<void>;
  outputReady(
    context: FixtureConversionContext,
    evidence: FixtureUploadEvidence,
    idempotencyKey: string,
  ): Promise<void>;
  failed(
    context: FixtureConversionContext,
    failure: { code: string; message: string; retryable: false },
    idempotencyKey: string,
  ): Promise<void>;
}

export type FixtureConversionResult = {
  markdown: Uint8Array;
  evidence: FixtureUploadEvidence;
};

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function assertExactBinding(context: FixtureConversionContext): void {
  const expected = FIXTURE_TEXT_MARKDOWN_CONVERTER;
  if (
    context.converter.converterId !== expected.converterId ||
    context.converter.version !== expected.version ||
    context.lease.converter.converterId !== expected.converterId ||
    context.lease.converter.version !== expected.version
  ) {
    throw new Error("FIXTURE_CONVERTER_IDENTITY_MISMATCH");
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
    throw new Error("FIXTURE_GRANT_SCOPE_MISMATCH");
  }
  if (context.lease.status !== "ACTIVE") throw new Error("FIXTURE_LEASE_NOT_ACTIVE");
  if (context.inputGrant.expectedMime !== "text/plain") {
    throw new Error("FIXTURE_INPUT_MIME_UNSUPPORTED");
  }
  if (context.outputGrant.allowedMediaType !== "text/markdown") {
    throw new Error("FIXTURE_OUTPUT_MEDIA_TYPE_UNSUPPORTED");
  }
}

function decodeUtf8(content: Uint8Array): string {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return decoder
    .decode(content)
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
}

function quoted(value: string): string {
  return JSON.stringify(value);
}

export function convertFixtureTextToMarkdown(
  context: FixtureConversionContext,
  input: Uint8Array,
): Uint8Array {
  assertExactBinding(context);
  if (input.byteLength !== context.inputGrant.expectedBytes) {
    throw new Error("FIXTURE_INPUT_SIZE_MISMATCH");
  }
  if (input.byteLength > FIXTURE_TEXT_MARKDOWN_LIMITS.maximumInputBytes) {
    throw new Error("FIXTURE_INPUT_TOO_LARGE");
  }
  if (sha256(input) !== context.inputGrant.expectedSha256) {
    throw new Error("FIXTURE_INPUT_DIGEST_MISMATCH");
  }

  const body = decodeUtf8(input);
  const frontmatter = [
    "---",
    "markorbit:",
    `  workspaceId: ${quoted(context.workspaceId)}`,
    `  sourceId: ${quoted(context.sourceId)}`,
    `  rawArtifactId: ${quoted(context.rawArtifactId)}`,
    `  conversionRunId: ${quoted(context.conversionRunId)}`,
    `  conversionAttemptId: ${quoted(context.conversionAttemptId)}`,
    `  converterId: ${quoted(FIXTURE_TEXT_MARKDOWN_CONVERTER.converterId)}`,
    `  converterVersion: ${quoted(FIXTURE_TEXT_MARKDOWN_CONVERTER.version)}`,
    `  inputSha256: ${quoted(context.inputGrant.expectedSha256)}`,
    "---",
    "",
  ].join("\n");
  const markdownText = `${frontmatter}${body}${body.endsWith("\n") ? "" : "\n"}`;
  const output = new TextEncoder().encode(markdownText);
  const maximumOutput = Math.min(
    FIXTURE_TEXT_MARKDOWN_LIMITS.maximumOutputBytes,
    context.outputGrant.maximumBytes,
  );
  if (output.byteLength > maximumOutput) throw new Error("FIXTURE_OUTPUT_TOO_LARGE");
  return output;
}

export class FixtureTextMarkdownExecutor {
  async execute(
    context: FixtureConversionContext,
    reader: FixtureRawArtifactReader,
    uploader: FixtureStagingUploader,
    client: FixtureConversionRuntimeClient,
  ): Promise<FixtureConversionResult | null> {
    const prefix = `fixture-${context.lease.id}`;
    try {
      assertExactBinding(context);
      await client.started(context, `${prefix}-started`);
      await client.progress(
        context,
        { percent: 25, message: "Reading bounded text input" },
        `${prefix}-read`,
      );
      const input = await reader.read(context.inputGrant);
      const markdown = convertFixtureTextToMarkdown(context, input);
      await client.progress(
        context,
        { percent: 75, message: "Uploading deterministic Markdown output" },
        `${prefix}-upload`,
      );
      const evidence = await uploader.upload(context.outputGrant, markdown);
      if (
        evidence.uploadGrantId !== context.outputGrant.id ||
        evidence.targetPath !== context.outputGrant.normalizedTargetPath ||
        evidence.mediaType !== "text/markdown" ||
        evidence.sizeBytes !== markdown.byteLength ||
        evidence.sha256 !== sha256(markdown)
      ) {
        throw new Error("FIXTURE_UPLOAD_EVIDENCE_MISMATCH");
      }
      await client.outputReady(context, evidence, `${prefix}-output-ready`);
      return { markdown, evidence };
    } catch (error) {
      const code = error instanceof Error ? error.message : "FIXTURE_CONVERSION_FAILED";
      await client.failed(
        context,
        { code, message: "Controlled fixture conversion failed.", retryable: false },
        `${prefix}-failed`,
      );
      return null;
    }
  }
}
