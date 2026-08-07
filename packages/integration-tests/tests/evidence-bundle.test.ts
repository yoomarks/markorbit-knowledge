import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EvidenceBundleError,
  exportEvidenceBundle,
  verifyEvidenceBundle,
} from "../src/evidence-bundle";
import { writeRunEvidenceManifest } from "../src/run-evidence-manifest";

const roots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "markorbit-evidence-bundle-"));
  roots.push(root);
  mkdirSync(join(root, "raw-artifacts"), { recursive: true });
  mkdirSync(join(root, "staging-cas", "ab"), { recursive: true });
  writeFileSync(join(root, "knowledge.sqlite"), "sqlite-evidence");
  writeFileSync(join(root, "raw-artifacts", "artifact.txt"), "raw evidence");
  writeFileSync(join(root, "staging-cas", "ab", "document.md"), "# staged\n");
  writeRunEvidenceManifest(root, {
    generatedAt: "2026-07-19T00:00:00.000Z",
    executionKey: "bundle-test",
    workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    rawArtifact: {
      id: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      status: "READY_FOR_CONVERSION",
      artifactKind: "TEXT",
      mimeType: "text/plain",
      sizeBytes: 12,
      sha256: "a".repeat(64),
    },
    conversion: {
      runId: "cvr_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      runStatus: "COMPLETED",
      attemptId: "cva_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      attemptStatus: "OUTPUT_REPORTED",
      leaseId: "cvl_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      leaseStatus: "RELEASED",
      converterId: "builtin-text-markdown",
      converterVersion: "1.0.0",
    },
    staging: {
      documentId: "std_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      status: "READY",
      targetPath: "00_Inbox/artifact.md",
      sizeBytes: 9,
      sha256: "b".repeat(64),
    },
    verification: {
      id: "svf_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      verifierId: "builtin-staging-verifier",
      verifierVersion: "1.0.0",
      outcome: "PASS",
      checks: 8,
      warnings: 0,
    },
    terminal: { status: "COMPLETED", observedPhase: "COMPLETED" },
    files: {
      databasePath: join(root, "knowledge.sqlite"),
      casDirectory: join(root, "staging-cas"),
    },
  });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("local evidence bundle", () => {
  it("exports and verifies the approved evidence file set", () => {
    const root = fixture();
    const written = exportEvidenceBundle(root, "2026-07-19T00:01:00.000Z");
    expect(written.bundle.files.map((file) => file.path)).toEqual([
      "knowledge.sqlite",
      "raw-artifacts/artifact.txt",
      "run-manifest.json",
      "staging-cas/ab/document.md",
    ]);
    const verified = verifyEvidenceBundle(root);
    expect(verified.status).toBe("VERIFIED");
    expect(verified.fileCount).toBe(4);
    expect(verified.bundleSha256).toBe(written.bundle.digest.value);
  });

  it("rejects modified and additional approved evidence files", () => {
    const root = fixture();
    exportEvidenceBundle(root);
    writeFileSync(join(root, "staging-cas", "ab", "document.md"), "tampered");
    expect(() => verifyEvidenceBundle(root)).toThrowError(
      expect.objectContaining({ code: "EVIDENCE_BUNDLE_FILE_SET_MISMATCH" }),
    );
  });

  it("rejects symbolic links and refuses to overwrite a bundle", () => {
    const root = fixture();
    symlinkSync(join(root, "knowledge.sqlite"), join(root, "raw-artifacts", "linked.sqlite"));
    expect(() => exportEvidenceBundle(root)).toThrowError(
      expect.objectContaining({ code: "EVIDENCE_BUNDLE_SYMLINK_FORBIDDEN" }),
    );
    rmSync(join(root, "raw-artifacts", "linked.sqlite"));
    exportEvidenceBundle(root);
    expect(() => exportEvidenceBundle(root)).toThrowError(
      expect.objectContaining({ code: "EVIDENCE_BUNDLE_ALREADY_EXISTS" }),
    );
  });

  it("exposes stable typed errors", () => {
    const error = new EvidenceBundleError("EVIDENCE_TEST", "test");
    expect(error.code).toBe("EVIDENCE_TEST");
    expect(error.name).toBe("EvidenceBundleError");
  });
});
