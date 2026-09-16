import { describe, expect, it } from "vitest";
import { openRegistryDatabase } from "../src/index";
import { buildPlatformOperationsPortfolio } from "../src/platform-operations-portfolio";
import { executeRetentionPolicy } from "../src/retention-execution";
import { recordStorageRecoveryEvidence } from "../src/storage-recovery-evidence";
import { SqliteWebUrlCatalogRepository } from "../src/web-url-catalog";

const scope = {
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  campaignId: "portfolio-campaign",
  sourceKey: "official-web",
};

describe("platform operations portfolio", () => {
  it("aggregates bounded read-only operational facts without direct SQLite inspection", () => {
    const db = openRegistryDatabase(":memory:");
    const catalog = new SqliteWebUrlCatalogRepository(
      db,
      () => new Date("2026-09-16T01:00:00.000Z"),
    );
    catalog.upsertDiscovered({
      ...scope,
      discoveryMode: "SITEMAP",
      urls: ["https://example.com/a", "https://example.com/b"],
    });
    executeRetentionPolicy(db, {
      mode: "DRY_RUN",
      observedAt: new Date("2026-09-16T02:00:00.000Z"),
    });
    recordStorageRecoveryEvidence(db, {
      backupCompletedAt: "2026-09-16T01:00:00.000Z",
      restoreCompletedAt: "2026-09-16T02:00:00.000Z",
      recordedAt: new Date("2026-09-16T02:05:00.000Z"),
      backupManifestSha256: "b".repeat(64),
      backupBytes: 2048,
      restoreThroughputMiBPerSecond: 100,
      sqliteIntegrityCheck: "ok",
      backupReadbackVerified: true,
      registryReconciliationVerified: true,
      evidenceRef: "ops:recovery:portfolio-01",
    });

    const portfolio = buildPlatformOperationsPortfolio(db, {
      observedAt: new Date("2026-09-16T03:00:00.000Z"),
      walBytes: 1024,
    });

    expect(portfolio.version).toBe("1.0");
    expect(portfolio.workspaces).toEqual({ total: 1, byStatus: { ACTIVE: 1 } });
    expect(portfolio.acquisition).toEqual({
      activeFrontierRows: 2,
      historicalUrlRows: 0,
      campaigns: { ACTIVE: 1 },
    });
    expect(portfolio.currentness.latestRetentionExecution).toMatchObject({
      mode: "DRY_RUN",
      scanned: 0,
      held: 0,
      applied: 0,
    });
    expect(portfolio.storage.walBytes).toBe(1024);
    expect(portfolio.storage.backupAgeHours).toBe(2);
    expect(portfolio.storage.restoreDrillAgeDays).toBe(1 / 24);
    expect(portfolio.storage.restoreThroughputMiBPerSecond).toBe(100);
    expect(portfolio.storage.recoveryEvidence).toMatchObject({
      evidenceRef: "ops:recovery:portfolio-01",
    });
    expect(portfolio.storage.envelope).toMatchObject({
      state: "WITHIN_ENVELOPE",
      reasonCodes: [],
      migrationAuthorized: false,
    });
    db.close();
  });

  it("does not let an older successful drill hide a newer failed drill", () => {
    const db = openRegistryDatabase(":memory:");
    recordStorageRecoveryEvidence(db, {
      backupCompletedAt: "2026-09-16T01:00:00.000Z",
      restoreCompletedAt: "2026-09-16T02:00:00.000Z",
      recordedAt: new Date("2026-09-16T02:05:00.000Z"),
      backupManifestSha256: "d".repeat(64),
      backupBytes: 2048,
      restoreThroughputMiBPerSecond: 100,
      sqliteIntegrityCheck: "ok",
      backupReadbackVerified: true,
      registryReconciliationVerified: true,
      evidenceRef: "ops:recovery:portfolio-pass",
    });
    recordStorageRecoveryEvidence(db, {
      backupCompletedAt: "2026-09-16T04:00:00.000Z",
      restoreCompletedAt: "2026-09-16T05:00:00.000Z",
      recordedAt: new Date("2026-09-16T05:05:00.000Z"),
      backupManifestSha256: "e".repeat(64),
      backupBytes: 2048,
      restoreThroughputMiBPerSecond: 100,
      sqliteIntegrityCheck: "failed",
      backupReadbackVerified: false,
      registryReconciliationVerified: false,
      evidenceRef: "ops:recovery:portfolio-fail",
    });
    const portfolio = buildPlatformOperationsPortfolio(db, {
      observedAt: new Date("2026-09-16T06:00:00.000Z"),
    });
    expect(portfolio.storage.recoveryEvidence?.evidenceRef).toBe("ops:recovery:portfolio-fail");
    expect(portfolio.storage.envelope.reasonCodes).toEqual([
      "BACKUP_READBACK_FAILED",
      "RESTORE_INTEGRITY_FAILED",
      "RESTORE_RECONCILIATION_FAILED",
    ]);
    db.close();
  });

  it("treats malformed durable recovery evidence as attention rather than healthy", () => {
    const db = openRegistryDatabase(":memory:");
    const written = recordStorageRecoveryEvidence(db, {
      backupCompletedAt: "2026-09-16T01:00:00.000Z",
      restoreCompletedAt: "2026-09-16T02:00:00.000Z",
      recordedAt: new Date("2026-09-16T02:05:00.000Z"),
      backupManifestSha256: "f".repeat(64),
      backupBytes: 2048,
      restoreThroughputMiBPerSecond: 100,
      sqliteIntegrityCheck: "ok",
      backupReadbackVerified: true,
      registryReconciliationVerified: true,
      evidenceRef: "ops:recovery:portfolio-malformed",
    });
    db.prepare("UPDATE storage_recovery_evidence SET document_json = ? WHERE id = ?").run(
      "{not-json",
      written.id,
    );
    const portfolio = buildPlatformOperationsPortfolio(db, {
      observedAt: new Date("2026-09-16T03:00:00.000Z"),
    });
    expect(portfolio.storage.recoveryEvidence).toBeNull();
    expect(portfolio.storage.envelope.state).toBe("ATTENTION");
    expect(portfolio.storage.envelope.reasonCodes).toContain("RECOVERY_EVIDENCE_INVALID");
    expect(portfolio.storage.envelope.migrationAuthorized).toBe(false);
    db.close();
  });
});
