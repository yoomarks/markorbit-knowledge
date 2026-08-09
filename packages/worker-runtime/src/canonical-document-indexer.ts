import { createHash } from "node:crypto";
import {
  DOCUMENT_INDEX_OBJECT_TYPE,
  DOCUMENT_INDEX_VERSION,
  RETRIEVAL_CHUNK_OBJECT_TYPE,
  isDocumentIndexV1,
  type DocumentIndexV1,
  type LanguageHintBasis,
  type RetrievalChunkV1,
} from "@markorbit/contracts";

export const CANONICAL_DOCUMENT_CHUNKING = {
  strategy: "MARKDOWN_SECTION_V1",
  maxCharacters: 1_800,
} as const;

export type CanonicalDocumentIndexInput = {
  workspaceId: string;
  stagingDocumentId: string;
  documentId: string;
  sourceId: string;
  rawArtifactId: string;
  conversionRunId: string;
  contentSha256: string;
  declaredLanguages: string[];
  markdown: Uint8Array;
  maxCharacters?: number;
};

type BodyLine = {
  text: string;
  lineNumber: number;
};

type ChunkDraft = {
  headingPath: string[];
  startLine: number;
  endLine: number;
  text: string;
};

const ENGLISH_STOP_WORDS = new Set([
  "and",
  "are",
  "but",
  "for",
  "from",
  "has",
  "have",
  "into",
  "its",
  "not",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "was",
  "were",
  "will",
  "with",
  "you",
  "your",
]);

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function decodeUtf8(value: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(value).replace(/\r\n?/g, "\n");
}

function canonicalBody(markdown: string): BodyLine[] {
  const lines = markdown.split("\n");
  if (lines[0] !== "---") throw new Error("DOCUMENT_INDEX_FRONTMATTER_REQUIRED");
  const closing = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closing < 1) throw new Error("DOCUMENT_INDEX_FRONTMATTER_UNTERMINATED");
  const body = lines.slice(closing + 1);
  while (body.length > 0 && body[0]?.trim() === "") body.shift();
  const firstBodyIndex = lines.length - body.length;
  return body.map((text, index) => ({ text, lineNumber: firstBodyIndex + index + 1 }));
}

function normalizeKeyword(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

function lexicalTokens(text: string): string[] {
  const normalized = text.normalize("NFKC").toLocaleLowerCase("en-US");
  const tokens: string[] = [];
  for (const match of normalized.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)) {
    const token = match[0];
    if (/^[\p{Script=Han}]+$/u.test(token)) {
      const characters = Array.from(token);
      if (characters.length === 1) {
        tokens.push(token);
      } else {
        for (let index = 0; index < characters.length - 1; index += 1) {
          tokens.push(`${characters[index]}${characters[index + 1]}`);
        }
      }
      continue;
    }
    if (token.length < 3 || ENGLISH_STOP_WORDS.has(token)) continue;
    tokens.push(token);
  }
  return tokens;
}

function keywords(text: string, limit = 24): string[] {
  const counts = new Map<string, number>();
  for (const token of lexicalTokens(text)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([token]) => normalizeKeyword(token));
}

function wordCount(text: string): number {
  return lexicalTokens(text).length;
}

function languageHint(
  text: string,
  declaredLanguages: string[],
): { code: string | null; basis: LanguageHintBasis } {
  if (declaredLanguages.length === 1) {
    return { code: declaredLanguages[0] ?? null, basis: "DECLARED_SINGLE" };
  }
  const counts = {
    han: (text.match(/[\p{Script=Han}]/gu) ?? []).length,
    kana: (text.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length,
    hangul: (text.match(/[\p{Script=Hangul}]/gu) ?? []).length,
  };
  const declared = (prefix: string): string | null =>
    declaredLanguages.find((language) => language.toLowerCase().startsWith(prefix)) ?? null;
  if (counts.kana >= 4) return { code: declared("ja") ?? "ja", basis: "SCRIPT_HEURISTIC" };
  if (counts.hangul >= 4) return { code: declared("ko") ?? "ko", basis: "SCRIPT_HEURISTIC" };
  if (counts.han >= 4) return { code: declared("zh") ?? "zh", basis: "SCRIPT_HEURISTIC" };
  return { code: null, basis: "UNDETERMINED" };
}

function heading(line: string): { level: number; title: string } | null {
  const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.trim());
  if (!match) return null;
  return { level: match[1]!.length, title: match[2]!.trim() };
}

function splitLongLine(line: BodyLine, maxCharacters: number): BodyLine[] {
  if (line.text.length <= maxCharacters) return [line];
  const output: BodyLine[] = [];
  let remaining = line.text;
  while (remaining.length > maxCharacters) {
    let boundary = remaining.lastIndexOf(" ", maxCharacters);
    if (boundary < Math.floor(maxCharacters * 0.5)) boundary = maxCharacters;
    output.push({ text: remaining.slice(0, boundary).trimEnd(), lineNumber: line.lineNumber });
    remaining = remaining.slice(boundary).trimStart();
  }
  if (remaining) output.push({ text: remaining, lineNumber: line.lineNumber });
  return output;
}

