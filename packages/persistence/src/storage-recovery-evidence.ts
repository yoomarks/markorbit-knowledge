import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { initializeRegistry, RegistryValidationError } from "./index";

const MIGRATION_ID = "1142_storage_recovery_evidence";
const SHA256 = /^[a-f0-9]{64}$/u;
const OPAQUE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

export type StorageRecoveryEvidenceV1 = {
  version: "1.0";
  objectType: "STORAGE_RECOVERY_EVIDENCE";
  id: string;
  recordedAt: string;
  backupCompletedAt: string;
  restoreCompletedAt: string;
  backupManifestSha256: string;
  backupBytes: number;
  restoreThroughputMiBPerSecond: number;
  sqliteIntegrityCheck: "ok" | "failed";
  backupReadbackVerified: boolean;
  registryReconciliationVerified: boolean;
  evidenceRef: string;
};

type StorageRecoveryEvidenceFields = Omit<
  StorageRecoveryEvidenceV1,
  "version" | "objectType" | "id" | "recordedAt"
>;

export type RecordStorageRecoveryEvidenceInput = StorageRecoveryEvidenceFields & {
  recordedAt?: Date;
};
export type StorageRecoveryMetrics = {
  evidenceId: string | null;
  evidenceRef: string | null;
  backupAgeHours: number | null;
  restoreDrillAgeDays: number | null;
  restoreThroughputMiBPerSecond: number | null;
  backupReadbackVerified: boolean | null;
  restoreIntegrityVerified: boolean | null;
  restoreReconciliationVerified: boolean | null;
};

function tableExists(database: DatabaseSync, table: string): boolean {
  return Boolean(
    database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(table),
  );
}

