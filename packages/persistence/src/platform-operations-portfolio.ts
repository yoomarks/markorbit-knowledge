import type { DatabaseSync } from "node:sqlite";
import { RegistryValidationError } from "./index";
import {
  assessStorageOperatingEnvelope,
  type StorageOperatingEnvelopeAssessment,
} from "./storage-operating-envelope";
import { latestStorageRecoveryEvidence, storageRecoveryMetrics } from "./storage-recovery-evidence";

export type PlatformOperationsPortfolio = {
  version: "1.0";
  observedAt: string;
  workspaces: { total: number; byStatus: Record<string, number> };
  sources: { total: number; byStatus: Record<string, number> };
  runs: { total: number; byStatus: Record<string, number> };
  leases: { total: number; active: number; expired: number };
  backlog: { pending: number; retry: number; failed: number; deadLetter: number };
  currentness: {
    retrievalDocuments: number;
    currentRetrievalDocuments: number;
    readyPackages: number;
    latestRetentionExecution: {
      observedAt: string;
      mode: string;
      scanned: number;
      held: number;
      applied: number;
    } | null;
  };
  acquisition: {
    activeFrontierRows: number;
    historicalUrlRows: number;
    campaigns: Record<string, number>;
  };
  storage: {
    pageCount: number;
    pageSize: number;
    freePages: number;
    databaseBytes: number;
    freePageRatio: number;
    walBytes: number;
    backupAgeHours: number | null;
    restoreDrillAgeDays: number | null;
    restoreThroughputMiBPerSecond: number | null;
    recoveryEvidence: {
      id: string;
      evidenceRef: string;
      backupCompletedAt: string;
      restoreCompletedAt: string;
    } | null;
    envelope: StorageOperatingEnvelopeAssessment;
  };
};

function tableExists(database: DatabaseSync, table: string): boolean {
  return Boolean(
    database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(table),
  );
}

function scalar(database: DatabaseSync, sql: string): number {
  const row = database.prepare(sql).get() as Record<string, unknown> | undefined;
  return row ? Number(Object.values(row)[0] ?? 0) : 0;
}

function grouped(database: DatabaseSync, table: string, column: string): Record<string, number> {
  if (!tableExists(database, table)) return {};
  const rows = database
    .prepare(`SELECT ${column} AS key, COUNT(*) AS count FROM ${table} GROUP BY ${column}`)
    .all() as Array<{ key: string | null; count: number }>;
  return Object.fromEntries(rows.map((row) => [String(row.key ?? "UNKNOWN"), Number(row.count)]));
}

