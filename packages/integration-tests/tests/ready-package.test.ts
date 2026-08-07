import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportEvidenceBundle } from "../src/evidence-bundle";
import { ReadyPackageError, prepareReadyPackage, verifyReadyPackage } from "../src/ready-package";
import { writeRunEvidenceManifest } from "../src/run-evidence-manifest";

const directories: string[] = [];

function fixture(status: "COMPLETED" | "FAILED" = "COMPLETED"): string {
  const root = mkdtempSync(join(tmpdir(), "markorbit-ready-package-"));
  directories.push(root);
  mkdirSync(join(root, "raw-artifacts"));
  mkdirSync(join(root, "staging-cas"));
  writeFileSync(join(root, "knowledge.sqlite"), "sqlite-evidence");
  writeFileSync(join(root, "raw-artifacts", "raw.txt"), "raw evidence");
  writeFileSync(join(root, "staging-cas", "document.md"), "# Ready\n");
  writeRunEvidenceManifest(root, {
    generatedAt: "2026-07-19T05:10:00.000Z",
    executionKey: "ready-package-test",
    workspaceId: "wsp_test",
    sourceId: "src_test",
    rawArtifact: {
      id: "raw_test",
      status: "READY_FOR_CONVERSION",
      artifactKind: "TEXT",
      mimeType: "text/plain",
      sizeBytes: 12,
      sha256: "a".repeat(64),
    },
    conversion: {
      runId: "run_test",
      runStatus: status,
      attemptId: "attempt_test",
      attemptStatus: "OUTPUT_REPORTED",
      leaseId: "lease_test",
      leaseStatus: "RELEASED",
      converterId: "builtin-text-markdown",
      converterVersion: "1.0.0",
    },
    staging: {
      documentId: "stg_test",
      status: status === "COMPLETED" ? "READY" : "BLOCKED",
      targetPath: "00_Inbox/raw_test.md",
      sizeBytes: 8,
      sha256: "b".repeat(64),
    },
    verification: {
      id: "verification_test",
      verifierId: "builtin-staging-verifier",
      verifierVersion: "1.0.0",
      outcome: status === "COMPLETED" ? "PASS" : "FAIL",
      checks: 15,
      warnings: 0,
    },
    terminal: {
      status,
      observedPhase: status,
    },
    files: {
      databasePath: join(root, "knowledge.sqlite"),
      casDirectory: join(root, "staging-cas"),
    },
  });
  exportEvidenceBundle(root, "2026-07-19T05:10:01.000Z");
  return root;
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("Ready Package handoff", () => {
  it("prepares, registers and verifies a completed handoff", () => {
    const root = fixture();
    const prepared = prepareReadyPackage(root, "2026-07-19T05:10:02.000Z");
    const verified = verifyReadyPackage(root);

    expect(verified).toEqual(prepared.manifest);
    expect(verified.packageId).toMatch(/^rpk_[a-f0-9]{26}$/);
    expect(verified.handoffStatus).toBe("READY");
    expect(readFileSync(prepared.registryPath, "utf8").trim().split("\n")).toHaveLength(1);
  });

  it("rejects failed or blocked runs", () => {
    const root = fixture("FAILED");
    expect(() => prepareReadyPackage(root)).toThrowError(
      expect.objectContaining<Partial<ReadyPackageError>>({
        code: "READY_PACKAGE_RUN_NOT_COMPLETED",
      }),
    );
  });

  it("rejects duplicate handoff and package tampering", () => {
    const root = fixture();
    const prepared = prepareReadyPackage(root);
    expect(() => prepareReadyPackage(root)).toThrowError(
      expect.objectContaining<Partial<ReadyPackageError>>({ code: "READY_PACKAGE_ALREADY_EXISTS" }),
    );
    const parsed = JSON.parse(readFileSync(prepared.path, "utf8"));
    parsed.handoffStatus = "BROKEN";
    writeFileSync(prepared.path, JSON.stringify(parsed));
    expect(() => verifyReadyPackage(root)).toThrowError(
      expect.objectContaining<Partial<ReadyPackageError>>({ code: "READY_PACKAGE_INVALID" }),
    );
  });
});
