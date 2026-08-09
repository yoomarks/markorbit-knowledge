import { DatabaseSync } from "node:sqlite";
import {
  isDocumentIndexV1,
  isRetrievalChunkV1,
  type DocumentIndexV1,
  type RetrievalChunkV1,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";
import { ensureStagingContentRegistry } from "./staging-content-registry";

const MIGRATION_ID = "0015_document_index_registry";

export type DocumentIndexRecord = {
  index: DocumentIndexV1;
  indexedAt: string;
};

export type PersistDocumentIndexResult = {
  record: DocumentIndexRecord;
  replayed: boolean;
};

export type IndexedChunkSearchFilters = {
  workspaceId: string;
  query: string;
  sourceId?: string;
  limit?: number;
};

export type IndexedChunkSearchHit = {
  chunk: RetrievalChunkV1;
  score: number;
};

export interface DocumentIndexRegistryRepository {
  persistVerified(index: DocumentIndexV1): PersistDocumentIndexResult;
  getByStagingDocument(stagingDocumentId: string, workspaceId: string): DocumentIndexRecord | null;
  listChunks(documentIndexId: string, workspaceId: string): RetrievalChunkV1[];
  searchTerms(filters: IndexedChunkSearchFilters): IndexedChunkSearchHit[];
}

function parseIndex(value: string): DocumentIndexV1 {
  const parsed = JSON.parse(value) as unknown;
  if (!isDocumentIndexV1(parsed)) {
    throw new RegistryValidationError("Persisted DocumentIndex is invalid");
  }
  return parsed;
}

function parseChunk(value: string): RetrievalChunkV1 {
  const parsed = JSON.parse(value) as unknown;
  if (!isRetrievalChunkV1(parsed)) {
    throw new RegistryValidationError("Persisted RetrievalChunk is invalid");
  }
  return parsed;
}

function lexicalTokens(text: string): string[] {
  const normalized = text.normalize("NFKC").toLocaleLowerCase("en-US");
  const tokens: string[] = [];
  for (const match of normalized.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)) {
    const token = match[0];
    if (/^[\p{Script=Han}]+$/u.test(token)) {
      const characters = Array.from(token);
      if (characters.length === 1) tokens.push(token);
      for (let index = 0; index < characters.length - 1; index += 1) {
        tokens.push(`${characters[index]}${characters[index + 1]}`);
      }
      continue;
    }
    if (token.length >= 2) tokens.push(token.slice(0, 80));
  }
  return tokens;
}

function termFrequencies(chunk: RetrievalChunkV1): Map<string, number> {
  const frequencies = new Map<string, number>();
  const searchable = `${chunk.headingPath.join(" ")}\n${chunk.text}`;
  for (const token of lexicalTokens(searchable)) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }
  return frequencies;
}

function normalizeLimit(value?: number): number {
  if (value === undefined) return 20;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RegistryValidationError("limit must be a positive integer");
  }
  return Math.min(value, 100);
}