function chunkBody(lines: BodyLine[], maxCharacters: number): ChunkDraft[] {
  const drafts: ChunkDraft[] = [];
  const headingPath: string[] = [];
  let current: BodyLine[] = [];
  let currentPath: string[] = [];

  const flush = () => {
    const meaningful = current.filter((line) => line.text.trim().length > 0);
    if (meaningful.length === 0) {
      current = [];
      return;
    }
    drafts.push({
      headingPath: [...currentPath],
      startLine: meaningful[0]!.lineNumber,
      endLine: meaningful[meaningful.length - 1]!.lineNumber,
      text: current.map((line) => line.text).join("\n").trim(),
    });
    current = [];
  };

  for (const originalLine of lines) {
    const foundHeading = heading(originalLine.text);
    if (foundHeading) {
      flush();
      headingPath.length = foundHeading.level - 1;
      headingPath[foundHeading.level - 1] = foundHeading.title;
      currentPath = [...headingPath.filter(Boolean)];
    }
    for (const line of splitLongLine(originalLine, maxCharacters)) {
      const nextLength =
        current.reduce((total, item) => total + item.text.length + 1, 0) + line.text.length;
      if (current.length > 0 && nextLength > maxCharacters) flush();
      if (current.length === 0) currentPath = [...headingPath.filter(Boolean)];
      current.push(line);
      if (line.text.trim() === "" && current.length > 1) {
        const length = current.reduce((total, item) => total + item.text.length + 1, 0);
        if (length >= Math.floor(maxCharacters * 0.7)) flush();
      }
    }
  }
  flush();
  return drafts;
}

function indexId(input: CanonicalDocumentIndexInput): string {
  return `dix_${sha256(
    `${DOCUMENT_INDEX_VERSION}:${input.stagingDocumentId}:${input.contentSha256}:MARKDOWN_SECTION_V1`,
  ).slice(0, 40)}`;
}

function chunkId(documentIndexId: string, ordinal: number, draft: ChunkDraft): string {
  return `chk_${sha256(
    `${documentIndexId}:${ordinal}:${draft.startLine}:${draft.endLine}:${sha256(draft.text)}`,
  ).slice(0, 40)}`;
}

export function buildCanonicalDocumentIndex(input: CanonicalDocumentIndexInput): DocumentIndexV1 {
  if (sha256(input.markdown) !== input.contentSha256) {
    throw new Error("DOCUMENT_INDEX_CONTENT_DIGEST_MISMATCH");
  }
  const maxCharacters = input.maxCharacters ?? CANONICAL_DOCUMENT_CHUNKING.maxCharacters;
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 400 || maxCharacters > 10_000) {
    throw new Error("DOCUMENT_INDEX_CHUNK_SIZE_INVALID");
  }
  const markdown = decodeUtf8(input.markdown);
  const bodyLines = canonicalBody(markdown);
  const bodyText = bodyLines.map((line) => line.text).join("\n").trim();
  if (!bodyText) throw new Error("DOCUMENT_INDEX_BODY_EMPTY");
  const id = indexId(input);
  const drafts = chunkBody(bodyLines, maxCharacters);
  if (drafts.length === 0) throw new Error("DOCUMENT_INDEX_CHUNKS_EMPTY");
  const chunks: RetrievalChunkV1[] = drafts.map((draft, ordinal) => ({
    protocolVersion: DOCUMENT_INDEX_VERSION,
    objectType: RETRIEVAL_CHUNK_OBJECT_TYPE,
    id: chunkId(id, ordinal, draft),
    documentIndexId: id,
    stagingDocumentId: input.stagingDocumentId,
    workspaceId: input.workspaceId,
    sourceId: input.sourceId,
    ordinal,
    headingPath: draft.headingPath,
    startLine: draft.startLine,
    endLine: draft.endLine,
    text: draft.text,
    contentSha256: sha256(draft.text),
    characterCount: draft.text.length,
    wordCount: wordCount(draft.text),
    keywords: keywords(`${draft.headingPath.join(" ")} ${draft.text}`, 12),
  }));
  const document: DocumentIndexV1 = {
    protocolVersion: DOCUMENT_INDEX_VERSION,
    objectType: DOCUMENT_INDEX_OBJECT_TYPE,
    id,
    workspaceId: input.workspaceId,
    stagingDocumentId: input.stagingDocumentId,
    documentId: input.documentId,
    sourceId: input.sourceId,
    rawArtifactId: input.rawArtifactId,
    conversionRunId: input.conversionRunId,
    contentSha256: input.contentSha256,
    declaredLanguages: [...new Set(input.declaredLanguages)],
    languageHint: languageHint(bodyText, input.declaredLanguages),
    statistics: {
      characterCount: bodyText.length,
      wordCount: wordCount(bodyText),
      lineCount: Math.max(bodyLines.length, 1),
      headingCount: bodyLines.filter((line) => heading(line.text) !== null).length,
      linkCount: (bodyText.match(/\[[^\]]+\]\([^)]+\)/g) ?? []).length,
    },
    keywords: keywords(bodyText),
    chunking: { strategy: "MARKDOWN_SECTION_V1", maxCharacters },
    chunks,
    embedding: { status: "NOT_GENERATED" },
  };
  if (!isDocumentIndexV1(document)) throw new Error("DOCUMENT_INDEX_CONTRACT_INVALID");
  return document;
}
