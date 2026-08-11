import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRODUCTION_PDF_TEXT_MARKDOWN_CONVERTER,
  PRODUCTION_RICH_DOCUMENT_MARKDOWN_CONVERTER,
  ProductionLocalDocumentExtractionExecutor,
  SubprocessDocumentExtractionRunner,
  type LocalDocumentExtractionRunner,
} from "../src/local-document-extraction";
import type {
  ProductionConversionRuntimeClient,
  ProductionMarkdownStagingContext,
  ProductionRawArtifactReader,
  ProductionStagingUploader,
} from "../src/production-markdown-staging";

const encoder = new TextEncoder();

function richContext(input: Uint8Array): ProductionMarkdownStagingContext {
  const inputSha = createHash("sha256").update(input).digest("hex");
  const converter = PRODUCTION_RICH_DOCUMENT_MARKDOWN_CONVERTER;
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
      documentId: "doc-uspto-rich",
      workspaceId: "wsp_01H00000000000000000000000",
      sourceId: "src_01H00000000000000000000000",
      sourceName: "USPTO Rich Attachment",
      sourceCategory: "OFFICIAL_GUIDANCE",
      authorityLevel: "PRIMARY_OFFICIAL",
      jurisdictions: ["US"],
      languages: ["en"],
      rawArtifactId: "art_01H00000000000000000000000",
      logicalDocumentId: "doc-uspto-rich",
      artifactVersion: 1,
      artifactKind: "TEXT",
      originalName: "notice.txt",
      canonicalUri: "https://www.uspto.gov/example.txt",
      sourceUri: "https://www.uspto.gov/example.txt",
      capturedAt: "2026-08-09T00:00:00.000Z",
      publishedAt: null,
      conversionRunId: "cvr_01H00000000000000000000000",
      converterId: converter.converterId,
      converterVersion: converter.version,
      inputSha256: inputSha,
    },
    converter,
    lease: {
      contractVersion: "1.0",
      objectType: "CONVERSION_LEASE",
      id: "cvl_01H00000000000000000000000",
      workspaceId: "wsp_01H00000000000000000000000",
      conversionRunId: "cvr_01H00000000000000000000000",
      workerId: "wrk_01H00000000000000000000000",
      conversionAttemptId: "cva_01H00000000000000000000000",
      converter,
      generation: 1,
      tokenReference: "lease-reference",
      tokenDigest: "a".repeat(64),
      status: "ACTIVE",
      issuedAt: "2026-08-09T00:00:00.000Z",
      expiresAt: "2026-08-09T00:10:00.000Z",
      renewableUntil: "2026-08-09T01:00:00.000Z",
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
      accessRef: "artifact-read",
      issuedAt: "2026-08-09T00:00:00.000Z",
      expiresAt: "2026-08-09T00:10:00.000Z",
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
      normalizedTargetPath: "sources/uspto/notice.md",
      allowedMediaType: "text/markdown",
      maximumBytes: 5_000_000,
      requiredDigestAlgorithm: "SHA-256",
      uploadSessionRef: "staging-upload",
      issuedAt: "2026-08-09T00:00:00.000Z",
      expiresAt: "2026-08-09T00:10:00.000Z",
      tokenReference: "upload-reference",
      tokenDigest: "c".repeat(64),
      allowedContentCount: 1,
      expectedProvenancePolicy: "CONVERSION_ATTEMPT_BOUND",
    },
  };
}

