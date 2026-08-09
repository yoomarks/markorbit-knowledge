import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { RegistryValidationError } from "./index";
import { ensureRawArtifactRegistry } from "./raw-artifact-registry";
import { ensureReadyPackageRegistry } from "./ready-package-registry";
import { ensureRetrievalIndex } from "./retrieval-index";
import { ensureStagingContentRegistry } from "./staging-content-registry";

export const RETRIEVAL_QUALITY_AUDIT_PROTOCOL_VERSION = "1.0" as const;

export type RetrievalQualityState = "READY" | "DEGRADED" | "BLOCKED";

export type RetrievalQualityGap =
  | "STAGING_DOCUMENT_MISSING"
  | "READY_PACKAGE_MISSING"
  | "RAW_ARTIFACT_MISSING"
  | "PROVENANCE_LINK_MISMATCH"
  | "MULTIPLE_CURRENT_VERSIONS"
  | "CURRENT_VERSION_NOT_LATEST"
  | "NO_CHUNKS"
  | "CHUNK_COUNT_MISMATCH"
  | "CHUNK_ORDINAL_GAP"
  | "EMPTY_CHUNK"
  | "FTS_ROW_COUNT_MISMATCH"
  | "DUPLICATE_CHUNK_CONTENT";

export type RetrievalQualityAuditFilters = {
  workspaceId: string;
  sourceId?: string;
  jurisdiction?: string;
  includeHistorical?: boolean;
};

export type RetrievalQualityAuditRecord = {
  protocolVersion: typeof RETRIEVAL_QUALITY_AUDIT_PROTOCOL_VERSION;
  objectType: "RETRIEVAL_QUALITY_AUDIT";
  workspaceId: string;
  sourceId: string;
  documentId: string;
  stagingDocumentId: string;
  readyPackageId: string;
  rawArtifactId: string;
  artifactVersion: number;
  title: string;
  jurisdictions: string[];
  isCurrent: boolean;
  state: RetrievalQualityState;
  gaps: RetrievalQualityGap[];
  metrics: {
    declaredChunkCount: number;
    actualChunkCount: number;
    distinctChunkTexts: number;
    emptyChunkCount: number;
    ftsRowCount: number;
    firstOrdinal: number | null;
    lastOrdinal: number | null;
    currentVersionCount: number;
    latestArtifactVersion: number;
  };
  auditedAt: string;
};

export type RetrievalQualityAuditSummary = {
  total: number;
  byState: Record<RetrievalQualityState, number>;
  gapCounts: Partial<Record<RetrievalQualityGap, number>>;
};

export type RetrievalQualityAuditResult = {
  protocolVersion: typeof RETRIEVAL_QUALITY_AUDIT_PROTOCOL_VERSION;
  objectType: "RETRIEVAL_QUALITY_AUDIT_LIST";
  filters: RetrievalQualityAuditFilters;
  summary: RetrievalQualityAuditSummary;
  items: RetrievalQualityAuditRecord[];
  auditedAt: string;
};

type DocumentRow = {
  workspace_id: string;
  source_id: string;
  document_id: string;
  staging_document_id: string;
  ready_package_id: string;
  raw_artifact_id: string;
  artifact_version: number;
  title: string;
  jurisdictions_json: string;
  chunk_count: number;
  is_current: number;
  staging_exists: string | null;
  ready_exists: string | null;
  raw_exists: string | null;
  ready_staging_document_id: string | null;
  ready_raw_artifact_id: string | null;
  ready_source_id: string | null;
  current_version_count: number;
  latest_artifact_version: number;
};

type ChunkMetricsRow = {
  actual_count: number;
  distinct_text_count: number;
  empty_count: number;
  first_ordinal: number | null;
  last_ordinal: number | null;
  distinct_ordinal_count: number;
};

function summarize(items: readonly RetrievalQualityAuditRecord[]): RetrievalQualityAuditSummary {
  const summary: RetrievalQualityAuditSummary = {
    total: items.length,
    byState: { READY: 0, DEGRADED: 0, BLOCKED: 0 },
    gapCounts: {},
  };
  for (const item of items) {
    summary.byState[item.state] += 1;
    for (const gap of item.gaps) summary.gapCounts[gap] = (summary.gapCounts[gap] ?? 0) + 1;
  }
  return summary;
}

