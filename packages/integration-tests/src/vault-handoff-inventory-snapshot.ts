import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  inspectVaultHandoffInventory,
  type VaultHandoffInventory,
} from "./vault-handoff-inventory";
import type { VaultHandoffInspectionStatus } from "./vault-handoff-inspection";

const SCHEMA_VERSION = "1.0.0";
const OBJECT_TYPE = "VAULT_HANDOFF_INVENTORY_SNAPSHOT";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type VaultHandoffSnapshotItem = {
  runKey: string;
  status: VaultHandoffInspectionStatus;
  reasonCode: string;
  packageId: string | null;
  conversionRunId: string | null;
  targetPath: string | null;
  expectedSha256: string | null;
  actualSha256: string | null;
  receiptCount: number;
};

export type VaultHandoffInventorySnapshot = {
  schemaVersion: typeof SCHEMA_VERSION;
  objectType: typeof OBJECT_TYPE;
  evidence: {
    generatedAt: string;
    runsRoot: string;
    vaultDirectory: string;
    counts: Record<VaultHandoffInspectionStatus, number>;
    items: VaultHandoffSnapshotItem[];
  };
  digest: {
    algorithm: "SHA-256";
    value: string;
  };
};

export type VaultHandoffTransitionClass =
  | "ADDED"
  | "REMOVED"
  | "UNCHANGED"
  | "PROGRESSED"
  | "DRIFT_INTRODUCED"
  | "INVALID_INTRODUCED"
  | "RECOVERED"
  | "CHANGED";

export type VaultHandoffSnapshotDeltaItem = {
  runKey: string;
  transition: VaultHandoffTransitionClass;
  beforeStatus: VaultHandoffInspectionStatus | null;
  afterStatus: VaultHandoffInspectionStatus | null;
  beforeReasonCode: string | null;
  afterReasonCode: string | null;
};

export type VaultHandoffSnapshotDelta = {
  beforeDigest: string;
  afterDigest: string;
  counts: Record<VaultHandoffTransitionClass, number>;
  items: VaultHandoffSnapshotDeltaItem[];
};

export class VaultHandoffSnapshotError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "VaultHandoffSnapshotError";
  }
}