function total(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

function workspaceStatuses(database: DatabaseSync): Record<string, number> {
  if (!tableExists(database, "workspaces")) return {};
  const rows = database
    .prepare(
      `SELECT json_extract(document_json, '$.status') AS key, COUNT(*) AS count
       FROM workspaces GROUP BY json_extract(document_json, '$.status')`,
    )
    .all() as Array<{ key: string; count: number }>;
  return Object.fromEntries(rows.map((row) => [row.key, Number(row.count)]));
}

function latestRetention(
  database: DatabaseSync,
): PlatformOperationsPortfolio["currentness"]["latestRetentionExecution"] {
  if (!tableExists(database, "retention_execution_audits")) return null;
  const row = database
    .prepare(
      `SELECT observed_at, mode, document_json FROM retention_execution_audits
       ORDER BY observed_at DESC, id DESC LIMIT 1`,
    )
    .get() as { observed_at: string; mode: string; document_json: string } | undefined;
  if (!row) return null;
  const document = JSON.parse(row.document_json) as Record<string, unknown>;
  return {
    observedAt: row.observed_at,
    mode: row.mode,
    scanned: Number(document.scanned ?? 0),
    held: Number(document.held ?? 0),
    applied: Number(document.applied ?? 0),
  };
}

export function buildPlatformOperationsPortfolio(
  database: DatabaseSync,
  input: {
    observedAt?: Date;
    walBytes?: number;
  } = {},
): PlatformOperationsPortfolio {
  const observed = input.observedAt ?? new Date();
  const observedAt = observed.toISOString();
  const workspaceByStatus = workspaceStatuses(database);
  const sourceByStatus = grouped(database, "source_definitions", "status");
  const runByStatus = grouped(database, "collection_runs", "status");
  const leaseByStatus = grouped(database, "job_leases", "status");
  const jobByStatus = grouped(database, "jobs", "status");
  const campaignStates = grouped(database, "web_url_campaign_lifecycle", "state");
  const pageCount = scalar(database, "PRAGMA page_count");
  const pageSize = scalar(database, "PRAGMA page_size");
  const freePages = scalar(database, "PRAGMA freelist_count");
  const databaseBytes = pageCount * pageSize;
  const freePageRatio = pageCount === 0 ? 0 : freePages / pageCount;
  const activeFrontierRows = tableExists(database, "web_url_catalog")
    ? scalar(
        database,
        tableExists(database, "web_url_campaign_lifecycle")
          ? `SELECT COUNT(*) AS count FROM web_url_catalog u
             LEFT JOIN web_url_campaign_lifecycle c
               ON c.workspace_id = u.workspace_id AND c.campaign_id = u.campaign_id
              AND c.source_key = u.source_key
             WHERE c.state IS NULL OR c.state = 'ACTIVE'`
          : "SELECT COUNT(*) AS count FROM web_url_catalog",
      )
    : 0;
  const walBytes = Math.max(0, input.walBytes ?? 0);
  let recoveryEvidence = null;
  let recoveryEvidenceInvalid = false;
  try {
    recoveryEvidence = latestStorageRecoveryEvidence(database);
  } catch (error) {
    if (error instanceof RegistryValidationError) recoveryEvidenceInvalid = true;
    else throw error;
  }
  const recovery = storageRecoveryMetrics(recoveryEvidence, observed);
  const envelope = assessStorageOperatingEnvelope({
    databaseBytes,
    walBytes,
    freePageRatio,
    activeUrlFrontierRows: activeFrontierRows,
    backupAgeHours: recovery.backupAgeHours,
    restoreDrillAgeDays: recovery.restoreDrillAgeDays,
    restoreThroughputMiBPerSecond: recovery.restoreThroughputMiBPerSecond,
    backupReadbackVerified: recovery.backupReadbackVerified,
    restoreIntegrityVerified: recovery.restoreIntegrityVerified,
    restoreReconciliationVerified: recovery.restoreReconciliationVerified,
    recoveryEvidenceInvalid,
  });
  return {
    version: "1.0",
    observedAt,
    workspaces: { total: total(workspaceByStatus), byStatus: workspaceByStatus },
    sources: { total: total(sourceByStatus), byStatus: sourceByStatus },
    runs: { total: total(runByStatus), byStatus: runByStatus },
    leases: {
      total: total(leaseByStatus),
      active: leaseByStatus.ACTIVE ?? 0,
      expired: leaseByStatus.EXPIRED ?? 0,
    },
    backlog: {
      pending: jobByStatus.PENDING ?? 0,
      retry: jobByStatus.RETRY ?? 0,
      failed: jobByStatus.FAILED ?? 0,
      deadLetter: jobByStatus.DEAD_LETTER ?? 0,
    },
    currentness: {
      retrievalDocuments: tableExists(database, "retrieval_documents")
        ? scalar(database, "SELECT COUNT(*) AS count FROM retrieval_documents")
        : 0,
      currentRetrievalDocuments: tableExists(database, "retrieval_documents")
        ? scalar(database, "SELECT COUNT(*) AS count FROM retrieval_documents WHERE is_current = 1")
        : 0,
      readyPackages: tableExists(database, "ready_packages")
        ? scalar(database, "SELECT COUNT(*) AS count FROM ready_packages")
        : 0,
      latestRetentionExecution: latestRetention(database),
    },
    acquisition: {
      activeFrontierRows,
      historicalUrlRows: tableExists(database, "web_url_catalog_history")
        ? scalar(database, "SELECT COUNT(*) AS count FROM web_url_catalog_history")
        : 0,
      campaigns: campaignStates,
    },
    storage: {
      pageCount,
      pageSize,
      freePages,
      databaseBytes,
      freePageRatio,
      walBytes,
      backupAgeHours: recovery.backupAgeHours,
      restoreDrillAgeDays: recovery.restoreDrillAgeDays,
      restoreThroughputMiBPerSecond: recovery.restoreThroughputMiBPerSecond,
      recoveryEvidence: recoveryEvidence
        ? {
            id: recoveryEvidence.id,
            evidenceRef: recoveryEvidence.evidenceRef,
            backupCompletedAt: recoveryEvidence.backupCompletedAt,
            restoreCompletedAt: recoveryEvidence.restoreCompletedAt,
          }
        : null,
      envelope,
    },
  };
}