function deriveState(gaps: readonly RetrievalQualityGap[]): RetrievalQualityState {
  if (gaps.length === 0) return "READY";
  return gaps.every((gap) => gap === "DUPLICATE_CHUNK_CONTENT") ? "DEGRADED" : "BLOCKED";
}

export class SqliteRetrievalQualityAuditRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    ensureRawArtifactRegistry(database);
    ensureStagingContentRegistry(database);
    ensureReadyPackageRegistry(database);
    ensureRetrievalIndex(database);
  }

  list(filters: RetrievalQualityAuditFilters): RetrievalQualityAuditResult {
    const workspaceId = filters.workspaceId.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    const sourceId = filters.sourceId?.trim() || undefined;
    const jurisdiction = filters.jurisdiction?.trim() || undefined;
    const includeHistorical = filters.includeHistorical === true;
    const auditedAt = this.clock().toISOString();

    const clauses = ["d.workspace_id = ?"];
    const values: SQLInputValue[] = [workspaceId];
    if (!includeHistorical) clauses.push("d.is_current = 1");
    if (sourceId) {
      clauses.push("d.source_id = ?");
      values.push(sourceId);
    }
    if (jurisdiction) {
      clauses.push("EXISTS (SELECT 1 FROM json_each(d.jurisdictions_json) WHERE value = ?)");
      values.push(jurisdiction);
    }

    const rows = this.database
      .prepare(
        `SELECT d.*,
                sd.id AS staging_exists,
                rp.id AS ready_exists,
                ra.id AS raw_exists,
                rp.staging_document_id AS ready_staging_document_id,
                rp.raw_artifact_id AS ready_raw_artifact_id,
                rp.source_id AS ready_source_id,
                (SELECT COUNT(*) FROM retrieval_documents c
                  WHERE c.workspace_id = d.workspace_id
                    AND c.document_id = d.document_id
                    AND c.is_current = 1) AS current_version_count,
                (SELECT MAX(v.artifact_version) FROM retrieval_documents v
                  WHERE v.workspace_id = d.workspace_id
                    AND v.document_id = d.document_id) AS latest_artifact_version
           FROM retrieval_documents d
           LEFT JOIN staging_documents sd
             ON sd.id = d.staging_document_id AND sd.workspace_id = d.workspace_id
           LEFT JOIN ready_packages rp
             ON rp.id = d.ready_package_id AND rp.workspace_id = d.workspace_id
           LEFT JOIN raw_artifacts ra
             ON ra.id = d.raw_artifact_id AND ra.workspace_id = d.workspace_id
          WHERE ${clauses.join(" AND ")}
          ORDER BY d.source_id, d.document_id, d.artifact_version DESC`,
      )
      .all(...values) as unknown as DocumentRow[];

    const items = rows.map((row): RetrievalQualityAuditRecord => {
      const chunkMetrics = this.database
        .prepare(
          `SELECT COUNT(*) AS actual_count,
                  COUNT(DISTINCT trim(text)) AS distinct_text_count,
                  COALESCE(SUM(CASE WHEN length(trim(text)) = 0 THEN 1 ELSE 0 END), 0) AS empty_count,
                  MIN(ordinal) AS first_ordinal,
                  MAX(ordinal) AS last_ordinal,
                  COUNT(DISTINCT ordinal) AS distinct_ordinal_count
             FROM retrieval_chunks
            WHERE staging_document_id = ? AND workspace_id = ?`,
        )
        .get(row.staging_document_id, row.workspace_id) as unknown as ChunkMetricsRow;
      const fts = this.database
        .prepare(
          `SELECT COUNT(*) AS total
             FROM retrieval_chunks_fts f
             JOIN retrieval_chunks c ON c.chunk_id = f.chunk_id
            WHERE c.staging_document_id = ? AND c.workspace_id = ?`,
        )
        .get(row.staging_document_id, row.workspace_id) as { total: number };

      const actualChunkCount = Number(chunkMetrics.actual_count);
      const distinctChunkTexts = Number(chunkMetrics.distinct_text_count);
      const emptyChunkCount = Number(chunkMetrics.empty_count);
      const firstOrdinal = chunkMetrics.first_ordinal === null ? null : Number(chunkMetrics.first_ordinal);
      const lastOrdinal = chunkMetrics.last_ordinal === null ? null : Number(chunkMetrics.last_ordinal);
      const distinctOrdinalCount = Number(chunkMetrics.distinct_ordinal_count);
      const ftsRowCount = Number(fts.total);
      const declaredChunkCount = Number(row.chunk_count);
      const currentVersionCount = Number(row.current_version_count);
      const latestArtifactVersion = Number(row.latest_artifact_version);
      const gaps: RetrievalQualityGap[] = [];

      if (!row.staging_exists) gaps.push("STAGING_DOCUMENT_MISSING");
      if (!row.ready_exists) gaps.push("READY_PACKAGE_MISSING");
      if (!row.raw_exists) gaps.push("RAW_ARTIFACT_MISSING");
      if (
        row.ready_exists &&
        (row.ready_staging_document_id !== row.staging_document_id ||
          row.ready_raw_artifact_id !== row.raw_artifact_id ||
          row.ready_source_id !== row.source_id)
      ) {
        gaps.push("PROVENANCE_LINK_MISMATCH");
      }
      if (currentVersionCount > 1) gaps.push("MULTIPLE_CURRENT_VERSIONS");
      if (row.is_current === 1 && Number(row.artifact_version) !== latestArtifactVersion) {
        gaps.push("CURRENT_VERSION_NOT_LATEST");
      }
      if (actualChunkCount === 0) gaps.push("NO_CHUNKS");
      if (declaredChunkCount !== actualChunkCount) gaps.push("CHUNK_COUNT_MISMATCH");
      if (
        actualChunkCount > 0 &&
        (firstOrdinal !== 1 ||
          lastOrdinal !== actualChunkCount ||
          distinctOrdinalCount !== actualChunkCount)
      ) {
        gaps.push("CHUNK_ORDINAL_GAP");
      }
      if (emptyChunkCount > 0) gaps.push("EMPTY_CHUNK");
      if (ftsRowCount !== actualChunkCount) gaps.push("FTS_ROW_COUNT_MISMATCH");
      if (actualChunkCount > 1 && distinctChunkTexts < actualChunkCount) {
        gaps.push("DUPLICATE_CHUNK_CONTENT");
      }

      return {
        protocolVersion: RETRIEVAL_QUALITY_AUDIT_PROTOCOL_VERSION,
        objectType: "RETRIEVAL_QUALITY_AUDIT",
        workspaceId: row.workspace_id,
        sourceId: row.source_id,
        documentId: row.document_id,
        stagingDocumentId: row.staging_document_id,
        readyPackageId: row.ready_package_id,
        rawArtifactId: row.raw_artifact_id,
        artifactVersion: Number(row.artifact_version),
        title: row.title,
        jurisdictions: JSON.parse(row.jurisdictions_json) as string[],
        isCurrent: row.is_current === 1,
        state: deriveState(gaps),
        gaps,
        metrics: {
          declaredChunkCount,
          actualChunkCount,
          distinctChunkTexts,
          emptyChunkCount,
          ftsRowCount,
          firstOrdinal,
          lastOrdinal,
          currentVersionCount,
          latestArtifactVersion,
        },
        auditedAt,
      };
    });

    const normalizedFilters: RetrievalQualityAuditFilters = {
      workspaceId,
      ...(sourceId ? { sourceId } : {}),
      ...(jurisdiction ? { jurisdiction } : {}),
      ...(includeHistorical ? { includeHistorical: true } : {}),
    };
    return {
      protocolVersion: RETRIEVAL_QUALITY_AUDIT_PROTOCOL_VERSION,
      objectType: "RETRIEVAL_QUALITY_AUDIT_LIST",
      filters: normalizedFilters,
      summary: summarize(items),
      items,
      auditedAt,
    };
  }
}
