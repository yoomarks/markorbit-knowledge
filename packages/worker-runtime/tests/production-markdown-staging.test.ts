import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PRODUCTION_MARKDOWN_STAGING_CONVERTER,
  ProductionMarkdownStagingExecutor,
  convertProductionMarkdownToStaging,
  type ProductionConversionRuntimeClient,
  type ProductionMarkdownStagingContext,
  type ProductionRawArtifactReader,
  type ProductionStagingUploader,
} from "../src/production-markdown-staging";

const input = new TextEncoder().encode("# USPTO Trademarks\r\n\r\nOfficial guidance.\r\n");
const inputSha = createHash("sha256").update(input).digest("hex");

function context(): ProductionMarkdownStagingContext {
  return {
    workspaceId: "wsp_01H00000000000000000000000",
    workerId: "wrk_01H00000000000000000000000",
    conversionRunId: "cvr_01H00000000000000000000000",
    conversionAttemptId: "cva_01H00000000000000000000000",
    rawArtifactId: "art_01H00000000000000000000000",
    sourceId: "src_01H00000000000000000000000",
    converter: PRODUCTION_MARKDOWN_STAGING_CONVERTER,
    lease: {
      contractVersion: "1.0",
      objectType: "CONVERSION_LEASE",
      id: "cvl_01H00000000000000000000000",
      workspaceId: "wsp_01H00000000000000000000000",
      conversionRunId: "cvr_01H00000000000000000000000",
      workerId: "wrk_01H00000000000000000000000",
      conversionAttemptId: "cva_01H00000000000000000000000",
      converter: PRODUCTION_MARKDOWN_STAGING_CONVERTER,
      generation: 1,
      tokenReference: "lease-reference",
      tokenDigest: "a".repeat(64),
      status: "ACTIVE",
      issuedAt: "2026-08-08T00:00:00.000Z",
      expiresAt: "2026-08-08T00:10:00.000Z",
      renewableUntil: "2026-08-08T01:00:00.000Z",
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
      expectedMime: "text/markdown",
      accessRef: "artifact-read",
      issuedAt: "2026-08-08T00:00:00.000Z",
      expiresAt: "2026-08-08T00:10:00.000Z",
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
      normalizedTargetPath: "sources/uspto/trademarks.md",
      allowedMediaType: "text/markdown",
      maximumBytes: 5_000_000,
      requiredDigestAlgorithm: "SHA-256",
      uploadSessionRef: "staging-upload",
      issuedAt: "2026-08-08T00:00:00.000Z",
      expiresAt: "2026-08-08T00:10:00.000Z",
      tokenReference: "upload-reference",
      tokenDigest: "c".repeat(64),
      allowedContentCount: 1,
      expectedProvenancePolicy: "CONVERSION_ATTEMPT_BOUND",
    },
  };
}

describe("production Markdown staging converter", () => {
  it("produces deterministic verifier-compatible provenance frontmatter", () => {
    const first = convertProductionMarkdownToStaging(context(), input);
    const second = convertProductionMarkdownToStaging(context(), input);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    const markdown = new TextDecoder().decode(first);
    expect(markdown).toContain('converterId: "builtin-markdown-staging"');
    expect(markdown).toContain(`inputSha256: "${inputSha}"`);
    expect(markdown).toContain("# USPTO Trademarks\n\nOfficial guidance.\n");
    expect(markdown).not.toContain("\r");
  });

  it("rejects MIME, size, digest and exact Converter mismatches", () => {
    const wrongMime = context();
    wrongMime.inputGrant.expectedMime = "text/html";
    expect(() => convertProductionMarkdownToStaging(wrongMime, input)).toThrow(
      "MARKDOWN_STAGING_INPUT_MIME_UNSUPPORTED",
    );

    const wrongSize = context();
    wrongSize.inputGrant.expectedBytes += 1;
    expect(() => convertProductionMarkdownToStaging(wrongSize, input)).toThrow(
      "MARKDOWN_STAGING_INPUT_SIZE_MISMATCH",
    );

    const wrongDigest = context();
    wrongDigest.inputGrant.expectedSha256 = "d".repeat(64);
    expect(() => convertProductionMarkdownToStaging(wrongDigest, input)).toThrow(
      "MARKDOWN_STAGING_INPUT_DIGEST_MISMATCH",
    );

    const wrongConverter = context();
    wrongConverter.converter = { converterId: "other", version: "1.0.0" };
    expect(() => convertProductionMarkdownToStaging(wrongConverter, input)).toThrow(
      "MARKDOWN_STAGING_CONVERTER_IDENTITY_MISMATCH",
    );
  });

  it("uses Runtime reports and never self-completes verification", async () => {
    const calls: string[] = [];
    const client: ProductionConversionRuntimeClient = {
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
    const reader: ProductionRawArtifactReader = { async read() { return input; } };
    const uploader: ProductionStagingUploader = {
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
    const result = await new ProductionMarkdownStagingExecutor().execute(
      context(), reader, uploader, client,
    );
    expect(result).not.toBeNull();
    expect(calls).toEqual(["started", "progress:25", "progress:75", "output-ready"]);
  });
});
