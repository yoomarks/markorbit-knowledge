import { createHash } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  RETRIEVAL_INDEX_MODE,
  RETRIEVAL_PROTOCOL_VERSION,
  type AuthorityLevel,
  type CanonicalMarkdownMetadataV1,
  type RetrievalChunk,
  type RetrievalDocument,
  type RetrievalDocumentResult,
  type RetrievalSearchRequest,
  type RetrievalSearchResult,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";

const MIGRATION_ID = "0015_retrieval_index";
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_SEARCH_LIMIT = 50;
const MAX_QUERY_TERMS = 16;
const CHUNK_TARGET_CHARS = 1_200;
const CHUNK_MAX_CHARS = 1_800;

export type IndexVerifiedDocumentInput = {
  metadata: CanonicalMarkdownMetadataV1;
  stagingDocumentId: string;
  readyPackageId: string;
  title: string;
  targetPath: string;
  contentSha256: string;
  canonicalMarkdown: Uint8Array;
};

export type IndexVerifiedDocumentResult = {
  document: RetrievalDocument;
  chunks: RetrievalChunk[];
  replayed: boolean;
};

export interface RetrievalIndexRepository {
  indexVerified(input: IndexVerifiedDocumentInput): IndexVerifiedDocumentResult;
  search(request: RetrievalSearchRequest): RetrievalSearchResult;
  getDocument(
    workspaceId: string,
    documentId: string,
    artifactVersion?: number,
  ): RetrievalDocument | null;
  listChunks(stagingDocumentId: string, workspaceId: string): RetrievalChunk[];
  documentResult(
    workspaceId: string,
    documentId: string,
    canonicalMarkdown: string,
    artifactVersion?: number,
  ): RetrievalDocumentResult | null;
}

type ParsedCanonicalDocument = {
  body: string;
  headings: string[][];
  blocks: Array<{ headingPath: string[]; text: string }>;
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "are",
  "was",
  "were",
  "will",
  "your",
  "you",
  "our",
  "their",
  "has",
  "have",
  "had",
  "not",
  "but",
  "can",
  "may",
  "into",
  "about",
  "more",
  "than",
  "when",
  "where",
  "which",
  "who",
  "how",
  "what",
  "all",
  "any",
  "use",
  "using",
  "used",
  "page",
  "website",
]);

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function decodeUtf8(value: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value).replace(/\r\n?/g, "\n");
  } catch {
    throw new RegistryValidationError("Indexed canonical Markdown must be valid UTF-8");
  }
}