export function ensureDocumentIndexRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  ensureStagingContentRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS document_indexes (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        staging_document_id TEXT NOT NULL UNIQUE,
        document_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        raw_artifact_id TEXT NOT NULL,
        conversion_run_id TEXT NOT NULL UNIQUE,
        content_sha256 TEXT NOT NULL,
        language_code TEXT,
        keywords_json TEXT NOT NULL,
        statistics_json TEXT NOT NULL,
        chunk_count INTEGER NOT NULL CHECK (chunk_count > 0),
        document_json TEXT NOT NULL,
        indexed_at TEXT NOT NULL,
        FOREIGN KEY (staging_document_id) REFERENCES staging_documents(id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS document_chunks (
        id TEXT PRIMARY KEY,
        document_index_id TEXT NOT NULL,
        staging_document_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
        heading_path_json TEXT NOT NULL,
        start_line INTEGER NOT NULL CHECK (start_line > 0),
        end_line INTEGER NOT NULL CHECK (end_line >= start_line),
        content_sha256 TEXT NOT NULL,
        content_text TEXT NOT NULL,
        character_count INTEGER NOT NULL CHECK (character_count > 0),
        word_count INTEGER NOT NULL CHECK (word_count >= 0),
        keywords_json TEXT NOT NULL,
        document_json TEXT NOT NULL,
        FOREIGN KEY (document_index_id) REFERENCES document_indexes(id),
        UNIQUE (document_index_id, ordinal)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS document_chunk_terms (
        term TEXT NOT NULL,
        chunk_id TEXT NOT NULL,
        term_frequency INTEGER NOT NULL CHECK (term_frequency > 0),
        PRIMARY KEY (term, chunk_id),
        FOREIGN KEY (chunk_id) REFERENCES document_chunks(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_document_indexes_workspace_source
        ON document_indexes(workspace_id, source_id, indexed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_document_chunks_workspace_source
        ON document_chunks(workspace_id, source_id, document_index_id, ordinal);
      CREATE INDEX IF NOT EXISTS idx_document_chunk_terms_chunk
        ON document_chunk_terms(chunk_id, term);
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

export class SqliteDocumentIndexRegistryRepository implements DocumentIndexRegistryRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    ensureDocumentIndexRegistry(database);
  }

  persistVerified(index: DocumentIndexV1): PersistDocumentIndexResult {
    if (!isDocumentIndexV1(index)) {
      throw new RegistryValidationError("DocumentIndex does not satisfy Document Index v1");
    }
    const staging = this.database
      .prepare(
        `SELECT workspace_id, source_id, raw_artifact_id, conversion_run_id, content_sha256, status
         FROM staging_documents WHERE id = ?`,
      )
      .get(index.stagingDocumentId) as
      | {
          workspace_id: string;
          source_id: string;
          raw_artifact_id: string;
          conversion_run_id: string;
          content_sha256: string;
          status: string;
        }
      | undefined;
    if (!staging) {
      throw new RegistryError(
        "STAGING_DOCUMENT_NOT_FOUND",
        `Staging document ${index.stagingDocumentId} was not found`,
      );
    }
    if (staging.status !== "READY") {
      throw new RegistryConflictError(
        "DOCUMENT_INDEX_STAGING_NOT_READY",
        "Only verified READY Staging documents may be indexed",
      );
    }
    if (
      staging.workspace_id !== index.workspaceId ||
      staging.source_id !== index.sourceId ||
      staging.raw_artifact_id !== index.rawArtifactId ||
      staging.conversion_run_id !== index.conversionRunId ||
      staging.content_sha256 !== index.contentSha256
    ) {
      throw new RegistryConflictError(
        "DOCUMENT_INDEX_PROVENANCE_MISMATCH",
        "DocumentIndex provenance does not match verified Staging evidence",
      );
    }

    const existing = this.getByStagingDocument(index.stagingDocumentId, index.workspaceId);
    if (existing) {
      if (existing.index.id !== index.id || existing.index.contentSha256 !== index.contentSha256) {
        throw new RegistryConflictError(
          "DOCUMENT_INDEX_IMMUTABILITY_CONFLICT",
          "Staging document is already bound to a different immutable index",
        );
      }
      return { record: existing, replayed: true };
    }

    const indexedAt = this.clock().toISOString();
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database
        .prepare(
          `INSERT INTO document_indexes
           (id, workspace_id, staging_document_id, document_id, source_id, raw_artifact_id,
            conversion_run_id, content_sha256, language_code, keywords_json, statistics_json,
            chunk_count, document_json, indexed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          index.id,
          index.workspaceId,
          index.stagingDocumentId,
          index.documentId,
          index.sourceId,
          index.rawArtifactId,
          index.conversionRunId,
          index.contentSha256,
          index.languageHint.code,
          JSON.stringify(index.keywords),
          JSON.stringify(index.statistics),
          index.chunks.length,
          JSON.stringify(index),
          indexedAt,
        );
      const insertChunk = this.database.prepare(
        `INSERT INTO document_chunks
         (id, document_index_id, staging_document_id, workspace_id, source_id, ordinal,
          heading_path_json, start_line, end_line, content_sha256, content_text,
          character_count, word_count, keywords_json, document_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertTerm = this.database.prepare(
        `INSERT INTO document_chunk_terms (term, chunk_id, term_frequency) VALUES (?, ?, ?)`,
      );
      for (const chunk of index.chunks) {
        insertChunk.run(
          chunk.id,
          index.id,
          chunk.stagingDocumentId,
          chunk.workspaceId,
          chunk.sourceId,
          chunk.ordinal,
          JSON.stringify(chunk.headingPath),
          chunk.startLine,
          chunk.endLine,
          chunk.contentSha256,
          chunk.text,
          chunk.characterCount,
          chunk.wordCount,
          JSON.stringify(chunk.keywords),
          JSON.stringify(chunk),
        );
        for (const [term, frequency] of termFrequencies(chunk)) {
          insertTerm.run(term, chunk.id, frequency);
        }
      }
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
    return { record: { index, indexedAt }, replayed: false };
  }

  getByStagingDocument(
    stagingDocumentId: string,
    workspaceId: string,
  ): DocumentIndexRecord | null {
    const row = this.database
      .prepare(
        `SELECT document_json, indexed_at FROM document_indexes
         WHERE staging_document_id = ? AND workspace_id = ?`,
      )
      .get(stagingDocumentId, workspaceId) as
      | { document_json: string; indexed_at: string }
      | undefined;
    return row ? { index: parseIndex(row.document_json), indexedAt: row.indexed_at } : null;
  }

  listChunks(documentIndexId: string, workspaceId: string): RetrievalChunkV1[] {
    const rows = this.database
      .prepare(
        `SELECT document_json FROM document_chunks
         WHERE document_index_id = ? AND workspace_id = ? ORDER BY ordinal ASC`,
      )
      .all(documentIndexId, workspaceId) as Array<{ document_json: string }>;
    return rows.map((row) => parseChunk(row.document_json));
  }

  searchTerms(filters: IndexedChunkSearchFilters): IndexedChunkSearchHit[] {
    const limit = normalizeLimit(filters.limit);
    const terms = [...new Set(lexicalTokens(filters.query))].slice(0, 32);
    if (terms.length === 0) return [];
    const placeholders = terms.map(() => "?").join(", ");
    const sourceClause = filters.sourceId ? "AND c.source_id = ?" : "";
    const parameters: Array<string | number> = [
      ...terms,
      filters.workspaceId,
      ...(filters.sourceId ? [filters.sourceId] : []),
      limit,
    ];
    const rows = this.database
      .prepare(
        `SELECT c.document_json, SUM(t.term_frequency) AS score
         FROM document_chunk_terms t
         JOIN document_chunks c ON c.id = t.chunk_id
         WHERE t.term IN (${placeholders}) AND c.workspace_id = ? ${sourceClause}
         GROUP BY c.id, c.document_index_id, c.ordinal
         ORDER BY score DESC, c.document_index_id ASC, c.ordinal ASC
         LIMIT ?`,
      )
      .all(...parameters) as Array<{ document_json: string; score: number }>;
    return rows.map((row) => ({ chunk: parseChunk(row.document_json), score: Number(row.score) }));
  }
}
