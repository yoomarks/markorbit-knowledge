import type { DatabaseSync } from "node:sqlite";
import { RegistryValidationError } from "@markorbit/persistence";

export type SourceChangeAlert = {
  sourceId: string;
  sourceName: string;
  changedDocuments: number;
  updateEvents: number;
  changedSections: number;
  latestObservedAt: string;
  latestDocumentId: string;
  latestVersion: number;
  latestSummary: {
    addedSections: number;
    removedSections: number;
    modifiedSections: number;
    changedSections: number;
  };
};

export type SourceChangeAlertSummary = {
  windowHours: number;
  changedSources: number;
  changedDocuments: number;
  updateEvents: number;
  changedSections: number;
  alerts: SourceChangeAlert[];
};

const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_LIMIT = 8;
const MAX_WINDOW_HOURS = 24 * 30;
const MAX_LIMIT = 50;

function tableExists(database: DatabaseSync, tableName: string): boolean {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName),
  );
}

function emptySummary(windowHours: number): SourceChangeAlertSummary {
  return {
    windowHours,
    changedSources: 0,
    changedDocuments: 0,
    updateEvents: 0,
    changedSections: 0,
    alerts: [],
  };
}

export function listSourceChangeAlerts(
  database: DatabaseSync,
  workspaceId: string,
  options: { windowHours?: number; limit?: number; observedAt?: Date } = {},
): SourceChangeAlertSummary {
  const normalizedWorkspaceId = workspaceId.trim();
  if (!normalizedWorkspaceId) throw new RegistryValidationError("workspaceId is required");

  const windowHours = options.windowHours ?? DEFAULT_WINDOW_HOURS;
  if (!Number.isInteger(windowHours) || windowHours < 1 || windowHours > MAX_WINDOW_HOURS) {
    throw new RegistryValidationError(
      `windowHours must be an integer from 1 to ${MAX_WINDOW_HOURS}`,
    );
  }
  const limit = options.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new RegistryValidationError(`limit must be an integer from 1 to ${MAX_LIMIT}`);
  }
  const observedAt = options.observedAt ?? new Date();
  if (Number.isNaN(observedAt.getTime())) {
    throw new RegistryValidationError("observedAt must be a valid Date");
  }
  if (
    !tableExists(database, "document_change_events") ||
    !tableExists(database, "source_definitions")
  ) {
    return emptySummary(windowHours);
  }

  const sinceAt = new Date(observedAt.getTime() - windowHours * 60 * 60 * 1_000).toISOString();
  const totals = database
    .prepare(
      `SELECT COUNT(DISTINCT source_id) AS changedSources,
              COUNT(DISTINCT document_id) AS changedDocuments,
              COUNT(*) AS updateEvents,
              COALESCE(SUM(changed_sections), 0) AS changedSections
       FROM document_change_events
       WHERE workspace_id = ? AND change_kind = 'UPDATED' AND observed_at >= ?`,
    )
    .get(normalizedWorkspaceId, sinceAt) as {
    changedSources: number;
    changedDocuments: number;
    updateEvents: number;
    changedSections: number;
  };

  if (Number(totals.updateEvents) === 0) return emptySummary(windowHours);

  const rows = database
    .prepare(
      `WITH recent AS (
         SELECT e.*,
                ROW_NUMBER() OVER (
                  PARTITION BY e.source_id
                  ORDER BY e.observed_at DESC, e.sequence DESC
                ) AS source_rank
         FROM document_change_events e
         WHERE e.workspace_id = ? AND e.change_kind = 'UPDATED' AND e.observed_at >= ?
       ), aggregated AS (
         SELECT source_id AS sourceId,
                COUNT(DISTINCT document_id) AS changedDocuments,
                COUNT(*) AS updateEvents,
                COALESCE(SUM(changed_sections), 0) AS changedSections,
                MAX(observed_at) AS latestObservedAt
         FROM recent
         GROUP BY source_id
       )
       SELECT a.sourceId,
              COALESCE(s.name, a.sourceId) AS sourceName,
              a.changedDocuments,
              a.updateEvents,
              a.changedSections,
              a.latestObservedAt,
              r.document_id AS latestDocumentId,
              r.to_version AS latestVersion,
              r.added_sections AS addedSections,
              r.removed_sections AS removedSections,
              r.modified_sections AS modifiedSections,
              r.changed_sections AS latestChangedSections
       FROM aggregated a
       JOIN recent r ON r.source_id = a.sourceId AND r.source_rank = 1
       LEFT JOIN source_definitions s ON s.id = a.sourceId AND s.workspace_id = ?
       ORDER BY a.latestObservedAt DESC, a.changedSections DESC, a.sourceId ASC
       LIMIT ?`,
    )
    .all(normalizedWorkspaceId, sinceAt, normalizedWorkspaceId, limit) as Array<{
    sourceId: string;
    sourceName: string;
    changedDocuments: number;
    updateEvents: number;
    changedSections: number;
    latestObservedAt: string;
    latestDocumentId: string;
    latestVersion: number;
    addedSections: number;
    removedSections: number;
    modifiedSections: number;
    latestChangedSections: number;
  }>;

  return {
    windowHours,
    changedSources: Number(totals.changedSources),
    changedDocuments: Number(totals.changedDocuments),
    updateEvents: Number(totals.updateEvents),
    changedSections: Number(totals.changedSections),
    alerts: rows.map((row) => ({
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      changedDocuments: Number(row.changedDocuments),
      updateEvents: Number(row.updateEvents),
      changedSections: Number(row.changedSections),
      latestObservedAt: row.latestObservedAt,
      latestDocumentId: row.latestDocumentId,
      latestVersion: Number(row.latestVersion),
      latestSummary: {
        addedSections: Number(row.addedSections),
        removedSections: Number(row.removedSections),
        modifiedSections: Number(row.modifiedSections),
        changedSections: Number(row.latestChangedSections),
      },
    })),
  };
}