describe("M3.5 local document extraction", () => {
  it("runs the governed Python rich extractor and returns body-only Markdown", async () => {
    const repositoryRoot = resolve(process.cwd(), "../..");
    const runner = new SubprocessDocumentExtractionRunner({
      cwd: repositoryRoot,
      scriptPath: "workers/document_extraction/extract.py",
      pythonExecutable: process.env.PYTHON ?? "python3",
    });
    const result = await runner.extract({
      artifactKind: "TEXT",
      mimeType: "text/plain",
      languages: ["en"],
      mode: "RICH",
      input: encoder.encode("Official source attachment"),
      maxOutputBytes: 1000,
      maxPages: 10,
      timeoutSeconds: 10,
    });
    expect(new TextDecoder().decode(result.body)).toBe("Official source attachment\n");
    expect(result.extractionMethod).toBe("TEXT_DECODER");
  });

  it("adds canonical provenance after extraction and reports evidence before upload", async () => {
    const input = encoder.encode("raw attachment bytes");
    const ctx = richContext(input);
    const calls: string[] = [];
    const runner: LocalDocumentExtractionRunner = {
      async extract(request) {
        expect(request.mode).toBe("RICH");
        expect(request.artifactKind).toBe("TEXT");
        return {
          body: encoder.encode("# Extracted attachment\n\nOfficial filing notice.\n"),
          extractionMethod: "TEST_EXTRACTOR",
        };
      },
    };
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
        const text = new TextDecoder().decode(markdown);
        expect(text).toContain('converterId: "local-rich-document-markdown"');
        expect(text).toContain('artifactKind: "TEXT"');
        expect(text).toContain("# Extracted attachment");
        expect(evidence.sha256).toBe(createHash("sha256").update(markdown).digest("hex"));
        return {
          stagingDocumentId: "std_01H00000000000000000000000",
          stagingStatus: "READY",
          verificationOutcome: "PASS",
          finalizationDecision: "COMPLETED",
        };
      },
    };

    const result = await new ProductionLocalDocumentExtractionExecutor(runner).execute(
      ctx,
      reader,
      uploader,
      client,
    );
    expect(result?.commit.finalizationDecision).toBe("COMPLETED");
    expect(calls).toEqual([
      "started",
      "progress:20",
      "progress:45",
      "progress:80",
      "output-ready",
      "staging-commit",
    ]);
  });

  it("binds the opt-in Poppler PDF text provider to PDF_TEXT mode", async () => {
    const input = encoder.encode("%PDF-1.7 synthetic bytes");
    const ctx = richContext(input);
    const converter = PRODUCTION_PDF_TEXT_MARKDOWN_CONVERTER;
    ctx.converter = converter;
    ctx.lease.converter = converter;
    ctx.documentMetadata.converterId = converter.converterId;
    ctx.documentMetadata.converterVersion = converter.version;
    ctx.documentMetadata.artifactKind = "PDF";
    ctx.documentMetadata.originalName = "guide.pdf";
    ctx.inputGrant.expectedMime = "application/pdf";

    const runner: LocalDocumentExtractionRunner = {
      async extract(request) {
        expect(request.mode).toBe("PDF_TEXT");
        expect(request.artifactKind).toBe("PDF");
        return {
          body: encoder.encode("# PDF text\n\nOfficial text layer.\n"),
          extractionMethod: "PDFTOTEXT_TEXT_LAYER",
          pageCount: 2,
        };
      },
    };
    const client: ProductionConversionRuntimeClient = {
      async started() {},
      async progress() {},
      async outputReady() {},
      async failed() {
        throw new Error("unexpected failure");
      },
    };
    const reader: ProductionRawArtifactReader = {
      async read() {
        return input;
      },
    };
    const uploader: ProductionStagingUploader = {
      async upload(_context, markdown) {
        expect(new TextDecoder().decode(markdown)).toContain(
          'converterId: "local-pdf-text-markdown"',
        );
        return {
          stagingDocumentId: "std_01H00000000000000000000000",
          stagingStatus: "READY",
          verificationOutcome: "PASS",
          finalizationDecision: "COMPLETED",
        };
      },
    };

    const result = await new ProductionLocalDocumentExtractionExecutor(runner).execute(
      ctx,
      reader,
      uploader,
      client,
    );
    expect(result?.commit.finalizationDecision).toBe("COMPLETED");
  });

  it("fails closed when extractor attempts to inject canonical frontmatter", async () => {
    const runner = new SubprocessDocumentExtractionRunner({
      pythonExecutable: "missing-python-for-test",
    });
    await expect(
      runner.extract({
        artifactKind: "IMAGE",
        mimeType: "image/png",
        languages: ["en"],
        mode: "RICH",
        input: encoder.encode("x"),
      }),
    ).rejects.toMatchObject({ code: "RICH_INPUT_UNSUPPORTED" });
  });
});
