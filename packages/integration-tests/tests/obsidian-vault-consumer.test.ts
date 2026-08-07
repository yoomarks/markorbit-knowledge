import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportEvidenceBundle } from "../src/evidence-bundle";
import {
  consumeReadyPackageToVault,
  ObsidianVaultConsumerError,
  verifyVaultConsumption,
} from "../src/obsidian-vault-consumer";
import { prepareReadyPackage } from "../src/ready-package";
import { writeRunEvidenceManifest } from "../src/run-evidence-manifest";

const directories: string[] = [];
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function directory(prefix: string): string {
  const value = mkdtempSync(join(tmpdir(), prefix));
  directories.push(value);
  return value;
}

function readyRoot(targetPath = "00_Inbox/raw_test.md") {
  const root = directory("markorbit-vault-source-");
  const markdown = "# Verified staging\n\nReady for local Vault consumption.\n";
  const digest = sha256(markdown);
  mkdirSync(join(root, "raw-artifacts"), { recursive: true });
  mkdirSync(join(root, "staging-cas", digest.slice(0, 2)), { recursive: true });
  writeFileSync(join(root, "knowledge.sqlite"), "sqlite-fixture");
  writeFileSync(join(root, "raw-artifacts", "raw_test.txt"), "raw fixture");
  writeFileSync(join(root, "staging-cas", digest.slice(0, 2), digest), markdown);
  writeRunEvidenceManifest(root, {
    generatedAt: "2026-07-19T06:00:00.000Z",
    executionKey: "vault-test",
    workspaceId: "wsp_test",
    sourceId: "src_test",
    rawArtifact: {
      id: "raw_test",
      status: "READY_FOR_CONVERSION",
      artifactKind: "TEXT",
      mimeType: "text/plain",
      sizeBytes: 11,
      sha256: sha256("raw fixture"),
    },
    conversion: {
      runId: "run_test",
      runStatus: "COMPLETED",
      attemptId: "attempt_test",
      attemptStatus: "OUTPUT_REPORTED",
      leaseId: "lease_test",
      leaseStatus: "RELEASED",
      converterId: "builtin-text-markdown",
      converterVersion: "1.0.0",
    },
    staging: {
      documentId: "stg_test",
      status: "READY",
      targetPath,
      sizeBytes: Buffer.byteLength(markdown),
      sha256: digest,
    },
    verification: {
      id: "verification_test",
      verifierId: "builtin-staging-verifier",
      verifierVersion: "1.0.0",
      outcome: "PASS",
      checks: 15,
      warnings: 0,
    },
    terminal: { status: "COMPLETED", observedPhase: "COMPLETED" },
    files: {
      databasePath: join(root, "knowledge.sqlite"),
      casDirectory: join(root, "staging-cas"),
    },
  });
  exportEvidenceBundle(root, "2026-07-19T06:01:00.000Z");
  prepareReadyPackage(root, "2026-07-19T06:02:00.000Z");
  return { root, markdown, digest };
}

afterEach(() => {
  for (const value of directories.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe("local Obsidian Vault handoff consumer", () => {
  it("atomically consumes a verified Ready Package and verifies the receipt", () => {
    const source = readyRoot();
    const vault = directory("markorbit-vault-");
    const consumed = consumeReadyPackageToVault(source.root, vault, "2026-07-19T06:03:00.000Z");

    expect(consumed.status).toBe("CONSUMED");
    expect(readFileSync(join(vault, "00_Inbox", "raw_test.md"), "utf8")).toBe(source.markdown);
    expect(readFileSync(consumed.receiptPath, "utf8")).not.toContain("token");
    expect(verifyVaultConsumption(source.root, vault).packageId).toBe(consumed.packageId);
  });

  it("recognizes exact replay without rewriting and rejects changed target content", () => {
    const source = readyRoot();
    const vault = directory("markorbit-vault-");
    consumeReadyPackageToVault(source.root, vault);
    expect(consumeReadyPackageToVault(source.root, vault).status).toBe("REPLAYED");

    writeFileSync(join(vault, "00_Inbox", "raw_test.md"), "changed");
    expect(() => consumeReadyPackageToVault(source.root, vault)).toThrowError(
      expect.objectContaining<Partial<ObsidianVaultConsumerError>>({
        code: "VAULT_TARGET_CONFLICT",
      }),
    );
  });

  it("rejects paths outside the controlled Inbox", () => {
    const source = readyRoot("../escape.md");
    const vault = directory("markorbit-vault-");
    expect(() => consumeReadyPackageToVault(source.root, vault)).toThrowError(
      expect.objectContaining<Partial<ObsidianVaultConsumerError>>({
        code: "VAULT_TARGET_PATH_INVALID",
      }),
    );
  });
});
