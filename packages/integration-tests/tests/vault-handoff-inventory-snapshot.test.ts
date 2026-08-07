import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { VaultHandoffInventory } from "../src/vault-handoff-inventory";
import {
  compareVaultHandoffInventorySnapshots,
  readVaultHandoffInventorySnapshot,
  VaultHandoffSnapshotError,
  writeVaultHandoffInventorySnapshot,
} from "../src/vault-handoff-inventory-snapshot";

const directories: string[] = [];

type InventoryItem = VaultHandoffInventory["items"][number];

function directory(): string {
  const value = mkdtempSync(join(tmpdir(), "markorbit-vault-snapshot-"));
  directories.push(value);
  return value;
}

function inventory(
  entries: Array<{
    runKey: string;
    status: InventoryItem["status"];
    reasonCode: InventoryItem["reasonCode"];
  }>,
): VaultHandoffInventory {
  const counts = { PENDING: 0, CONSUMED: 0, DRIFTED: 0, INVALID: 0 };
  const items: InventoryItem[] = entries.map((entry) => {
    counts[entry.status] += 1;
    return {
      runKey: entry.runKey,
      runDirectory: `/runs/${entry.runKey}`,
      status: entry.status,
      reasonCode: entry.reasonCode,
      packageId: `pkg_${entry.runKey}`,
      conversionRunId: `run_${entry.runKey}`,
      targetPath: `00_Inbox/${entry.runKey}.md`,
      absoluteTargetPath: `/vault/00_Inbox/${entry.runKey}.md`,
      expectedSha256: "a".repeat(64),
      actualSha256: entry.status === "DRIFTED" ? "b".repeat(64) : "a".repeat(64),
      receiptCount: entry.status === "PENDING" ? 0 : 1,
    };
  });
  return {
    runsRoot: "/runs",
    vaultDirectory: "/vault",
    scannedCount: items.length,
    returnedCount: items.length,
    counts,
    items,
  };
}

afterEach(() => {
  for (const value of directories.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe("Vault handoff inventory snapshots", () => {
  it("writes and verifies an immutable canonical snapshot", () => {
    const root = directory();
    const path = join(root, "snapshot.json");
    const written = writeVaultHandoffInventorySnapshot(
      path,
      inventory([
        { runKey: "run-b", status: "CONSUMED", reasonCode: "HANDOFF_VERIFIED" },
        { runKey: "run-a", status: "PENDING", reasonCode: "AWAITING_CONSUMPTION" },
      ]),
      "2026-07-19T10:20:00.000Z",
    );

    expect(written.evidence.items.map((item) => item.runKey)).toEqual(["run-a", "run-b"]);
    expect(readVaultHandoffInventorySnapshot(path).digest.value).toBe(written.digest.value);
    expect(() => writeVaultHandoffInventorySnapshot(path, inventory([]))).toThrowError(
      expect.objectContaining<Partial<VaultHandoffSnapshotError>>({
        code: "VAULT_HANDOFF_SNAPSHOT_ALREADY_EXISTS",
      }),
    );
  });

  it("detects snapshot evidence tampering", () => {
    const root = directory();
    const path = join(root, "snapshot.json");
    writeVaultHandoffInventorySnapshot(
      path,
      inventory([{ runKey: "run-a", status: "PENDING", reasonCode: "AWAITING_CONSUMPTION" }]),
    );
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    parsed.evidence.items[0].status = "CONSUMED";
    writeFileSync(path, JSON.stringify(parsed));

    expect(() => readVaultHandoffInventorySnapshot(path)).toThrowError(
      expect.objectContaining<Partial<VaultHandoffSnapshotError>>({
        code: "VAULT_HANDOFF_SNAPSHOT_DIGEST_MISMATCH",
      }),
    );
  });

  it("classifies progress, introduced drift, recovery, additions and removals", () => {
    const root = directory();
    const before = join(root, "before.json");
    const after = join(root, "after.json");
    writeVaultHandoffInventorySnapshot(
      before,
      inventory([
        { runKey: "added-later", status: "PENDING", reasonCode: "AWAITING_CONSUMPTION" },
        { runKey: "drift", status: "CONSUMED", reasonCode: "HANDOFF_VERIFIED" },
        { runKey: "progress", status: "PENDING", reasonCode: "AWAITING_CONSUMPTION" },
        { runKey: "recover", status: "DRIFTED", reasonCode: "TARGET_DIGEST_DRIFT" },
        { runKey: "removed", status: "CONSUMED", reasonCode: "HANDOFF_VERIFIED" },
      ]),
    );
    writeVaultHandoffInventorySnapshot(
      after,
      inventory([
        { runKey: "added", status: "PENDING", reasonCode: "AWAITING_CONSUMPTION" },
        { runKey: "added-later", status: "PENDING", reasonCode: "AWAITING_CONSUMPTION" },
        { runKey: "drift", status: "DRIFTED", reasonCode: "TARGET_DIGEST_DRIFT" },
        { runKey: "progress", status: "CONSUMED", reasonCode: "HANDOFF_VERIFIED" },
        { runKey: "recover", status: "CONSUMED", reasonCode: "HANDOFF_VERIFIED" },
      ]),
    );

    const delta = compareVaultHandoffInventorySnapshots(before, after);
    expect(delta.counts).toMatchObject({
      ADDED: 1,
      REMOVED: 1,
      UNCHANGED: 1,
      PROGRESSED: 1,
      DRIFT_INTRODUCED: 1,
      RECOVERED: 1,
    });
    expect(delta.items.map((item) => item.runKey)).toEqual([
      "added",
      "added-later",
      "drift",
      "progress",
      "recover",
      "removed",
    ]);
  });
});