function canonicalBody(markdown: string): string {
  if (!markdown.startsWith("---\n")) {
    throw new RegistryValidationError("Canonical Markdown must begin with YAML frontmatter");
  }
  const end = markdown.indexOf("\n---\n", 4);
  if (end < 0) {
    throw new RegistryValidationError("Canonical Markdown frontmatter is not terminated");
  }
  const body = markdown.slice(end + 5).trim();
  if (!body) throw new RegistryValidationError("Canonical Markdown body must not be empty");
  return body;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function parseCanonicalDocument(markdown: string): ParsedCanonicalDocument {
  const body = canonicalBody(markdown);
  const headings: string[] = [];
  const observedHeadings: string[][] = [];
  const blocks: Array<{ headingPath: string[]; text: string }> = [];
  let buffer: string[] = [];
  let inFence = false;

  const flush = () => {
    const text = normalizeText(buffer.join("\n"));
    buffer = [];
    if (text) blocks.push({ headingPath: headings.filter(Boolean), text });
  };

  for (const rawLine of body.split("\n")) {
    const line = rawLine.replace(/\s+$/g, "");
    if (/^\s*```/.test(line)) {
      buffer.push(line);
      inFence = !inFence;
      continue;
    }
    if (!inFence) {
      const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (heading) {
        flush();
        const level = heading[1].length;
        headings.length = level;
        headings[level - 1] = normalizeText(heading[2]);
        observedHeadings.push(headings.filter(Boolean));
        continue;
      }
      if (!line.trim()) {
        flush();
        continue;
      }
    }
    buffer.push(line);
  }
  flush();
  return { body, headings: observedHeadings, blocks };
}

function splitLongText(text: string, maximum = CHUNK_MAX_CHARS): string[] {
  if (text.length <= maximum) return [text];
  const pieces: string[] = [];
  let remaining = text;
  while (remaining.length > maximum) {
    let cut = remaining.lastIndexOf(" ", maximum);
    if (cut < Math.floor(maximum * 0.6)) cut = remaining.lastIndexOf("\n", maximum);
    if (cut < Math.floor(maximum * 0.6)) cut = maximum;
    pieces.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) pieces.push(remaining);
  return pieces.filter(Boolean);
}

function buildChunks(
  documentId: string,
  stagingDocumentId: string,
  artifactVersion: number,
  parsed: ParsedCanonicalDocument,
): RetrievalChunk[] {
  const expanded = parsed.blocks.flatMap((block) =>
    splitLongText(block.text).map((text) => ({ headingPath: block.headingPath, text })),
  );
  const grouped: Array<{ headingPath: string[]; text: string }> = [];

  for (const block of expanded) {
    const previous = grouped.at(-1);
    const sameHeading =
      previous && JSON.stringify(previous.headingPath) === JSON.stringify(block.headingPath);
    if (
      previous &&
      sameHeading &&
      previous.text.length + 2 + block.text.length <= CHUNK_TARGET_CHARS
    ) {
      previous.text = `${previous.text}\n\n${block.text}`;
    } else {
      grouped.push({ headingPath: [...block.headingPath], text: block.text });
    }
  }

  if (grouped.length === 0) {
    for (const text of splitLongText(parsed.body)) grouped.push({ headingPath: [], text });
  }

  return grouped.map((item, index) => {
    const ordinal = index + 1;
    const contentSha256 = sha256(
      `${stagingDocumentId}\u0000${documentId}\u0000${artifactVersion}\u0000${ordinal}\u0000${item.headingPath.join("\u0000")}\u0000${item.text}`,
    );
    return {
      protocolVersion: RETRIEVAL_PROTOCOL_VERSION,
      objectType: "RETRIEVAL_CHUNK",
      chunkId: `rch_${contentSha256.slice(0, 32)}`,
      documentId,
      stagingDocumentId,
      artifactVersion,
      ordinal,
      headingPath: item.headingPath,
      text: item.text,
      contentSha256,
    };
  });
}

function lexicalTokens(value: string): string[] {
  return (
    value
      .normalize("NFKC")
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []
  )
    .map((token) => token.replace(/^[-']+|[-']+$/g, ""))
    .filter((token) => token.length >= 3 && token.length <= 48 && !STOP_WORDS.has(token));
}

function extractKeywords(title: string, parsed: ParsedCanonicalDocument): string[] {
  const scores = new Map<string, number>();
  const add = (value: string, weight: number) => {
    for (const token of lexicalTokens(value)) scores.set(token, (scores.get(token) ?? 0) + weight);
  };
  add(title, 8);
  for (const path of parsed.headings) add(path.join(" "), 4);
  add(parsed.body.slice(0, 120_000), 1);
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 24)
    .map(([token]) => token);
}

function ftsQuery(query: string): string {
  const terms = lexicalTokens(query).slice(0, MAX_QUERY_TERMS);
  if (terms.length === 0) {
    const fallback = query.normalize("NFKC").trim();
    if (!fallback) throw new RegistryValidationError("retrieval query must not be empty");
    return `"${fallback.replaceAll('"', '""')}"`;
  }
  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" AND ");
}

function normalizeLimit(value?: number): number {
  if (value === undefined) return 20;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RegistryValidationError("retrieval limit must be a positive integer");
  }
  return Math.min(value, MAX_SEARCH_LIMIT);
}

