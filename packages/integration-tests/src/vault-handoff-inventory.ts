import { existsSync, lstatSync, readdirSync, type Dirent } from "node:fs";
import { join, resolve } from "node:path";
import {
  inspectVaultHandoff,
  type VaultHandoffInspection,
  type VaultHandoffInspectionStatus,
} from "./vault-handoff-inspection";

export type VaultHandoffInventoryItem = Omit<VaultHandoffInspection, "reasonCode"> & {
  runKey: string;
  runDirectory: string;
  reasonCode: VaultHandoffInspection["reasonCode"] | "BATCH_ITEM_INSPECTION_FAILED";
};

export type VaultHandoffInventory = {
  runsRoot: string;
  vaultDirectory: string;
  scannedCount: number;
  returnedCount: number;
  counts: Record<VaultHandoffInspectionStatus, number>;
  items: VaultHandoffInventoryItem[];
};

export type VaultHandoffInventoryOptions = {
  status?: VaultHandoffInspectionStatus;
  limit?: number;
  allowedPrefix?: string;
};

const emptyCounts = (): Record<VaultHandoffInspectionStatus, number> => ({
  PENDING: 0,
  CONSUMED: 0,
  DRIFTED: 0,
  INVALID: 0,
});

function invalidItem(runKey: string, runDirectory: string): VaultHandoffInventoryItem {
  return {
    runKey,
    runDirectory,
    status: "INVALID",
    reasonCode: "BATCH_ITEM_INSPECTION_FAILED",
    packageId: null,
    conversionRunId: null,
    targetPath: null,
    absoluteTargetPath: null,
    expectedSha256: null,
    actualSha256: null,
    receiptCount: 0,
  };
}

export function inspectVaultHandoffInventory(
  runsRootDirectory: string,
  vaultDirectory: string,
  options: VaultHandoffInventoryOptions = {},
): VaultHandoffInventory {
  const runsRoot = resolve(runsRootDirectory);
  const vault = resolve(vaultDirectory);
  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("VAULT_HANDOFF_INVENTORY_LIMIT_INVALID");
  }

  const entries: Dirent[] = readdirSync(runsRoot, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .sort((left, right) => left.name.localeCompare(right.name));

  const allItems = candidates.map((entry): VaultHandoffInventoryItem => {
    const runDirectory = join(runsRoot, entry.name);
    if (entry.isSymbolicLink()) return invalidItem(entry.name, runDirectory);
    const readyPackagePath = join(runDirectory, "ready-package.json");
    if (!existsSync(readyPackagePath)) return invalidItem(entry.name, runDirectory);
    const details = lstatSync(readyPackagePath);
    if (details.isSymbolicLink() || !details.isFile()) return invalidItem(entry.name, runDirectory);
    try {
      return {
        runKey: entry.name,
        runDirectory,
        ...inspectVaultHandoff(runDirectory, vault, options.allowedPrefix),
      };
    } catch {
      return invalidItem(entry.name, runDirectory);
    }
  });

  const counts = emptyCounts();
  for (const item of allItems) counts[item.status] += 1;
  const filtered = options.status
    ? allItems.filter((item) => item.status === options.status)
    : allItems;

  return {
    runsRoot,
    vaultDirectory: vault,
    scannedCount: allItems.length,
    returnedCount: Math.min(filtered.length, limit),
    counts,
    items: filtered.slice(0, limit),
  };
}
