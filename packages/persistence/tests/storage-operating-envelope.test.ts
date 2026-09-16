import { describe, expect, it } from "vitest";
import {
  STORAGE_OPERATING_ENVELOPE_V1,
  assessStorageOperatingEnvelope,
} from "../src/storage-operating-envelope";

describe("Storage Operating Envelope", () => {
  it("keeps bounded SQLite operations within the envelope without authorizing migration", () => {
    expect(
      assessStorageOperatingEnvelope({
        databaseBytes: 512 * 1024 ** 2,
        walBytes: 32 * 1024 ** 2,
        freePageRatio: 0.05,
        activeUrlFrontierRows: 100_000,
        backupAgeHours: 2,
        restoreDrillAgeDays: 7,
        restoreThroughputMiBPerSecond: 80,
      }),
    ).toEqual({
      version: "1.0",
      state: "WITHIN_ENVELOPE",
      reasonCodes: [],
      migrationAuthorized: false,
    });
  });

  it("raises bounded attention reasons before any database migration decision", () => {
    const result = assessStorageOperatingEnvelope({
      databaseBytes: STORAGE_OPERATING_ENVELOPE_V1.activeDatabase.attentionBytes,
      walBytes: STORAGE_OPERATING_ENVELOPE_V1.wal.attentionBytes,
      freePageRatio: STORAGE_OPERATING_ENVELOPE_V1.freePageRatio.attention,
      activeUrlFrontierRows: STORAGE_OPERATING_ENVELOPE_V1.activeUrlFrontier.attentionRows,
      backupAgeHours: 25,
      restoreDrillAgeDays: 31,
      restoreThroughputMiBPerSecond: 10,
    });
    expect(result.state).toBe("ATTENTION");
    expect(result.reasonCodes).toEqual([
      "DATABASE_BYTES_ATTENTION",
      "WAL_BYTES_ATTENTION",
      "FREE_PAGE_RATIO_ATTENTION",
      "BACKUP_STALE",
      "RESTORE_DRILL_STALE",
      "RESTORE_THROUGHPUT_LOW",
      "ACTIVE_URL_FRONTIER_ATTENTION",
    ]);
    expect(result.migrationAuthorized).toBe(false);
  });

  it("fails closed when backup and restore evidence is unknown", () => {
    const result = assessStorageOperatingEnvelope({
      databaseBytes: 128 * 1024 ** 2,
      walBytes: 8 * 1024 ** 2,
      freePageRatio: 0,
      activeUrlFrontierRows: 1_000,
    });
    expect(result).toEqual({
      version: "1.0",
      state: "ATTENTION",
      reasonCodes: [
        "BACKUP_EVIDENCE_MISSING",
        "RESTORE_DRILL_EVIDENCE_MISSING",
        "RESTORE_THROUGHPUT_EVIDENCE_MISSING",
      ],
      migrationAuthorized: false,
    });
  });

  it("requires explicit migration review at the hard envelope without auto-authorizing it", () => {
    const result = assessStorageOperatingEnvelope({
      databaseBytes: STORAGE_OPERATING_ENVELOPE_V1.activeDatabase.migrationReviewBytes,
      walBytes: STORAGE_OPERATING_ENVELOPE_V1.wal.migrationReviewBytes,
      freePageRatio: 0,
      activeUrlFrontierRows: STORAGE_OPERATING_ENVELOPE_V1.activeUrlFrontier.migrationReviewRows,
    });
    expect(result.state).toBe("MIGRATION_REVIEW_REQUIRED");
    expect(result.reasonCodes).toEqual([
      "DATABASE_BYTES_MIGRATION_REVIEW",
      "WAL_BYTES_MIGRATION_REVIEW",
      "BACKUP_EVIDENCE_MISSING",
      "RESTORE_DRILL_EVIDENCE_MISSING",
      "RESTORE_THROUGHPUT_EVIDENCE_MISSING",
      "ACTIVE_URL_FRONTIER_MIGRATION_REVIEW",
    ]);
    expect(result.migrationAuthorized).toBe(false);
  });
});
