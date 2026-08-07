import { createHash } from "node:crypto";
import {
  appendFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportEvidenceBundle } from "../src/evidence-bundle";
import { consumeReadyPackageToVault } from "../src/obsidian-vault-consumer";
import { prepareReadyPackage } from "../src/ready-package";
import { writeRunEvidenceManifest } from "../src/run-evidence-manifest";
import { inspectVaultHandoff } from "../src/vault-handoff-inspection";

const directories: string[] = [];
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function directory(prefix: string): string {
  const value = mkdtempSync(join(tmpdir(), prefix));
  directories.push(value);
  return value;
}

function readyRoot() {
  const root = directory("markorbit-vault-inspection-source-");
  const markdown = "# Verified staging\n\nReady for reconciliation.\n";
  const digest = sha256(markdown);
  mkdirSync(join(root, "raw-artifacts"), { recursive: true });
  mkdirSync(join(root, "staging-cas", digest.slice(0, 2)), { recursive: true });
  writeFileSync(join(root, "knowledge.sqlite"), "sqlite-fixture");
  writeFileSync(join(root, "raw-artifacts", "raw_test.txt"), "raw fixture");
  writeFileSync(join(root, "staging-cas", digest.slice(0, 2), digest), markdown);
  writeRunEvidenceManifest(root, {
    generatedAt: "2026-07-19T07:00:00.000Z",
    executionKey: "vault-inspection-test",
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
      targetPath: "00_Inbox/raw_test.md",
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
  exportEvidenceBundle(root, "2026-07-19T07:01:00.000Z");
  prepareReadyPackage(root, "2026-07-19T07:02:00.000Z");
  return { root, markdown };
}

afterEach(() => {
  for (const value of directories.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe("Vault handoff reconciliation", () => {
  it("reports pending before consumption and consumed after a verified handoff", () => {
    const source = readyRoot();
    const vault = directory("markorbit-vault-inspection-");
    expect(inspectVaultHandoff(source.root, vault)).toMatchObject({
      status: "PENDING",
      reasonCode: "AWAITING_CONSUMPTION",
      receiptCount: 0,
    });
    consumeReadyPackageToVault(source.root, vault, "2026-07-19T07:03:00.000Z");
    expect(inspectVaultHandoff(source.root, vault)).toMatchObject({
      status: "CONSUMED",
      reasonCode: "HANDOFF_VERIFIED",
      receiptCount: 1,
    });
  });

  it("reports content drift and a missing target after consumption", () => {
    const source = readyRoot();
    const vault = directory("markorbit-vault-inspection-");
    consumeReadyPackageToVault(source.root, vault);
    const target = join(vault, "00_Inbox", "raw_test.md");
    writeFileSync(target, "changed");
    expect(inspectVaultHandoff(source.root, vault)).toMatchObject({
      status: "DRIFTED",
      reasonCode: "TARGET_DIGEST_DRIFT",
    });
    unlinkSync(target);
    expect(inspectVaultHandoff(source.root, vault)).toMatchObject({
      status: "DRIFTED",
      reasonCode: "TARGET_MISSING_AFTER_RECEIPT",
    });
  });

  it("reports an invalid duplicate receipt", () => {
    const source = readyRoot();
    const vault = directory("markorbit-vault-inspection-");
    const consumed = consumeReadyPackageToVault(source.root, vault);
    const receipt = JSON.parse(readFileSync(consumed.receiptPath, "utf8").trim());
    appendFileSync(consumed.receiptPath, `${JSON.stringify(receipt)}\n`);
    expect(inspectVaultHandoff(source.root, vault)).toMatchObject({
      status: "INVALID",
      reasonCode: "RECEIPT_DUPLICATE",
      receiptCount: 2,
    });
  });
});
