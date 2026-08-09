import { createHash } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  CHANGE_FEED_PROTOCOL_VERSION,
  type DocumentChangeEvent,
  type DocumentChangeFeedRequest,
  type DocumentChangeFeedResult,
  type DocumentChangeKind,
  type DocumentChangeSummary,
  type DocumentSectionChange,
  type DocumentVersionDiff,
  type RetrievalChunk,
  type RetrievalDocument,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";
import { ensureRetrievalIndex } from "./retrieval-index";

const MIGRATION_ID = "0016_document_change_feed";
const MAX_LIMIT = 100;
const CURSOR = /^cf_(\d+)$/;

export type RecordIndexedVersionResult = {
  event: DocumentChangeEvent | null;
  replayed: boolean;
};

export interface DocumentChangeFeedRepository {
  recordIndexedVersion(
    document: RetrievalDocument,
    chunks: RetrievalChunk[],
  ): RecordIndexedVersionResult;
  feed(request: DocumentChangeFeedRequest): DocumentChangeFeedResult;
  compareVersions(
    workspaceId: string,
    documentId: string,
    fromVersion: number | null,
    toVersion: number,
  ): DocumentVersionDiff;
}

type SectionSnapshot = {
  key: string;
  headingPath: string[];
  chunkIds: string[];
  text: string;
  contentSha256: string;
  firstOrdinal: number;
};

type OrderedSectionChange = {
  order: number;
  key: string;
  change: Omit<DocumentSectionChange, "ordinal">;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeLimit(value?: number): number {
  if (value === undefined) return 50;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RegistryValidationError("change feed limit must be a positive integer");
  }
  return Math.min(value, MAX_LIMIT);
}

function cursorSequence(value?: string): number {
  if (!value) return 0;
  const match = CURSOR.exec(value);
  if (!match) throw new RegistryValidationError("change feed cursor is invalid");
  const sequence = Number(match[1]);
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new RegistryValidationError("change feed cursor is invalid");
  }
  return sequence;
}

function chunkRow(row: Record<string, unknown>): RetrievalChunk {
  return {
    protocolVersion: "1.0",
    objectType: "RETRIEVAL_CHUNK",
    chunkId: String(row.chunk_id),
    documentId: String(row.document_id),
    stagingDocumentId: String(row.staging_document_id),
    artifactVersion: Number(row.artifact_version),
    ordinal: Number(row.ordinal),
    headingPath: JSON.parse(String(row.heading_path_json)) as string[],
    text: String(row.text),
    contentSha256: String(row.content_sha256),
  };
}

