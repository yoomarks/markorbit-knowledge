import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  RunEvidenceManifestError,
  readRunEvidenceManifest,
  writeRunEvidenceManifest,
} from "../src/run-evidence-manifest";

const directories: string[] = [];

function makeDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "markorbit-run-manifest-"));
  directories.push(directory);
  return directory;
}

function evidence() {
  return {
    generatedAt: "2026-07-19T04:20:00.000Z",
    executionKey: "manifest-test",
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
      sizeBytes: 128,
      sha256: "b".repeat(64),
    },
    verification: {
      id: "verification_test",
      verifierId: "builtin-staging-verifier",
      verifierVersion: "1.0.0",
      outcome: "PASS",
      checks: 15,
      warnings: 0,
    },
    terminal: { status: "COMPLETED" as const, observedPhase: "COMPLETED" as const },
    files: {
      databasePath: "/safe/knowledge.sqlite",
      casDirectory: "/safe/staging-cas",
    },
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local run evidence manifest", () => {
  it("writes canonical evidence and validates its digest", () => {
    const directory = makeDirectory();
    const written = writeRunEvidenceManifest(directory, evidence());
    const read = readRunEvidenceManifest(written.path);

    expect(read).toEqual(written.manifest);
    expect(read.digest.value).toMatch(/^[a-f0-9]{64}$/);
    expect(read.evidence.files.manifestPath).toBe(written.path);
    expect(readFileSync(written.path, "utf8")).not.toContain("credential");
    expect(readFileSync(written.path, "utf8")).not.toContain("tokenDigest");
    expect(readFileSync(written.path, "utf8")).not.toContain("tokenReference");
  });

  it("detects evidence tampering", () => {
    const directory = makeDirectory();
    const written = writeRunEvidenceManifest(directory, evidence());
    const parsed = JSON.parse(readFileSync(written.path, "utf8"));
    parsed.evidence.terminal.status = "FAILED";
    writeFileSync(written.path, JSON.stringify(parsed));

    expect(() => readRunEvidenceManifest(written.path)).toThrowError(
      expect.objectContaining<Partial<RunEvidenceManifestError>>({
        code: "RUN_MANIFEST_DIGEST_MISMATCH",
      }),
    );
  });

  it("refuses to overwrite an existing manifest", () => {
    const directory = makeDirectory();
    writeRunEvidenceManifest(directory, evidence());
    expect(() => writeRunEvidenceManifest(directory, evidence())).toThrow();
  });
});
