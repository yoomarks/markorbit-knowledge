export const STORAGE_OPERATING_ENVELOPE_V1 = {
  activeDatabase: {
    attentionBytes: 4 * 1024 ** 3,
    migrationReviewBytes: 8 * 1024 ** 3,
  },
  wal: {
    attentionBytes: 256 * 1024 ** 2,
    migrationReviewBytes: 1024 * 1024 ** 2,
  },
  freePageRatio: {
    attention: 0.25,
  },
  backup: {
    maxAgeHours: 24,
  },
  restoreDrill: {
    maxAgeDays: 30,
    minimumThroughputMiBPerSecond: 20,
  },
  activeUrlFrontier: {
    attentionRows: 250_000,
    migrationReviewRows: 1_000_000,
  },
} as const;

export type StorageEnvelopeReasonCode =
  | "DATABASE_BYTES_ATTENTION"
  | "DATABASE_BYTES_MIGRATION_REVIEW"
  | "WAL_BYTES_ATTENTION"
  | "WAL_BYTES_MIGRATION_REVIEW"
  | "FREE_PAGE_RATIO_ATTENTION"
  | "BACKUP_EVIDENCE_MISSING"
  | "BACKUP_STALE"
  | "BACKUP_READBACK_FAILED"
  | "RESTORE_DRILL_EVIDENCE_MISSING"
  | "RESTORE_DRILL_STALE"
  | "RESTORE_THROUGHPUT_EVIDENCE_MISSING"
  | "RESTORE_THROUGHPUT_LOW"
  | "RESTORE_INTEGRITY_FAILED"
  | "RESTORE_RECONCILIATION_FAILED"
  | "RECOVERY_EVIDENCE_INVALID"
  | "ACTIVE_URL_FRONTIER_ATTENTION"
  | "ACTIVE_URL_FRONTIER_MIGRATION_REVIEW";

export type StorageOperatingEnvelopeAssessment = {
  version: "1.0";
  state: "WITHIN_ENVELOPE" | "ATTENTION" | "MIGRATION_REVIEW_REQUIRED";
  reasonCodes: StorageEnvelopeReasonCode[];
  migrationAuthorized: false;
};

export function assessStorageOperatingEnvelope(input: {
  databaseBytes: number;
  walBytes: number;
  freePageRatio: number;
  activeUrlFrontierRows: number;
  backupAgeHours?: number | null;
  restoreDrillAgeDays?: number | null;
  restoreThroughputMiBPerSecond?: number | null;
  backupReadbackVerified?: boolean | null;
  restoreIntegrityVerified?: boolean | null;
  restoreReconciliationVerified?: boolean | null;
  recoveryEvidenceInvalid?: boolean;
}): StorageOperatingEnvelopeAssessment {
  const reasons: StorageEnvelopeReasonCode[] = [];
  const limits = STORAGE_OPERATING_ENVELOPE_V1;
  if (input.databaseBytes >= limits.activeDatabase.migrationReviewBytes) {
    reasons.push("DATABASE_BYTES_MIGRATION_REVIEW");
  } else if (input.databaseBytes >= limits.activeDatabase.attentionBytes) {
    reasons.push("DATABASE_BYTES_ATTENTION");
  }
  if (input.walBytes >= limits.wal.migrationReviewBytes) {
    reasons.push("WAL_BYTES_MIGRATION_REVIEW");
  } else if (input.walBytes >= limits.wal.attentionBytes) {
    reasons.push("WAL_BYTES_ATTENTION");
  }
  if (input.freePageRatio >= limits.freePageRatio.attention) {
    reasons.push("FREE_PAGE_RATIO_ATTENTION");
  }
  if (input.backupAgeHours == null) {
    reasons.push("BACKUP_EVIDENCE_MISSING");
  } else if (input.backupAgeHours > limits.backup.maxAgeHours) {
    reasons.push("BACKUP_STALE");
  }
  if (input.restoreDrillAgeDays == null) {
    reasons.push("RESTORE_DRILL_EVIDENCE_MISSING");
  } else if (input.restoreDrillAgeDays > limits.restoreDrill.maxAgeDays) {
    reasons.push("RESTORE_DRILL_STALE");
  }
  if (input.restoreThroughputMiBPerSecond == null) {
    reasons.push("RESTORE_THROUGHPUT_EVIDENCE_MISSING");
  } else if (
    input.restoreThroughputMiBPerSecond < limits.restoreDrill.minimumThroughputMiBPerSecond
  ) {
    reasons.push("RESTORE_THROUGHPUT_LOW");
  }
  if (input.backupReadbackVerified === false) reasons.push("BACKUP_READBACK_FAILED");
  if (input.restoreIntegrityVerified === false) reasons.push("RESTORE_INTEGRITY_FAILED");
  if (input.restoreReconciliationVerified === false) {
    reasons.push("RESTORE_RECONCILIATION_FAILED");
  }
  if (input.recoveryEvidenceInvalid) reasons.push("RECOVERY_EVIDENCE_INVALID");
  if (input.activeUrlFrontierRows >= limits.activeUrlFrontier.migrationReviewRows) {
    reasons.push("ACTIVE_URL_FRONTIER_MIGRATION_REVIEW");
  } else if (input.activeUrlFrontierRows >= limits.activeUrlFrontier.attentionRows) {
    reasons.push("ACTIVE_URL_FRONTIER_ATTENTION");
  }
  const migrationReview = reasons.some((reason) => reason.endsWith("MIGRATION_REVIEW"));
  return {
    version: "1.0",
    state: migrationReview
      ? "MIGRATION_REVIEW_REQUIRED"
      : reasons.length > 0
        ? "ATTENTION"
        : "WITHIN_ENVELOPE",
    reasonCodes: reasons,
    migrationAuthorized: false,
  };
}
