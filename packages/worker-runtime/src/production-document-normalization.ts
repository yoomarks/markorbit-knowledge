import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import type { RuntimeConverterRef } from "@markorbit/contracts";
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

export const PRODUCTION_HTML_MARKDOWN_CONVERTER = {
  converterId: "builtin-html-markdown",
  version: "1.0.0",
} as const satisfies RuntimeConverterRef;

export const PRODUCTION_PDF_MARKDOWN_CONVERTER = {
  converterId: "builtin-pdf-markdown",
  version: "1.0.0",
} as const satisfies RuntimeConverterRef;

export const PRODUCTION_DOCUMENT_NORMALIZATION_LIMITS = {
  maximumInputBytes: 12_000_000,
  maximumOutputBytes: PRODUCTION_MARKDOWN_STAGING_LIMITS.maximumOutputBytes,
} as const;

export type ProductionDocumentNormalizationResult = ProductionMarkdownStagingResult;

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function decoderUtf8(content: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true })
    .decode(content)
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
}

function decodeHtmlEntity(entity: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    ldquo: "“",
    lsquo: "‘",
    nbsp: " ",
    quot: '"',
    rdquo: "”",
    rsquo: "’",
    lt: "<",
  };
  if (entity.startsWith("#x") || entity.startsWith("#X")) {
    const value = Number.parseInt(entity.slice(2), 16);
    return Number.isFinite(value) ? String.fromCodePoint(value) : `&${entity};`;
  }
  if (entity.startsWith("#")) {
    const value = Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(value) ? String.fromCodePoint(value) : `&${entity};`;
  }
  return named[entity.toLowerCase()] ?? `&${entity};`;
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&([A-Za-z][A-Za-z0-9]+|#\d+|#x[0-9A-Fa-f]+);/g, (_match, entity) =>
    decodeHtmlEntity(String(entity)),
  );
}