function canonicalize(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function snapshotItems(inventory: VaultHandoffInventory): VaultHandoffSnapshotItem[] {
  return inventory.items
    .map((item) => ({
      runKey: item.runKey,
      status: item.status,
      reasonCode: item.reasonCode,
      packageId: item.packageId,
      conversionRunId: item.conversionRunId,
      targetPath: item.targetPath,
      expectedSha256: item.expectedSha256,
      actualSha256: item.actualSha256,
      receiptCount: item.receiptCount,
    }))
    .sort((left, right) => left.runKey.localeCompare(right.runKey));
}

export function buildVaultHandoffInventorySnapshot(
  inventory: VaultHandoffInventory,
  generatedAt = new Date().toISOString(),
): VaultHandoffInventorySnapshot {
  const evidence: VaultHandoffInventorySnapshot["evidence"] = {
    generatedAt,
    runsRoot: inventory.runsRoot,
    vaultDirectory: inventory.vaultDirectory,
    counts: inventory.counts,
    items: snapshotItems(inventory),
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    objectType: OBJECT_TYPE,
    evidence,
    digest: {
      algorithm: "SHA-256",
      value: sha256(canonicalize(evidence as unknown as JsonValue)),
    },
  };
}

export function writeVaultHandoffInventorySnapshot(
  outputPath: string,
  inventory: VaultHandoffInventory,
  generatedAt = new Date().toISOString(),
): VaultHandoffInventorySnapshot {
  const target = resolve(outputPath);
  if (existsSync(target)) {
    throw new VaultHandoffSnapshotError(
      "VAULT_HANDOFF_SNAPSHOT_ALREADY_EXISTS",
      "Inventory snapshot already exists",
    );
  }
  const snapshot = buildVaultHandoffInventorySnapshot(inventory, generatedAt);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, `${canonicalize(snapshot as unknown as JsonValue)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  renameSync(temporary, target);
  return snapshot;
}

export function createVaultHandoffInventorySnapshot(
  runsRoot: string,
  vaultDirectory: string,
  outputPath: string,
  generatedAt = new Date().toISOString(),
  allowedPrefix?: string,
): VaultHandoffInventorySnapshot {
  const inventory = inspectVaultHandoffInventory(runsRoot, vaultDirectory, {
    limit: 500,
    allowedPrefix,
  });
  return writeVaultHandoffInventorySnapshot(outputPath, inventory, generatedAt);
}

export function readVaultHandoffInventorySnapshot(
  snapshotPath: string,
): VaultHandoffInventorySnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolve(snapshotPath), "utf8"));
  } catch {
    throw new VaultHandoffSnapshotError(
      "VAULT_HANDOFF_SNAPSHOT_PARSE_FAILED",
      "Inventory snapshot is not valid JSON",
    );
  }
  const snapshot = parsed as Partial<VaultHandoffInventorySnapshot>;
  if (
    snapshot.schemaVersion !== SCHEMA_VERSION ||
    snapshot.objectType !== OBJECT_TYPE ||
    snapshot.digest?.algorithm !== "SHA-256" ||
    typeof snapshot.digest.value !== "string" ||
    !snapshot.evidence ||
    !Array.isArray(snapshot.evidence.items)
  ) {
    throw new VaultHandoffSnapshotError(
      "VAULT_HANDOFF_SNAPSHOT_INVALID",
      "Inventory snapshot envelope is invalid",
    );
  }
  const actual = sha256(canonicalize(snapshot.evidence as unknown as JsonValue));
  if (actual !== snapshot.digest.value) {
    throw new VaultHandoffSnapshotError(
      "VAULT_HANDOFF_SNAPSHOT_DIGEST_MISMATCH",
      "Inventory snapshot digest does not match its evidence",
    );
  }
  return snapshot as VaultHandoffInventorySnapshot;
}

function classify(
  before: VaultHandoffSnapshotItem | undefined,
  after: VaultHandoffSnapshotItem | undefined,
): VaultHandoffTransitionClass {
  if (!before) return "ADDED";
  if (!after) return "REMOVED";
  if (before.status === after.status && before.reasonCode === after.reasonCode) return "UNCHANGED";
  if (before.status === "PENDING" && after.status === "CONSUMED") return "PROGRESSED";
  if (after.status === "DRIFTED" && before.status !== "DRIFTED") return "DRIFT_INTRODUCED";
  if (after.status === "INVALID" && before.status !== "INVALID") return "INVALID_INTRODUCED";
  if (
    (before.status === "DRIFTED" || before.status === "INVALID") &&
    (after.status === "PENDING" || after.status === "CONSUMED")
  ) {
    return "RECOVERED";
  }
  return "CHANGED";
}

export function compareVaultHandoffInventorySnapshots(
  beforePath: string,
  afterPath: string,
): VaultHandoffSnapshotDelta {
  const before = readVaultHandoffInventorySnapshot(beforePath);
  const after = readVaultHandoffInventorySnapshot(afterPath);
  const beforeByKey = new Map(before.evidence.items.map((item) => [item.runKey, item]));
  const afterByKey = new Map(after.evidence.items.map((item) => [item.runKey, item]));
  const runKeys = [...new Set([...beforeByKey.keys(), ...afterByKey.keys()])].sort((left, right) =>
    left.localeCompare(right),
  );
  const counts: Record<VaultHandoffTransitionClass, number> = {
    ADDED: 0,
    REMOVED: 0,
    UNCHANGED: 0,
    PROGRESSED: 0,
    DRIFT_INTRODUCED: 0,
    INVALID_INTRODUCED: 0,
    RECOVERED: 0,
    CHANGED: 0,
  };
  const items = runKeys.map((runKey): VaultHandoffSnapshotDeltaItem => {
    const previous = beforeByKey.get(runKey);
    const current = afterByKey.get(runKey);
    const transition = classify(previous, current);
    counts[transition] += 1;
    return {
      runKey,
      transition,
      beforeStatus: previous?.status ?? null,
      afterStatus: current?.status ?? null,
      beforeReasonCode: previous?.reasonCode ?? null,
      afterReasonCode: current?.reasonCode ?? null,
    };
  });
  return {
    beforeDigest: before.digest.value,
    afterDigest: after.digest.value,
    counts,
    items,
  };
}
