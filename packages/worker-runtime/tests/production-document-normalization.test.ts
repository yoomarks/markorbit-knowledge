import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PRODUCTION_HTML_MARKDOWN_CONVERTER,
  PRODUCTION_PDF_MARKDOWN_CONVERTER,
  ProductionDocumentNormalizationExecutor,
  convertProductionDocumentToStaging,
  normalizeHtmlToMarkdown,
  normalizePdfToMarkdown,
} from "../src/production-document-normalization";
import type {
  ProductionConversionRuntimeClient,
  ProductionMarkdownStagingContext,
  ProductionRawArtifactReader,
  ProductionStagingUploader,
} from "../src/production-markdown-staging";

const encoder = new TextEncoder();

function context(
  kind: "HTML" | "PDF",
  mime: string,
  input: Uint8Array,
): ProductionMarkdownStagingContext {
  const converter =
    kind === "HTML" ? PRODUCTION_HTML_MARKDOWN_CONVERTER : PRODUCTION_PDF_MARKDOWN_CONVERTER;
  const inputSha = createHash("sha256").update(input).digest("hex");
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
      documentId: "doc-uspto-normalized",
      workspaceId: "wsp_01H00000000000000000000000",
      sourceId: "src_01H00000000000000000000000",
      sourceName: "USPTO Guidance",
      sourceCategory: "OFFICIAL_GUIDANCE",
      authorityLevel: "PRIMARY_OFFICIAL",
      jurisdictions: ["US"],
      languages: ["en"],
      rawArtifactId: "art_01H00000000000000000000000",
      logicalDocumentId: "doc-uspto-normalized",
      artifactVersion: 1,
      artifactKind: kind,
      originalName: kind === "HTML" ? "guidance.html" : "guidance.pdf",
      canonicalUri: "https://www.uspto.gov/trademarks",
      sourceUri: "https://www.uspto.gov/trademarks",
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
      expectedMime: mime,
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
      normalizedTargetPath: "sources/uspto/guidance.md",
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

function textPdf(): Uint8Array {
  return encoder.encode(
    "%PDF-1.4\n1 0 obj\n<< /Length 54 >>\nstream\nBT\n/F1 12 Tf\n72 720 Td\n(USPTO Section 8 guidance) Tj\nET\nendstream\nendobj\n%%EOF\n",
  );
}

describe("M3.2 production document normalization", () => {
  it("normalizes HTML structure, links and entities without legal interpretation", () => {
    const html = encoder.encode(`
      <html><head><title>ignored</title><script>evil()</script></head><body>
      <h1>Maintenance &amp; renewal</h1>
      <p>Read the <a href="https://www.uspto.gov/trademarks/maintain">official guidance</a>.</p>
      <ul><li>Section 8</li><li>Section 9</li></ul>
      </body></html>
    `);
    const normalized = normalizeHtmlToMarkdown(html);
    expect(normalized).toContain("# Maintenance & renewal");
    expect(normalized).toContain("[official guidance](https://www.uspto.gov/trademarks/maintain)");
    expect(normalized).toContain("- Section 8");
    expect(normalized).not.toContain("evil()");

    const output = new TextDecoder().decode(
      convertProductionDocumentToStaging(context("HTML", "text/html", html), html),
    );
    expect(output).toContain('artifactKind: "HTML"');
    expect(output).toContain('converterId: "builtin-html-markdown"');
    expect(output).toContain("# Maintenance & renewal");
  });

  it("extracts a text-layer PDF into canonical Markdown", () => {
    const pdf = textPdf();
    expect(normalizePdfToMarkdown(pdf)).toContain("USPTO Section 8 guidance");
    const output = new TextDecoder().decode(
      convertProductionDocumentToStaging(context("PDF", "application/pdf", pdf), pdf),
    );
    expect(output).toContain('artifactKind: "PDF"');
    expect(output).toContain('converterId: "builtin-pdf-markdown"');
    expect(output).toContain("USPTO Section 8 guidance");
  });

  it("fails closed for scanned/non-text PDFs instead of inventing content", () => {
    const pdf = encoder.encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
    expect(() => normalizePdfToMarkdown(pdf)).toThrow("PDF_NORMALIZATION_NO_EXTRACTABLE_TEXT");
  });

  it("reports normalization evidence before committing verified Staging", async () => {
    const html = encoder.encode("<main><h1>USPTO</h1><p>Official guidance.</p></main>");
    const ctx = context("HTML", "text/html", html);
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
        return html;
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
        };
      },
    };
    const result = await new ProductionDocumentNormalizationExecutor().execute(
      ctx,
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
