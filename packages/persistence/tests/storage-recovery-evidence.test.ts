import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openRegistryDatabase } from "../src/index";
import {
  latestStorageRecoveryEvidence,
  recordStorageRecoveryEvidence,
  storageRecoveryMetrics,
} from "../src/storage-recovery-evidence";

const SHA = "a".repeat(64);
const BASE = {
  backupCompletedAt: "2026-09-16T08:00:00.000Z",
  restoreCompletedAt: "2026-09-16T09:00:00.000Z",
  backupManifestSha256: SHA,
  backupBytes: 1024,
  restoreThroughputMiBPerSecond: 80,
  sqliteIntegrityCheck: "ok" as const,
  backupReadbackVerified: true,
  registryReconciliationVerified: true,
  evidenceRef: "ops:recovery:20260916-01",
};

describe("storage recovery evidence", () => {
  it("persists recovery evidence across registry restart and derives ages", () => {
    const root = mkdtempSync(join(tmpdir(), "markorbit-storage-recovery-"));
    const path = join(root, "registry.sqlite");
    try {
      const database = openRegistryDatabase(path);
      const written = recordStorageRecoveryEvidence(database, {
        ...BASE,
        recordedAt: new Date("2026-09-16T09:05:00.000Z"),
      });
      database.close();

      const reopened = openRegistryDatabase(path);
      const latest = latestStorageRecoveryEvidence(reopened);
      expect(latest).toEqual(written);
      expect(storageRecoveryMetrics(latest, new Date("2026-09-16T10:00:00.000Z"))).toMatchObject({
        evidenceId: written.id,
        evidenceRef: BASE.evidenceRef,
        backupAgeHours: 2,
        restoreDrillAgeDays: 1 / 24,
        restoreThroughputMiBPerSecond: 80,
        backupReadbackVerified: true,
        restoreIntegrityVerified: true,
        restoreReconciliationVerified: true,
      });
      reopened.close();
    } finally {
      if (process.platform !== "win32") rmSync(root, { recursive: true, force: true });
    }
  });
  it("selects the latest drill even when it is a failure", () => {
    const database = openRegistryDatabase(":memory:");
    recordStorageRecoveryEvidence(database, {
      ...BASE,
      recordedAt: new Date("2026-09-16T09:05:00.000Z"),
    });
    const failed = recordStorageRecoveryEvidence(database, {
      ...BASE,
      backupCompletedAt: "2026-09-16T10:00:00.000Z",
      restoreCompletedAt: "2026-09-16T11:00:00.000Z",
      recordedAt: new Date("2026-09-16T11:05:00.000Z"),
      sqliteIntegrityCheck: "failed",
      backupReadbackVerified: false,
      registryReconciliationVerified: false,
      evidenceRef: "ops:recovery:20260916-02",
    });
    const latest = latestStorageRecoveryEvidence(database);
    expect(latest?.id).toBe(failed.id);
    expect(storageRecoveryMetrics(latest, new Date("2026-09-16T12:00:00.000Z"))).toMatchObject({
      backupReadbackVerified: false,
      restoreIntegrityVerified: false,
      restoreReconciliationVerified: false,
    });
    database.close();
  });

  it("rejects path or URL shaped evidence references", () => {
    const database = openRegistryDatabase(":memory:");
    expect(() =>
      recordStorageRecoveryEvidence(database, {
        ...BASE,
        evidenceRef: "https://example.com/private-backup?token=secret",
      }),
    ).toThrow(/opaque non-secret identifier/);
    database.close();
  });
});
