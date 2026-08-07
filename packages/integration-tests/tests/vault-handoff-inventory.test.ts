import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectVaultHandoffInventory } from "../src/vault-handoff-inventory";

const directories: string[] = [];

function directory(prefix: string): string {
  const value = mkdtempSync(join(tmpdir(), prefix));
  directories.push(value);
  return value;
}

afterEach(() => {
  for (const value of directories.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe("Vault handoff inventory", () => {
  it("returns deterministic invalid items without aborting the batch", () => {
    const runsRoot = directory("markorbit-inventory-runs-");
    const vault = directory("markorbit-inventory-vault-");
    mkdirSync(join(runsRoot, "run-b"));
    mkdirSync(join(runsRoot, "run-a"));
    writeFileSync(join(runsRoot, "run-b", "ready-package.json"), "invalid");

    const result = inspectVaultHandoffInventory(runsRoot, vault);

    expect(result.scannedCount).toBe(2);
    expect(result.counts.INVALID).toBe(2);
    expect(result.items.map((item) => item.runKey)).toEqual(["run-a", "run-b"]);
    expect(result.items[0].reasonCode).toBe("BATCH_ITEM_INSPECTION_FAILED");
    expect(result.items[1].reasonCode).toBe("READY_PACKAGE_INVALID");
  });

  it("supports status filtering and bounded limits", () => {
    const runsRoot = directory("markorbit-inventory-runs-");
    const vault = directory("markorbit-inventory-vault-");
    for (const name of ["run-c", "run-a", "run-b"]) mkdirSync(join(runsRoot, name));

    const result = inspectVaultHandoffInventory(runsRoot, vault, { status: "INVALID", limit: 2 });

    expect(result.scannedCount).toBe(3);
    expect(result.returnedCount).toBe(2);
    expect(result.items.map((item) => item.runKey)).toEqual(["run-a", "run-b"]);
  });

  it("rejects symlinked run entries as invalid inventory items", () => {
    const runsRoot = directory("markorbit-inventory-runs-");
    const vault = directory("markorbit-inventory-vault-");
    const target = directory("markorbit-inventory-target-");
    symlinkSync(target, join(runsRoot, "run-link"), "dir");

    expect(inspectVaultHandoffInventory(runsRoot, vault).items[0]).toMatchObject({
      runKey: "run-link",
      status: "INVALID",
      reasonCode: "BATCH_ITEM_INSPECTION_FAILED",
    });
  });

  it("rejects invalid limits", () => {
    const runsRoot = directory("markorbit-inventory-runs-");
    const vault = directory("markorbit-inventory-vault-");
    expect(() => inspectVaultHandoffInventory(runsRoot, vault, { limit: 0 })).toThrow(
      "VAULT_HANDOFF_INVENTORY_LIMIT_INVALID",
    );
  });
});