function ensureStorageRecoveryEvidence(database: DatabaseSync): void {
  initializeRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS storage_recovery_evidence (
        id TEXT PRIMARY KEY,
        recorded_at TEXT NOT NULL,
        backup_completed_at TEXT NOT NULL,
        restore_completed_at TEXT NOT NULL,
        document_json TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_storage_recovery_evidence_latest
        ON storage_recovery_evidence(restore_completed_at DESC, recorded_at DESC, id DESC);
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

function parsedTime(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new RegistryValidationError(`${field} must be RFC3339`);
  return parsed;
}

function validateInput(input: StorageRecoveryEvidenceFields, recordedAt: string): void {
  const backupAt = parsedTime(input.backupCompletedAt, "backupCompletedAt");
  const restoreAt = parsedTime(input.restoreCompletedAt, "restoreCompletedAt");
  const recorded = parsedTime(recordedAt, "recordedAt");
  if (restoreAt < backupAt || backupAt > recorded || restoreAt > recorded) {
    throw new RegistryValidationError("storage recovery evidence timestamps are inconsistent");
  }
  if (!SHA256.test(input.backupManifestSha256)) {
    throw new RegistryValidationError("backupManifestSha256 must be lowercase SHA-256");
  }
  if (!Number.isSafeInteger(input.backupBytes) || input.backupBytes <= 0) {
    throw new RegistryValidationError("backupBytes must be a positive safe integer");
  }
  if (
    !Number.isFinite(input.restoreThroughputMiBPerSecond) ||
    input.restoreThroughputMiBPerSecond < 0
  ) {
    throw new RegistryValidationError("restoreThroughputMiBPerSecond must be non-negative");
  }
  if (input.sqliteIntegrityCheck !== "ok" && input.sqliteIntegrityCheck !== "failed") {
    throw new RegistryValidationError("sqliteIntegrityCheck must be ok or failed");
  }
  if (
    typeof input.backupReadbackVerified !== "boolean" ||
    typeof input.registryReconciliationVerified !== "boolean"
  ) {
    throw new RegistryValidationError("recovery verification flags must be boolean");
  }
  if (!OPAQUE_REF.test(input.evidenceRef)) {
    throw new RegistryValidationError(
      "evidenceRef must be an opaque non-secret identifier without URL/path characters",
    );
  }
}

function parseEvidence(documentJson: string): StorageRecoveryEvidenceV1 {
  let parsed: StorageRecoveryEvidenceV1;
  try {
    parsed = JSON.parse(documentJson) as StorageRecoveryEvidenceV1;
  } catch {
    throw new RegistryValidationError("Persisted storage recovery evidence is malformed JSON");
  }
  if (
    parsed?.version !== "1.0" ||
    parsed.objectType !== "STORAGE_RECOVERY_EVIDENCE" ||
    !parsed.id?.startsWith("sre_")
  ) {
    throw new RegistryValidationError("Persisted storage recovery evidence is invalid");
  }
  validateInput(parsed, parsed.recordedAt);
  return parsed;
}
export function recordStorageRecoveryEvidence(
  database: DatabaseSync,
  input: RecordStorageRecoveryEvidenceInput,
): StorageRecoveryEvidenceV1 {
  ensureStorageRecoveryEvidence(database);
  const recordedAt = (input.recordedAt ?? new Date()).toISOString();
  validateInput(input, recordedAt);
  const evidence: StorageRecoveryEvidenceV1 = {
    version: "1.0",
    objectType: "STORAGE_RECOVERY_EVIDENCE",
    id: `sre_${randomUUID()}`,
    recordedAt,
    backupCompletedAt: input.backupCompletedAt,
    restoreCompletedAt: input.restoreCompletedAt,
    backupManifestSha256: input.backupManifestSha256,
    backupBytes: input.backupBytes,
    restoreThroughputMiBPerSecond: input.restoreThroughputMiBPerSecond,
    sqliteIntegrityCheck: input.sqliteIntegrityCheck,
    backupReadbackVerified: input.backupReadbackVerified,
    registryReconciliationVerified: input.registryReconciliationVerified,
    evidenceRef: input.evidenceRef,
  };
  database
    .prepare(
      `INSERT INTO storage_recovery_evidence
       (id, recorded_at, backup_completed_at, restore_completed_at, document_json)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      evidence.id,
      evidence.recordedAt,
      evidence.backupCompletedAt,
      evidence.restoreCompletedAt,
      JSON.stringify(evidence),
    );
  return evidence;
}
export function latestStorageRecoveryEvidence(
  database: DatabaseSync,
): StorageRecoveryEvidenceV1 | null {
  if (!tableExists(database, "storage_recovery_evidence")) return null;
  const row = database
    .prepare(
      `SELECT document_json FROM storage_recovery_evidence
       ORDER BY restore_completed_at DESC, recorded_at DESC, id DESC LIMIT 1`,
    )
    .get() as { document_json: string } | undefined;
  return row ? parseEvidence(row.document_json) : null;
}

export function storageRecoveryMetrics(
  evidence: StorageRecoveryEvidenceV1 | null,
  observedAt: Date,
): StorageRecoveryMetrics {
  if (!Number.isFinite(observedAt.getTime())) {
    throw new RegistryValidationError("observedAt is invalid");
  }
  if (!evidence) {
    return {
      evidenceId: null,
      evidenceRef: null,
      backupAgeHours: null,
      restoreDrillAgeDays: null,
      restoreThroughputMiBPerSecond: null,
      backupReadbackVerified: null,
      restoreIntegrityVerified: null,
      restoreReconciliationVerified: null,
    };
  }
  const now = observedAt.getTime();
  const backupAt = Date.parse(evidence.backupCompletedAt);
  const restoreAt = Date.parse(evidence.restoreCompletedAt);
  return {
    evidenceId: evidence.id,
    evidenceRef: evidence.evidenceRef,
    backupAgeHours: Math.max(0, now - backupAt) / 3_600_000,
    restoreDrillAgeDays: Math.max(0, now - restoreAt) / 86_400_000,
    restoreThroughputMiBPerSecond: evidence.restoreThroughputMiBPerSecond,
    backupReadbackVerified: evidence.backupReadbackVerified,
    restoreIntegrityVerified: evidence.sqliteIntegrityCheck === "ok",
    restoreReconciliationVerified: evidence.registryReconciliationVerified,
  };
}
