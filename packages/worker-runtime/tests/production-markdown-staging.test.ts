import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PRODUCTION_MARKDOWN_STAGING_CONVERTER,
  ProductionMarkdownStagingExecutor,
  canonicalMarkdownFrontmatter,
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
    documentMetadata: {
      schemaVersion: "1.0",
      objectType: "CANONICAL_MARKDOWN_METADATA",
      documentId: "doc-uspto-trademarks",
      workspaceId: "wsp_01H00000000000000000000000",
      sourceId: "src_01H00000000000000000000000",
      sourceName: "USPTO Trademarks",
      sourceCategory: "OFFICIAL_GUIDANCE",
      authorityLevel: "PRIMARY_OFFICIAL",
      jurisdictions: ["US"],
      languages: ["en"],
      rawArtifactId: "art_01H00000000000000000000000",
      logicalDocumentId: "doc-uspto-trademarks",
      artifactVersion: 3,
      artifactKind: "MARKDOWN",
      originalName: "trademarks.md",
      canonicalUri: "https://www.uspto.gov/trademarks",
      sourceUri: "https://www.uspto.gov/trademarks",
      capturedAt: "2026-08-08T00:00:00.000Z",
      publishedAt: null,
      conversionRunId: "cvr_01H00000000000000000000000",
      converterId: PRODUCTION_MARKDOWN_STAGING_CONVERTER.converterId,
      converterVersion: PRODUCTION_MARKDOWN_STAGING_CONVERTER.version,
      inputSha256: inputSha,
    },
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
  it("produces deterministic canonical verifier-compatible frontmatter", () => {
    const first = convertProductionMarkdownToStaging(context(), input);
    const second = convertProductionMarkdownToStaging(context(), input);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    const markdown = new TextDecoder().decode(first);
    expect(markdown).toContain('objectType: "CANONICAL_MARKDOWN_METADATA"');
    expect(markdown).toContain('documentId: "doc-uspto-trademarks"');
    expect(markdown).toContain('sourceName: "USPTO Trademarks"');
    expect(markdown).toContain('authorityLevel: "PRIMARY_OFFICIAL"');
    expect(markdown).toContain('jurisdictions: ["US"]');
    expect(markdown).toContain('canonicalUri: "https://www.uspto.gov/trademarks"');
    expect(markdown).toContain('converterId: "builtin-markdown-staging"');
    expect(markdown).toContain(`inputSha256: "${inputSha}"`);
    expect(markdown).toContain("# USPTO Trademarks\n\nOfficial guidance.\n");
    expect(markdown).not.toContain("\r");
    expect(markdown.startsWith(canonicalMarkdownFrontmatter(context().documentMetadata))).toBe(
      true,
    );
  });

  it("preserves non-reserved leading frontmatter inside canonical staging frontmatter", () => {
    const source = new TextEncoder().encode(
      '---\nknowledge_id: "obj-1"\nclassification: "INTERNAL"\n---\n\n# Relationship Note\n\nBody.\n',
    );
    const sourceSha = createHash("sha256").update(source).digest("hex");
    const mergedContext = context();
    mergedContext.inputGrant.expectedBytes = source.byteLength;
    mergedContext.inputGrant.expectedSha256 = sourceSha;
    mergedContext.documentMetadata.inputSha256 = sourceSha;

    const markdown = new TextDecoder().decode(
      convertProductionMarkdownToStaging(mergedContext, source),
    );
    expect(markdown).toContain(`  inputSha256: "${sourceSha}"\nknowledge_id: "obj-1"`);
    expect(markdown).toContain('classification: "INTERNAL"\n---\n\n# Relationship Note');
    expect(markdown.match(/^---$/gm)).toHaveLength(2);
    expect(markdown).not.toContain("\n---\n\n---\n");
  });

  it("rejects MIME, size, digest, metadata and exact Converter mismatches", () => {
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
      "MARKDOWN_STAGING_CANONICAL_METADATA_MISMATCH",
    );

    const wrongMetadata = context();
    wrongMetadata.documentMetadata.sourceId = "src_01H11111111111111111111111";
    expect(() => convertProductionMarkdownToStaging(wrongMetadata, input)).toThrow(
      "MARKDOWN_STAGING_CANONICAL_METADATA_MISMATCH",
    );

    const wrongConverter = context();
    wrongConverter.converter = { converterId: "other", version: "1.0.0" };
    expect(() => convertProductionMarkdownToStaging(wrongConverter, input)).toThrow(
      "MARKDOWN_STAGING_CONVERTER_IDENTITY_MISMATCH",
    );
  });

  it("reports output evidence before the control plane commits Staging", async () => {
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
    const reader: ProductionRawArtifactReader = {
      async read() {
        return input;
      },
    };
    const uploader: ProductionStagingUploader = {
      async upload(_context, markdown, evidence) {
        calls.push("staging-commit");
        expect(evidence.sha256).toBe(createHash("sha256").update(markdown).digest("hex"));
        return {
          stagingDocumentId: "std_01H00000000000000000000000",
          stagingStatus: "READY",
          verificationOutcome: "PASS",
          finalizationDecision: "COMPLETED",
          readyPackageId: "rdp_01H00000000000000000000000",
        };
      },
    };
    const result = await new ProductionMarkdownStagingExecutor().execute(
      context(),
      reader,
      uploader,
      client,
    );
    expect(result?.commit.finalizationDecision).toBe("COMPLETED");
    expect(calls).toEqual([
      "started",
      "progress:25",
      "progress:75",
      "output-ready",
      "staging-commit",
    ]);
  });
});