function normalizeOffset(value?: number): number {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RegistryValidationError("retrieval offset must be a non-negative integer");
  }
  return value;
}

function rowDocument(row: Record<string, unknown>): RetrievalDocument {
  return {
    protocolVersion: RETRIEVAL_PROTOCOL_VERSION,
    objectType: "RETRIEVAL_DOCUMENT",
    documentId: String(row.document_id),
    workspaceId: String(row.workspace_id),
    sourceId: String(row.source_id),
    stagingDocumentId: String(row.staging_document_id),
    readyPackageId: String(row.ready_package_id),
    rawArtifactId: String(row.raw_artifact_id),
    logicalDocumentId: row.logical_document_id === null ? null : String(row.logical_document_id),
    artifactVersion: Number(row.artifact_version),
    title: String(row.title),
    targetPath: String(row.target_path),
    canonicalUri: row.canonical_uri === null ? null : String(row.canonical_uri),
    sourceUri: String(row.source_uri),
    sourceName: String(row.source_name),
    sourceCategory: String(row.source_category) as RetrievalDocument["sourceCategory"],
    authorityLevel: String(row.authority_level) as AuthorityLevel,
    jurisdictions: JSON.parse(String(row.jurisdictions_json)) as string[],
    languages: JSON.parse(String(row.languages_json)) as string[],
    capturedAt: String(row.captured_at),
    publishedAt: row.published_at === null ? null : String(row.published_at),
    contentSha256: String(row.content_sha256),
    keywords: JSON.parse(String(row.keywords_json)) as string[],
    chunkCount: Number(row.chunk_count),
    indexedAt: String(row.indexed_at),
    isCurrent: Number(row.is_current) === 1,
  };
}

function rowChunk(row: Record<string, unknown>): RetrievalChunk {
  return {
    protocolVersion: RETRIEVAL_PROTOCOL_VERSION,
    objectType: "RETRIEVAL_CHUNK",
    chunkId: String(row.chunk_id),
    documentId: String(row.document_id),
    stagingDocumentId: String(row.staging_document_id),
    artifactVersion: Number(row.artifact_version),
    ordinal: Number(row.ordinal),
    headingPath: JSON.parse(String(row.heading_path_json)) as string[],
    text: String(row.text),
    contentSha256: String(row.chunk_content_sha256 ?? row.content_sha256),
  };
}

const DOCUMENT_COLUMNS = `
  staging_document_id, workspace_id, document_id, source_id, ready_package_id,
  raw_artifact_id, logical_document_id, artifact_version, title, target_path,
  canonical_uri, source_uri, source_name, source_category, authority_level,
  jurisdictions_json, languages_json, captured_at, published_at, content_sha256,
  keywords_json, chunk_count, indexed_at, is_current`;