function normalizeMarkdownWhitespace(value: string): string {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeHref(value: string): string | null {
  const href = decodeHtmlEntities(value.trim());
  if (!href) return null;
  if (/^(?:javascript|data|vbscript):/i.test(href)) return null;
  return href.replace(/\s+/g, "%20");
}

export function normalizeHtmlToMarkdown(input: Uint8Array): string {
  let html: string;
  try {
    html = decoderUtf8(input);
  } catch {
    throw new Error("HTML_NORMALIZATION_UTF8_INVALID");
  }
  if (!html.trim()) throw new Error("HTML_NORMALIZATION_INPUT_EMPTY");

  let text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, "")
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi, (_match, body) => {
      const plain = decodeHtmlEntities(String(body).replace(/<[^>]+>/g, ""));
      return `\n\n\`\`\`\n${plain.trim()}\n\`\`\`\n\n`;
    })
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code\s*>/gi, (_match, body) => {
      const plain = decodeHtmlEntities(String(body).replace(/<[^>]+>/g, "")).trim();
      return plain ? `\`${plain.replace(/`/g, "\\`")}\`` : "";
    })
    .replace(/<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi, (_match, doubleQuoted, singleQuoted, bare, body) => {
      const label = decodeHtmlEntities(String(body).replace(/<[^>]+>/g, "")).trim();
      const href = safeHref(String(doubleQuoted ?? singleQuoted ?? bare ?? ""));
      if (!label) return href ?? "";
      return href ? `[${label}](${href})` : label;
    });

  for (let level = 6; level >= 1; level -= 1) {
    const pattern = new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)<\\/h${level}\\s*>`, "gi");
    text = text.replace(pattern, (_match, body) => {
      const title = decodeHtmlEntities(String(body).replace(/<[^>]+>/g, "")).trim();
      return title ? `\n\n${"#".repeat(level)} ${title}\n\n` : "";
    });
  }

  text = text
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, "**$2**")
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, "*$2*")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/li\s*>/gi, "")
    .replace(/<blockquote\b[^>]*>/gi, "\n\n> ")
    .replace(/<\/blockquote\s*>/gi, "\n\n")
    .replace(/<(th|td)\b[^>]*>/gi, " | ")
    .replace(/<\/(th|td)\s*>/gi, "")
    .replace(/<tr\b[^>]*>/gi, "\n")
    .replace(/<\/tr\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr\b[^>]*\/?>/gi, "\n\n---\n\n")
    .replace(/<\/(p|div|section|article|main|aside|header|footer|nav|ul|ol|table)\s*>/gi, "\n\n")
    .replace(/<(p|div|section|article|main|aside|header|footer|nav|ul|ol|table)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  text = normalizeMarkdownWhitespace(decodeHtmlEntities(text));
  if (!text) throw new Error("HTML_NORMALIZATION_NO_EXTRACTABLE_TEXT");
  return text;
}

function decodePdfLiteral(value: string): string {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== "\\") {
      output += char;
      continue;
    }
    const next = value[index + 1];
    if (next === undefined) break;
    if (/[0-7]/.test(next)) {
      const octal = value.slice(index + 1).match(/^[0-7]{1,3}/)?.[0] ?? next;
      output += String.fromCharCode(Number.parseInt(octal, 8));
      index += octal.length;
      continue;
    }
    const escapes: Record<string, string> = {
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
      "(": "(",
      ")": ")",
      "\\": "\\",
    };
    if (next === "\n") {
      index += 1;
      continue;
    }
    if (next === "\r") {
      if (value[index + 2] === "\n") index += 1;
      index += 1;
      continue;
    }
    output += escapes[next] ?? next;
    index += 1;
  }
  return output;
}

function decodePdfHex(value: string): string {
  const compact = value.replace(/\s+/g, "");
  if (!/^[0-9A-Fa-f]*$/.test(compact)) return "";
  const even = compact.length % 2 === 0 ? compact : `${compact}0`;
  const bytes = Buffer.from(even, "hex");
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let output = "";
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      output += String.fromCharCode(bytes.readUInt16BE(index));
    }
    return output;
  }
  return bytes.toString("latin1");
}

function extractPdfTextOperators(stream: string): string[] {
  const output: string[] = [];
  const textBlocks = stream.match(/BT[\s\S]*?ET/g) ?? [];
  for (const block of textBlocks) {
    const operators = block.match(/\((?:\\.|[^\\)])*\)\s*(?:Tj|'|")|<\s*[0-9A-Fa-f\s]+\s*>\s*Tj|\[[\s\S]*?\]\s*TJ/g) ?? [];
    for (const operator of operators) {
      if (operator.trimStart().startsWith("[")) {
        const body = operator.slice(operator.indexOf("[") + 1, operator.lastIndexOf("]"));
        const strings = body.match(/\((?:\\.|[^\\)])*\)|<\s*[0-9A-Fa-f\s]+\s*>/g) ?? [];
        const joined = strings
          .map((item) =>
            item.startsWith("(")
              ? decodePdfLiteral(item.slice(1, -1))
              : decodePdfHex(item.slice(1, -1)),
          )
          .join("");
        if (joined.trim()) output.push(joined);
        continue;
      }
      const literal = operator.match(/^\((.*)\)\s*(?:Tj|'|")$/s);
      if (literal) {
        const decoded = decodePdfLiteral(literal[1]);
        if (decoded.trim()) output.push(decoded);
        continue;
      }
      const hex = operator.match(/^<\s*([0-9A-Fa-f\s]+)\s*>\s*Tj$/s);
      if (hex) {
        const decoded = decodePdfHex(hex[1]);
        if (decoded.trim()) output.push(decoded);
      }
    }
  }
  return output;
}

export function normalizePdfToMarkdown(input: Uint8Array): string {
  const bytes = Buffer.from(input);
  if (bytes.length < 8 || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("PDF_NORMALIZATION_HEADER_INVALID");
  }
  const binary = bytes.toString("latin1");
  const texts: string[] = [];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of binary.matchAll(streamPattern)) {
    const raw = Buffer.from(match[1], "latin1");
    const dictionaryStart = Math.max(0, (match.index ?? 0) - 500);
    const dictionary = binary.slice(dictionaryStart, match.index ?? 0);
    let decoded = raw;
    if (/\/FlateDecode\b/.test(dictionary)) {
      try {
        decoded = inflateSync(raw);
      } catch {
        continue;
      }
    }
    texts.push(...extractPdfTextOperators(decoded.toString("latin1")));
  }
  const markdown = normalizeMarkdownWhitespace(
    texts
      .map((value) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").trim())
      .filter(Boolean)
      .join("\n"),
  );
  if (!markdown) throw new Error("PDF_NORMALIZATION_NO_EXTRACTABLE_TEXT");
  return markdown;
}

function expectedConverter(context: ProductionMarkdownStagingContext): RuntimeConverterRef | null {
  const kind = context.documentMetadata.artifactKind;
  if (kind === "HTML") return PRODUCTION_HTML_MARKDOWN_CONVERTER;
  if (kind === "PDF") return PRODUCTION_PDF_MARKDOWN_CONVERTER;
  return null;
}

function assertExactBinding(context: ProductionMarkdownStagingContext): void {
  const expected = expectedConverter(context);
  if (!expected) throw new Error("DOCUMENT_NORMALIZATION_ARTIFACT_KIND_UNSUPPORTED");
  if (
    context.converter.converterId !== expected.converterId ||
    context.converter.version !== expected.version ||
    context.lease.converter.converterId !== expected.converterId ||
    context.lease.converter.version !== expected.version
  ) {
    throw new Error("DOCUMENT_NORMALIZATION_CONVERTER_IDENTITY_MISMATCH");
  }
  const metadata = context.documentMetadata;
  if (
    metadata.workspaceId !== context.workspaceId ||
    metadata.sourceId !== context.sourceId ||
    metadata.rawArtifactId !== context.rawArtifactId ||
    metadata.conversionRunId !== context.conversionRunId ||
    metadata.converterId !== expected.converterId ||
    metadata.converterVersion !== expected.version ||
    metadata.inputSha256 !== context.inputGrant.expectedSha256
  ) {
    throw new Error("DOCUMENT_NORMALIZATION_CANONICAL_METADATA_MISMATCH");
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
    throw new Error("DOCUMENT_NORMALIZATION_GRANT_SCOPE_MISMATCH");
  }
  if (context.lease.status !== "ACTIVE") throw new Error("DOCUMENT_NORMALIZATION_LEASE_NOT_ACTIVE");
  const mime = context.inputGrant.expectedMime.toLowerCase();
  if (metadata.artifactKind === "HTML" && mime !== "text/html" && mime !== "application/xhtml+xml") {
    throw new Error("HTML_NORMALIZATION_INPUT_MIME_UNSUPPORTED");
  }
  if (metadata.artifactKind === "PDF" && mime !== "application/pdf") {
    throw new Error("PDF_NORMALIZATION_INPUT_MIME_UNSUPPORTED");
  }
  if (context.outputGrant.allowedMediaType !== "text/markdown") {
    throw new Error("DOCUMENT_NORMALIZATION_OUTPUT_MEDIA_TYPE_UNSUPPORTED");
  }
}

export function convertProductionDocumentToStaging(
  context: ProductionMarkdownStagingContext,
  input: Uint8Array,
): Uint8Array {
  assertExactBinding(context);
  if (input.byteLength !== context.inputGrant.expectedBytes) {
    throw new Error("DOCUMENT_NORMALIZATION_INPUT_SIZE_MISMATCH");
  }
  if (input.byteLength > PRODUCTION_DOCUMENT_NORMALIZATION_LIMITS.maximumInputBytes) {
    throw new Error("DOCUMENT_NORMALIZATION_INPUT_TOO_LARGE");
  }
  if (sha256(input) !== context.inputGrant.expectedSha256) {
    throw new Error("DOCUMENT_NORMALIZATION_INPUT_DIGEST_MISMATCH");
  }
  const body =
    context.documentMetadata.artifactKind === "HTML"
      ? normalizeHtmlToMarkdown(input)
      : normalizePdfToMarkdown(input);
  const output = new TextEncoder().encode(
    `${canonicalMarkdownFrontmatter(context.documentMetadata)}${body}${body.endsWith("\n") ? "" : "\n"}`,
  );
  const maximumOutput = Math.min(
    PRODUCTION_DOCUMENT_NORMALIZATION_LIMITS.maximumOutputBytes,
    context.outputGrant.maximumBytes,
  );
  if (output.byteLength > maximumOutput) throw new Error("DOCUMENT_NORMALIZATION_OUTPUT_TOO_LARGE");
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
  const raw = error instanceof Error ? error.message : "DOCUMENT_NORMALIZATION_FAILED";
  return /^[A-Z0-9][A-Z0-9_]{1,99}$/.test(raw) ? raw : "DOCUMENT_NORMALIZATION_FAILED";
}

export class ProductionDocumentNormalizationExecutor {
  async execute(
    context: ProductionMarkdownStagingContext,
    reader: ProductionRawArtifactReader,
    uploader: ProductionStagingUploader,
    client: ProductionConversionRuntimeClient,
  ): Promise<ProductionDocumentNormalizationResult | null> {
    const prefix = `document-normalization-${context.lease.id}`;
    let outputReported = false;
    try {
      assertExactBinding(context);
      await client.started(context, `${prefix}-started`);
      await client.progress(
        context,
        { percent: 25, message: `Reading immutable ${context.documentMetadata.artifactKind} RawArtifact` },
        `${prefix}-read`,
      );
      const input = await reader.read(context.inputGrant);
      const markdown = convertProductionDocumentToStaging(context, input);
      const evidence = outputEvidence(context, markdown);
      await client.progress(
        context,
        { percent: 75, message: "Reporting normalized Canonical Markdown output evidence" },
        `${prefix}-output-evidence`,
      );
      await client.outputReady(context, evidence, `${prefix}-output-ready`);
      outputReported = true;
      const commit = await uploader.upload(context, markdown, evidence, `${prefix}-staging-commit`);
      return { markdown, evidence, commit };
    } catch (error) {
      if (!outputReported) {
        await client.failed(
          context,
          {
            code: failureCode(error),
            message: error instanceof Error ? error.message : "Controlled document normalization failed",
            retryable: false,
          },
          `${prefix}-failed`,
        );
      }
      return null;
    }
  }
}