function documentRow(row: Record<string, unknown>): RetrievalDocument {
  return {
    protocolVersion: "1.0",
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
    authorityLevel: String(row.authority_level) as RetrievalDocument["authorityLevel"],
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

const DOCUMENT_COLUMNS = `
  staging_document_id, workspace_id, document_id, source_id, ready_package_id,
  raw_artifact_id, logical_document_id, artifact_version, title, target_path,
  canonical_uri, source_uri, source_name, source_category, authority_level,
  jurisdictions_json, languages_json, captured_at, published_at, content_sha256,
  keywords_json, chunk_count, indexed_at, is_current`;

function snapshots(chunks: RetrievalChunk[]): SectionSnapshot[] {
  const ordered = [...chunks].sort((left, right) => left.ordinal - right.ordinal);
  const sections: SectionSnapshot[] = [];
  const occurrences = new Map<string, number>();
  let current: { pathJson: string; chunks: RetrievalChunk[]; occurrence: number } | null = null;

  const flush = () => {
    if (!current || current.chunks.length === 0) return;
    const headingPath = [...current.chunks[0]!.headingPath];
    const text = current.chunks.map((chunk) => chunk.text).join("\n\n");
    sections.push({
      key: `${current.pathJson}#${current.occurrence}`,
      headingPath,
      chunkIds: current.chunks.map((chunk) => chunk.chunkId),
      text,
      contentSha256: sha256(text),
      firstOrdinal: current.chunks[0]!.ordinal,
    });
  };

  for (const chunk of ordered) {
    const pathJson = JSON.stringify(chunk.headingPath);
    if (!current || current.pathJson !== pathJson) {
      flush();
      const occurrence = (occurrences.get(pathJson) ?? 0) + 1;
      occurrences.set(pathJson, occurrence);
      current = { pathJson, chunks: [chunk], occurrence };
    } else {
      current.chunks.push(chunk);
    }
  }
  flush();
  return sections;
}

function sectionDiff(
  beforeChunks: RetrievalChunk[],
  afterChunks: RetrievalChunk[],
): DocumentSectionChange[] {
  const before = snapshots(beforeChunks);
  const after = snapshots(afterChunks);
  const beforeMap = new Map(before.map((section) => [section.key, section]));
  const afterMap = new Map(after.map((section) => [section.key, section]));
  const ordered: OrderedSectionChange[] = [];

  for (const key of new Set([...beforeMap.keys(), ...afterMap.keys()])) {
    const previous = beforeMap.get(key);
    const next = afterMap.get(key);
    if (previous && next && previous.contentSha256 === next.contentSha256) continue;
    const kind = previous ? (next ? "MODIFIED" : "REMOVED") : "ADDED";
    ordered.push({
      key,
      order: next?.firstOrdinal ?? previous?.firstOrdinal ?? Number.MAX_SAFE_INTEGER,
      change: {
        changeKind: kind,
        headingPath: [...(next?.headingPath ?? previous?.headingPath ?? [])],
        beforeChunkIds: previous?.chunkIds ?? [],
        afterChunkIds: next?.chunkIds ?? [],
        beforeContentSha256: previous?.contentSha256 ?? null,
        afterContentSha256: next?.contentSha256 ?? null,
        beforeText: previous?.text ?? null,
        afterText: next?.text ?? null,
      },
    });
  }

  ordered.sort((left, right) => left.order - right.order || left.key.localeCompare(right.key));
  return ordered.map((entry, index) => ({ ordinal: index + 1, ...entry.change }));
}

function summary(sections: DocumentSectionChange[]): DocumentChangeSummary {
  const addedSections = sections.filter((section) => section.changeKind === "ADDED").length;
  const removedSections = sections.filter((section) => section.changeKind === "REMOVED").length;
  const modifiedSections = sections.filter((section) => section.changeKind === "MODIFIED").length;
  return {
    addedSections,
    removedSections,
    modifiedSections,
    changedSections: addedSections + removedSections + modifiedSections,
  };
}

function classifyChange(
  previous: RetrievalDocument | null,
  sections: DocumentSectionChange[],
): DocumentChangeKind {
  if (!previous) return "CREATED";
  return sections.length === 0 ? "UNCHANGED" : "UPDATED";
}

function eventId(
  workspaceId: string,
  documentId: string,
  previous: RetrievalDocument | null,
  current: RetrievalDocument,
): string {
  return `dce_${sha256(
    `${workspaceId}\u0000${documentId}\u0000${previous?.stagingDocumentId ?? ""}\u0000${current.stagingDocumentId}\u0000${current.contentSha256}`,
  ).slice(0, 32)}`;
}

function eventRow(row: Record<string, unknown>): DocumentChangeEvent {
  return {
    protocolVersion: CHANGE_FEED_PROTOCOL_VERSION,
    objectType: "DOCUMENT_CHANGE_EVENT",
    id: String(row.id),
    sequence: Number(row.sequence),
    workspaceId: String(row.workspace_id),
    documentId: String(row.document_id),
    logicalDocumentId: row.logical_document_id === null ? null : String(row.logical_document_id),
    sourceId: String(row.source_id),
    changeKind: String(row.change_kind) as DocumentChangeKind,
    fromVersion: row.from_version === null ? null : Number(row.from_version),
    toVersion: Number(row.to_version),
    fromStagingDocumentId:
      row.from_staging_document_id === null ? null : String(row.from_staging_document_id),
    toStagingDocumentId: String(row.to_staging_document_id),
    fromContentSha256: row.from_content_sha256 === null ? null : String(row.from_content_sha256),
    toContentSha256: String(row.to_content_sha256),
    summary: {
      addedSections: Number(row.added_sections),
      removedSections: Number(row.removed_sections),
      modifiedSections: Number(row.modified_sections),
      changedSections: Number(row.changed_sections),
    },
    observedAt: String(row.observed_at),
  };
}

export function ensureDocumentChangeFeed(database: DatabaseSync): void {
  initializeRegistry(database);
  ensureRetrievalIndex(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS document_change_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        workspace_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        logical_document_id TEXT,
        source_id TEXT NOT NULL,
        change_kind TEXT NOT NULL CHECK (change_kind IN ('CREATED','UPDATED','UNCHANGED')),
        from_version INTEGER,
        to_version INTEGER NOT NULL CHECK (to_version > 0),
        from_staging_document_id TEXT,
        to_staging_document_id TEXT NOT NULL UNIQUE,
        from_content_sha256 TEXT,
        to_content_sha256 TEXT NOT NULL,
        added_sections INTEGER NOT NULL CHECK (added_sections >= 0),
        removed_sections INTEGER NOT NULL CHECK (removed_sections >= 0),
        modified_sections INTEGER NOT NULL CHECK (modified_sections >= 0),
        changed_sections INTEGER NOT NULL CHECK (changed_sections >= 0),
        observed_at TEXT NOT NULL,
        UNIQUE (workspace_id, document_id, to_version)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS document_change_sections (
        event_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL CHECK (ordinal > 0),
        change_kind TEXT NOT NULL CHECK (change_kind IN ('ADDED','REMOVED','MODIFIED')),
        heading_path_json TEXT NOT NULL,
        before_chunk_ids_json TEXT NOT NULL,
        after_chunk_ids_json TEXT NOT NULL,
        before_content_sha256 TEXT,
        after_content_sha256 TEXT,
        before_text TEXT,
        after_text TEXT,
        PRIMARY KEY (event_id, ordinal),
        FOREIGN KEY (event_id) REFERENCES document_change_events(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_document_change_feed_workspace_sequence
        ON document_change_events(workspace_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_document_change_feed_source
        ON document_change_events(workspace_id, source_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_document_change_feed_document
        ON document_change_events(workspace_id, document_id, to_version);
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

export class SqliteDocumentChangeFeedRepository implements DocumentChangeFeedRepository {
  constructor(private readonly database: DatabaseSync) {
    ensureDocumentChangeFeed(database);
  }

  recordIndexedVersion(
    document: RetrievalDocument,
    chunks: RetrievalChunk[],
  ): RecordIndexedVersionResult {
    if (!document.isCurrent) return { event: null, replayed: false };
    if (
      chunks.some(
        (chunk) =>
          chunk.stagingDocumentId !== document.stagingDocumentId ||
          chunk.documentId !== document.documentId ||
          chunk.artifactVersion !== document.artifactVersion,
      )
    ) {
      throw new RegistryConflictError(
        "CHANGE_FEED_CHUNK_PROVENANCE_MISMATCH",
        "Retrieval chunks do not belong to the indexed document version",
      );
    }
    const replay = this.database
      .prepare("SELECT * FROM document_change_events WHERE to_staging_document_id = ?")
      .get(document.stagingDocumentId) as Record<string, unknown> | undefined;
    if (replay) return { event: eventRow(replay), replayed: true };

    const previous = this.previousDocument(document);
    const beforeChunks = previous
      ? this.loadChunks(previous.stagingDocumentId, document.workspaceId)
      : [];
    const sections = sectionDiff(beforeChunks, chunks);
    const kind = classifyChange(previous, sections);
    const persistedSections = kind === "UNCHANGED" ? [] : sections;
    const changeSummary = summary(persistedSections);
    const id = eventId(document.workspaceId, document.documentId, previous, document);

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const insert = this.database
        .prepare(
          `INSERT INTO document_change_events
           (id, workspace_id, document_id, logical_document_id, source_id, change_kind,
            from_version, to_version, from_staging_document_id, to_staging_document_id,
            from_content_sha256, to_content_sha256, added_sections, removed_sections,
            modified_sections, changed_sections, observed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          document.workspaceId,
          document.documentId,
          document.logicalDocumentId,
          document.sourceId,
          kind,
          previous?.artifactVersion ?? null,
          document.artifactVersion,
          previous?.stagingDocumentId ?? null,
          document.stagingDocumentId,
          previous?.contentSha256 ?? null,
          document.contentSha256,
          changeSummary.addedSections,
          changeSummary.removedSections,
          changeSummary.modifiedSections,
          changeSummary.changedSections,
          document.indexedAt,
        );
      const insertSection = this.database.prepare(
        `INSERT INTO document_change_sections
         (event_id, ordinal, change_kind, heading_path_json, before_chunk_ids_json,
          after_chunk_ids_json, before_content_sha256, after_content_sha256, before_text, after_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const section of persistedSections) {
        insertSection.run(
          id,
          section.ordinal,
          section.changeKind,
          JSON.stringify(section.headingPath),
          JSON.stringify(section.beforeChunkIds),
          JSON.stringify(section.afterChunkIds),
          section.beforeContentSha256,
          section.afterContentSha256,
          section.beforeText,
          section.afterText,
        );
      }
      const sequence = Number(insert.lastInsertRowid);
      const row = this.database
        .prepare("SELECT * FROM document_change_events WHERE sequence = ?")
        .get(sequence) as Record<string, unknown> | undefined;
      if (!row) {
        throw new RegistryError("CHANGE_FEED_WRITE_FAILED", "Change event was not persisted");
      }
      const event = eventRow(row);
      this.database.exec("COMMIT;");
      return { event, replayed: false };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  feed(request: DocumentChangeFeedRequest): DocumentChangeFeedResult {
    const workspaceId = request.workspaceId.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    const after = cursorSequence(request.cursor);
    const limit = normalizeLimit(request.limit);
    const clauses = ["workspace_id = ?", "sequence > ?"];
    const values: SQLInputValue[] = [workspaceId, after];
    if (request.sourceId?.trim()) {
      clauses.push("source_id = ?");
      values.push(request.sourceId.trim());
    }
    if (request.documentId?.trim()) {
      clauses.push("document_id = ?");
      values.push(request.documentId.trim());
    }
    const rows = this.database
      .prepare(
        `SELECT * FROM document_change_events
         WHERE ${clauses.join(" AND ")}
         ORDER BY sequence ASC LIMIT ?`,
      )
      .all(...values, limit) as Record<string, unknown>[];
    const items = rows.map(eventRow);
    return {
      protocolVersion: CHANGE_FEED_PROTOCOL_VERSION,
      objectType: "DOCUMENT_CHANGE_FEED_RESULT",
      items,
      nextCursor: items.length > 0 ? `cf_${items[items.length - 1]!.sequence}` : null,
    };
  }

  compareVersions(
    workspaceId: string,
    documentId: string,
    fromVersion: number | null,
    toVersion: number,
  ): DocumentVersionDiff {
    if (!workspaceId.trim() || !documentId.trim()) {
      throw new RegistryValidationError("workspaceId and documentId are required");
    }
    if (!Number.isSafeInteger(toVersion) || toVersion <= 0) {
      throw new RegistryValidationError("toVersion must be a positive integer");
    }
    if (fromVersion !== null && (!Number.isSafeInteger(fromVersion) || fromVersion <= 0)) {
      throw new RegistryValidationError("fromVersion must be null or a positive integer");
    }
    if (fromVersion !== null && fromVersion >= toVersion) {
      throw new RegistryValidationError("fromVersion must be lower than toVersion");
    }

    const current = this.requireDocument(workspaceId, documentId, toVersion);
    const previous =
      fromVersion === null ? null : this.requireDocument(workspaceId, documentId, fromVersion);
    if (previous && previous.sourceId !== current.sourceId) {
      throw new RegistryConflictError(
        "CHANGE_FEED_SOURCE_MISMATCH",
        "Compared document versions belong to different sources",
      );
    }
    const beforeChunks = previous ? this.loadChunks(previous.stagingDocumentId, workspaceId) : [];
    const afterChunks = this.loadChunks(current.stagingDocumentId, workspaceId);
    const rawSections = sectionDiff(beforeChunks, afterChunks);
    const kind = classifyChange(previous, rawSections);
    const sections = kind === "UNCHANGED" ? [] : rawSections;
    return {
      protocolVersion: CHANGE_FEED_PROTOCOL_VERSION,
      objectType: "DOCUMENT_VERSION_DIFF",
      workspaceId,
      documentId,
      logicalDocumentId: current.logicalDocumentId,
      sourceId: current.sourceId,
      changeKind: kind,
      fromVersion,
      toVersion,
      fromContentSha256: previous?.contentSha256 ?? null,
      toContentSha256: current.contentSha256,
      summary: summary(sections),
      sections,
    };
  }

  private previousDocument(document: RetrievalDocument): RetrievalDocument | null {
    const row = this.database
      .prepare(
        `SELECT ${DOCUMENT_COLUMNS} FROM retrieval_documents
         WHERE workspace_id = ? AND document_id = ? AND artifact_version < ?
         ORDER BY artifact_version DESC LIMIT 1`,
      )
      .get(document.workspaceId, document.documentId, document.artifactVersion) as
      | Record<string, unknown>
      | undefined;
    return row ? documentRow(row) : null;
  }

  private requireDocument(
    workspaceId: string,
    documentId: string,
    artifactVersion: number,
  ): RetrievalDocument {
    const row = this.database
      .prepare(
        `SELECT ${DOCUMENT_COLUMNS} FROM retrieval_documents
         WHERE workspace_id = ? AND document_id = ? AND artifact_version = ?`,
      )
      .get(workspaceId, documentId, artifactVersion) as Record<string, unknown> | undefined;
    if (!row) {
      throw new RegistryError(
        "CHANGE_FEED_VERSION_NOT_FOUND",
        `Retrieval document ${documentId} version ${artifactVersion} was not found`,
      );
    }
    return documentRow(row);
  }

  private loadChunks(stagingDocumentId: string, workspaceId: string): RetrievalChunk[] {
    const rows = this.database
      .prepare(
        `SELECT c.* FROM retrieval_chunks c
         JOIN retrieval_documents d ON d.staging_document_id = c.staging_document_id
         WHERE c.staging_document_id = ? AND d.workspace_id = ? ORDER BY c.ordinal ASC`,
      )
      .all(stagingDocumentId, workspaceId) as Record<string, unknown>[];
    return rows.map(chunkRow);
  }
}
