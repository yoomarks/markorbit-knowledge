import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  FIXTURE_TEXT_MARKDOWN_CONVERTER,
  FixtureTextMarkdownExecutor,
  convertFixtureTextToMarkdown,
  type FixtureConversionContext,
  type FixtureConversionRuntimeClient,
  type FixtureRawArtifactReader,
  type FixtureStagingUploader,
} from "../src/conversion-fixture";

const input = new TextEncoder().encode("Hello\r\nWorld");
const inputSha = createHash("sha256").update(input).digest("hex");

function context(): FixtureConversionContext {
  return {
    workspaceId: "wsp_01H00000000000000000000000",
    workerId: "wrk_01H00000000000000000000000",
    conversionRunId: "cvr_01H00000000000000000000000",
    conversionAttemptId: "cva_01H00000000000000000000000",
    rawArtifactId: "art_01H00000000000000000000000",
    sourceId: "src_01H00000000000000000000000",
    converter: FIXTURE_TEXT_MARKDOWN_CONVERTER,
    lease: {
      contractVersion: "1.0",
      objectType: "CONVERSION_LEASE",
      id: "cvl_01H00000000000000000000000",
      workspaceId: "wsp_01H00000000000000000000000",
      conversionRunId: "cvr_01H00000000000000000000000",
      workerId: "wrk_01H00000000000000000000000",
      conversionAttemptId: "cva_01H00000000000000000000000",
      converter: FIXTURE_TEXT_MARKDOWN_CONVERTER,
      generation: 1,
      tokenReference: "tok-reference",
      tokenDigest: "a".repeat(64),
      status: "ACTIVE",
      issuedAt: "2026-07-18T00:00:00.000Z",
      expiresAt: "2026-07-18T00:10:00.000Z",
      renewableUntil: "2026-07-18T01:00:00.000Z",
    },
    inputGrant: {
      contractVersion: "1.0",
      objectType: "RAW_ARTIFACT_READ_GRANT",
      id: "rag_01H00000000000000000000000",
      workspaceId: "wsp_01H00000000000000000000000",
      rawArtifactId: "art_01H00000000000000000000000",
      conversionRunId: "cvr_01H00000000000000000000000",
      conversionAttemptId: "cva_01H00000000000000000000000",
      workerId: "wrk_01H00000000000000000000000",
      expectedSha256: inputSha,
      expectedBytes: input.byteLength,
      expectedMime: "text/plain",
      accessRef: "fixture-input",
      issuedAt: "2026-07-18T00:00:00.000Z",
      expiresAt: "2026-07-18T00:10:00.000Z",
      maximumReads: 1,
      readsUsed: 0,
      usagePolicy: "CONVERSION_INPUT_ONLY",
      tokenReference: "read-reference",
      tokenDigest: "b".repeat(64),
    },
    outputGrant: {
      contractVersion: "1.0",
      objectType: "STAGING_OUTPUT_UPLOAD_GRANT",
      id: "sug_01H00000000000000000000000",
      workspaceId: "wsp_01H00000000000000000000000",
      conversionRunId: "cvr_01H00000000000000000000000",
      conversionAttemptId: "cva_01H00000000000000000000000",
      workerId: "wrk_01H00000000000000000000000",
      normalizedTargetPath: "sources/example.md",
      allowedMediaType: "text/markdown",
      maximumBytes: 100_000,
      requiredDigestAlgorithm: "SHA-256",
      uploadSessionRef: "fixture-upload",
      issuedAt: "2026-07-18T00:00:00.000Z",
      expiresAt: "2026-07-18T00:10:00.000Z",
      tokenReference: "upload-reference",
      tokenDigest: "c".repeat(64),
      allowedContentCount: 1,
      expectedProvenancePolicy: "CONVERSION_ATTEMPT_BOUND",
    },
  };
}

describe("controlled text-to-Markdown fixture runtime", () => {
  it("produces deterministic Markdown with frozen provenance", () => {
    const first = convertFixtureTextToMarkdown(context(), input);
    const second = convertFixtureTextToMarkdown(context(), input);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    const markdown = new TextDecoder().decode(first);
    expect(markdown).toContain('converterId: "builtin-text-markdown"');
    expect(markdown).toContain('converterVersion: "1.0.0"');
    expect(markdown).toContain("Hello\nWorld\n");
    expect(markdown).not.toContain("\r");
  });

  it("rejects digest, size, MIME and exact Converter mismatches", () => {
    const wrongDigest = context();
    wrongDigest.inputGrant.expectedSha256 = "d".repeat(64);
    expect(() => convertFixtureTextToMarkdown(wrongDigest, input)).toThrow(
      "FIXTURE_INPUT_DIGEST_MISMATCH",
    );

    const wrongSize = context();
    wrongSize.inputGrant.expectedBytes += 1;
    expect(() => convertFixtureTextToMarkdown(wrongSize, input)).toThrow(
      "FIXTURE_INPUT_SIZE_MISMATCH",
    );

    const wrongMime = context();
    wrongMime.inputGrant.expectedMime = "text/html";
    expect(() => convertFixtureTextToMarkdown(wrongMime, input)).toThrow(
      "FIXTURE_INPUT_MIME_UNSUPPORTED",
    );

    const wrongConverter = context();
    wrongConverter.converter = { converterId: "other", version: "1.0.0" };
    expect(() => convertFixtureTextToMarkdown(wrongConverter, input)).toThrow(
      "FIXTURE_CONVERTER_IDENTITY_MISMATCH",
    );
  });

  it("reports STARTED/progress/output-ready without self-completing", async () => {
    const calls: string[] = [];
    const client: FixtureConversionRuntimeClient = {
      async started() {
        calls.push("started");
      },
      async progress(_context, progress) {
        calls.push(`progress:${progress.percent}`);
      },
      async outputReady() {
        calls.push("output-ready");
      },
      async failed() {
        calls.push("failed");
      },
    };
    const reader: FixtureRawArtifactReader = {
      async read() {
        return input;
      },
    };
    const uploader: FixtureStagingUploader = {
      async upload(grant, markdown) {
        return {
          uploadGrantId: grant.id,
          targetPath: grant.normalizedTargetPath,
          sha256: createHash("sha256").update(markdown).digest("hex"),
          sizeBytes: markdown.byteLength,
          mediaType: "text/markdown",
        };
      },
    };

    const result = await new FixtureTextMarkdownExecutor().execute(
      context(),
      reader,
      uploader,
      client,
    );
    expect(result).not.toBeNull();
    expect(calls).toEqual(["started", "progress:25", "progress:75", "output-ready"]);
    expect(calls).not.toContain("completed");
  });

  it("converts controlled failures into a non-retryable failed report", async () => {
    const calls: string[] = [];
    const client: FixtureConversionRuntimeClient = {
      async started() {
        calls.push("started");
      },
      async progress() {
        calls.push("progress");
      },
      async outputReady() {
        calls.push("output-ready");
      },
      async failed(_context, failure) {
        calls.push(`failed:${failure.code}:${failure.retryable}`);
      },
    };
    const reader: FixtureRawArtifactReader = {
      async read() {
        return new TextEncoder().encode("tampered");
      },
    };
    const uploader: FixtureStagingUploader = {
      async upload() {
        throw new Error("should-not-upload");
      },
    };

    const result = await new FixtureTextMarkdownExecutor().execute(
      context(),
      reader,
      uploader,
      client,
    );
    expect(result).toBeNull();
    expect(calls.at(-1)).toBe("failed:FIXTURE_INPUT_SIZE_MISMATCH:false");
  });
});