export function ensureRetrievalIndex(database: DatabaseSync): void {
  initializeRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS retrieval_documents (
        staging_document_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        ready_package_id TEXT NOT NULL,
        raw_artifact_id TEXT NOT NULL,
        logical_document_id TEXT,
        artifact_version INTEGER NOT NULL CHECK (artifact_version > 0),
        title TEXT NOT NULL,
        target_path TEXT NOT NULL,
        canonical_uri TEXT,
        source_uri TEXT NOT NULL,
        source_name TEXT NOT NULL,
        source_category TEXT NOT NULL,
        authority_level TEXT NOT NULL,
        jurisdictions_json TEXT NOT NULL,
        languages_json TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        published_at TEXT,
        content_sha256 TEXT NOT NULL,
        keywords_json TEXT NOT NULL,
        chunk_count INTEGER NOT NULL CHECK (chunk_count > 0),
        indexed_at TEXT NOT NULL,
        is_current INTEGER NOT NULL CHECK (is_current IN (0,1)),
        UNIQUE (workspace_id, document_id, artifact_version)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS retrieval_chunks (
        chunk_id TEXT PRIMARY KEY,
        staging_document_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        artifact_version INTEGER NOT NULL,
        ordinal INTEGER NOT NULL CHECK (ordinal > 0),
        heading_path_json TEXT NOT NULL,
        text TEXT NOT NULL,
        content_sha256 TEXT NOT NULL,
        UNIQUE (staging_document_id, ordinal),
        FOREIGN KEY (staging_document_id) REFERENCES retrieval_documents(staging_document_id)
      ) STRICT;

      CREATE VIRTUAL TABLE IF NOT EXISTS retrieval_chunks_fts USING fts5(
        chunk_id UNINDEXED,
        workspace_id UNINDEXED,
        source_id UNINDEXED,
        title,
        heading_path,
        body,
        tokenize = 'unicode61 remove_diacritics 2'
      );

      CREATE INDEX IF NOT EXISTS idx_retrieval_documents_current
        ON retrieval_documents(workspace_id, is_current, source_id, document_id);
      CREATE INDEX IF NOT EXISTS idx_retrieval_documents_version
        ON retrieval_documents(workspace_id, document_id, artifact_version DESC);
      CREATE INDEX IF NOT EXISTS idx_retrieval_chunks_document
        ON retrieval_chunks(staging_document_id, ordinal);
    `);
    database
      .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
      .run(MIGRATION_ID, new Date().toISOString());
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

export class SqliteRetrievalIndexRepository implements RetrievalIndexRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    ensureRetrievalIndex(database);
  }

  indexVerified(input: IndexVerifiedDocumentInput): IndexVerifiedDocumentResult {
    const title = input.title.trim();
    if (!title || title.length > 300)
      throw new RegistryValidationError("retrieval title is invalid");
    if (!SHA256.test(input.contentSha256)) {
      throw new RegistryValidationError("retrieval contentSha256 must be SHA-256");
    }
    if (sha256(input.canonicalMarkdown) !== input.contentSha256) {
      throw new RegistryConflictError(
        "RETRIEVAL_CONTENT_DIGEST_MISMATCH",
        "Canonical Markdown bytes do not match verified Staging evidence",
      );
    }
    const markdown = decodeUtf8(input.canonicalMarkdown);
    const parsed = parseCanonicalDocument(markdown);
    const chunks = buildChunks(
      input.metadata.documentId,
      input.stagingDocumentId,
      input.metadata.artifactVersion,
      parsed,
    );
    const keywords = extractKeywords(title, parsed);
    const indexedAt = this.clock().toISOString();

    const existing = this.database
      .prepare(`SELECT ${DOCUMENT_COLUMNS} FROM retrieval_documents WHERE staging_document_id = ?`)
      .get(input.stagingDocumentId) as Record<string, unknown> | undefined;
    if (existing) {
      const document = rowDocument(existing);
      if (
        document.workspaceId !== input.metadata.workspaceId ||
        document.documentId !== input.metadata.documentId ||
        document.contentSha256 !== input.contentSha256 ||
        document.readyPackageId !== input.readyPackageId
      ) {
        throw new RegistryConflictError(
          "RETRIEVAL_STAGING_DOCUMENT_CONFLICT",
          "Staging document is already indexed with different immutable evidence",
        );
      }
      return {
        document,
        chunks: this.listChunks(input.stagingDocumentId, input.metadata.workspaceId),
        replayed: true,
      };
    }

    const sameVersion = this.database
      .prepare(
        `SELECT staging_document_id FROM retrieval_documents
         WHERE workspace_id = ? AND document_id = ? AND artifact_version = ?`,
      )
      .get(
        input.metadata.workspaceId,
        input.metadata.documentId,
        input.metadata.artifactVersion,
      ) as { staging_document_id: string } | undefined;
    if (sameVersion) {
      throw new RegistryConflictError(
        "RETRIEVAL_DOCUMENT_VERSION_CONFLICT",
        "Document version is already indexed from another Staging document",
      );
    }

    const latest = this.database
      .prepare(
        `SELECT MAX(artifact_version) AS version FROM retrieval_documents
         WHERE workspace_id = ? AND document_id = ?`,
      )
      .get(input.metadata.workspaceId, input.metadata.documentId) as { version: number | null };
    const isCurrent = latest.version === null || input.metadata.artifactVersion > latest.version;

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      if (isCurrent) {
        this.database
          .prepare(
            "UPDATE retrieval_documents SET is_current = 0 WHERE workspace_id = ? AND document_id = ?",
          )
          .run(input.metadata.workspaceId, input.metadata.documentId);
      }
      this.database
        .prepare(
          `INSERT INTO retrieval_documents (${DOCUMENT_COLUMNS})
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.stagingDocumentId,
          input.metadata.workspaceId,
          input.metadata.documentId,
          input.metadata.sourceId,
          input.readyPackageId,
          input.metadata.rawArtifactId,
          input.metadata.logicalDocumentId,
          input.metadata.artifactVersion,
          title,
          input.targetPath,
          input.metadata.canonicalUri,
          input.metadata.sourceUri,
          input.metadata.sourceName,
          input.metadata.sourceCategory,
          input.metadata.authorityLevel,
          JSON.stringify(input.metadata.jurisdictions),
          JSON.stringify(input.metadata.languages),
          input.metadata.capturedAt,
          input.metadata.publishedAt,
          input.contentSha256,
          JSON.stringify(keywords),
          chunks.length,
          indexedAt,
          isCurrent ? 1 : 0,
        );

      const insertChunk = this.database.prepare(
        `INSERT INTO retrieval_chunks
         (chunk_id, staging_document_id, workspace_id, document_id, artifact_version,
          ordinal, heading_path_json, text, content_sha256)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertFts = this.database.prepare(
        `INSERT INTO retrieval_chunks_fts
         (chunk_id, workspace_id, source_id, title, heading_path, body)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const chunk of chunks) {
        insertChunk.run(
          chunk.chunkId,
          chunk.stagingDocumentId,
          input.metadata.workspaceId,
          chunk.documentId,
          chunk.artifactVersion,
          chunk.ordinal,
          JSON.stringify(chunk.headingPath),
          chunk.text,
          chunk.contentSha256,
        );
        insertFts.run(
          chunk.chunkId,
          input.metadata.workspaceId,
          input.metadata.sourceId,
          title,
          chunk.headingPath.join(" > "),
          chunk.text,
        );
      }
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }

    const document = this.getDocument(
      input.metadata.workspaceId,
      input.metadata.documentId,
      input.metadata.artifactVersion,
    );
    if (!document)
      throw new RegistryError("RETRIEVAL_INDEX_WRITE_FAILED", "Indexed document missing");
    return { document, chunks, replayed: false };
  }

  search(request: RetrievalSearchRequest): RetrievalSearchResult {
    const workspaceId = request.workspaceId.trim();
    const query = request.query.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    if (!query) throw new RegistryValidationError("retrieval query is required");
    const limit = normalizeLimit(request.limit);
    const offset = normalizeOffset(request.offset);
    const match = ftsQuery(query);
    const clauses = ["retrieval_chunks_fts MATCH ?", "d.workspace_id = ?", "d.is_current = 1"];
    const values: SQLInputValue[] = [match, workspaceId];
    if (request.sourceId?.trim()) {
      clauses.push("d.source_id = ?");
      values.push(request.sourceId.trim());
    }
    if (request.authorityLevel) {
      clauses.push("d.authority_level = ?");
      values.push(request.authorityLevel);
    }
    if (request.jurisdiction?.trim()) {
      clauses.push("EXISTS (SELECT 1 FROM json_each(d.jurisdictions_json) WHERE value = ?)");
      values.push(request.jurisdiction.trim());
    }
    if (request.language?.trim()) {
      clauses.push("EXISTS (SELECT 1 FROM json_each(d.languages_json) WHERE value = ?)");
      values.push(request.language.trim());
    }
    const where = clauses.join(" AND ");
    const rows = this.database
      .prepare(
        `SELECT c.*, d.*, c.content_sha256 AS chunk_content_sha256,
          bm25(retrieval_chunks_fts, 0.0, 0.0, 0.0, 7.0, 4.0, 1.0) AS rank,
          snippet(retrieval_chunks_fts, 5, '', '', ' … ', 32) AS snippet
         FROM retrieval_chunks_fts
         JOIN retrieval_chunks c ON c.chunk_id = retrieval_chunks_fts.chunk_id
         JOIN retrieval_documents d ON d.staging_document_id = c.staging_document_id
         WHERE ${where}
         ORDER BY rank ASC, d.artifact_version DESC, c.ordinal ASC
         LIMIT ? OFFSET ?`,
      )
      .all(...values, limit, offset) as Record<string, unknown>[];
    const count = this.database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM retrieval_chunks_fts
         JOIN retrieval_chunks c ON c.chunk_id = retrieval_chunks_fts.chunk_id
         JOIN retrieval_documents d ON d.staging_document_id = c.staging_document_id
         WHERE ${where}`,
      )
      .get(...values) as { count: number };

    return {
      protocolVersion: RETRIEVAL_PROTOCOL_VERSION,
      objectType: "RETRIEVAL_SEARCH_RESULT",
      indexMode: RETRIEVAL_INDEX_MODE,
      query,
      items: rows.map((row) => ({
        document: rowDocument(row),
        chunk: rowChunk(row),
        score: -Number(row.rank),
        snippet: String(row.snippet ?? row.text),
      })),
      total: Number(count.count),
    };
  }

  getDocument(
    workspaceId: string,
    documentId: string,
    artifactVersion?: number,
  ): RetrievalDocument | null {
    const versionClause =
      artifactVersion === undefined ? "AND is_current = 1" : "AND artifact_version = ?";
    const values: SQLInputValue[] = [workspaceId, documentId];
    if (artifactVersion !== undefined) {
      if (!Number.isSafeInteger(artifactVersion) || artifactVersion <= 0) {
        throw new RegistryValidationError("artifactVersion must be a positive integer");
      }
      values.push(artifactVersion);
    }
    const row = this.database
      .prepare(
        `SELECT ${DOCUMENT_COLUMNS} FROM retrieval_documents
         WHERE workspace_id = ? AND document_id = ? ${versionClause}
         ORDER BY artifact_version DESC LIMIT 1`,
      )
      .get(...values) as Record<string, unknown> | undefined;
    return row ? rowDocument(row) : null;
  }

  listChunks(stagingDocumentId: string, workspaceId: string): RetrievalChunk[] {
    const rows = this.database
      .prepare(
        `SELECT c.* FROM retrieval_chunks c
         JOIN retrieval_documents d ON d.staging_document_id = c.staging_document_id
         WHERE c.staging_document_id = ? AND d.workspace_id = ?
         ORDER BY c.ordinal ASC`,
      )
      .all(stagingDocumentId, workspaceId) as Record<string, unknown>[];
    return rows.map(rowChunk);
  }

  documentResult(
    workspaceId: string,
    documentId: string,
    canonicalMarkdown: string,
    artifactVersion?: number,
  ): RetrievalDocumentResult | null {
    const document = this.getDocument(workspaceId, documentId, artifactVersion);
    if (!document) return null;
    return {
      protocolVersion: RETRIEVAL_PROTOCOL_VERSION,
      objectType: "RETRIEVAL_DOCUMENT_RESULT",
      document,
      chunks: this.listChunks(document.stagingDocumentId, workspaceId),
      canonicalMarkdown,
    };
  }
}
