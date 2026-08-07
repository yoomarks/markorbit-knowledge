import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const LOCAL_RUN_EVIDENCE_MANIFEST_VERSION = "1.0.0" as const;
export const LOCAL_RUN_EVIDENCE_MANIFEST_TYPE = "LOCAL_RUN_EVIDENCE_MANIFEST" as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type LocalRunEvidence = {
  generatedAt: string;
  executionKey: string;
  workspaceId: string;
  sourceId: string;
  rawArtifact: {
    id: string;
    status: string;
    artifactKind: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
  };
  conversion: {
    runId: string;
    runStatus: string;
    attemptId: string | null;
    attemptStatus: string | null;
    leaseId: string | null;
    leaseStatus: string | null;
    converterId: string;
    converterVersion: string;
  };
  staging: {
    documentId: string;
    status: string;
    targetPath: string;
    sizeBytes: number;
    sha256: string;
  };
  verification: {
    id: string;
    verifierId: string;
    verifierVersion: string;
    outcome: string;
    checks: number;
    warnings: number;
  };
  terminal: {
    status: "COMPLETED" | "FAILED";
    observedPhase: "COMPLETED" | "FAILED";
  };
  files: {
    databasePath: string;
    casDirectory: string;
    manifestPath: string;
  };
};

export type LocalRunEvidenceManifest = {
  schemaVersion: typeof LOCAL_RUN_EVIDENCE_MANIFEST_VERSION;
  objectType: typeof LOCAL_RUN_EVIDENCE_MANIFEST_TYPE;
  digest: {
    algorithm: "SHA-256";
    value: string;
  };
  evidence: LocalRunEvidence;
};

export class RunEvidenceManifestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RunEvidenceManifestError";
  }
}

function canonicalize(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
    .join(",")}}`;
}

function digestEvidence(evidence: LocalRunEvidence): string {
  return createHash("sha256")
    .update(canonicalize(evidence as unknown as JsonValue))
    .digest("hex");
}

function validateManifest(value: unknown): LocalRunEvidenceManifest {
  if (!value || typeof value !== "object") {
    throw new RunEvidenceManifestError("RUN_MANIFEST_INVALID", "Manifest must be an object");
  }
  const manifest = value as Partial<LocalRunEvidenceManifest>;
  if (
    manifest.schemaVersion !== LOCAL_RUN_EVIDENCE_MANIFEST_VERSION ||
    manifest.objectType !== LOCAL_RUN_EVIDENCE_MANIFEST_TYPE ||
    manifest.digest?.algorithm !== "SHA-256" ||
    typeof manifest.digest.value !== "string" ||
    !manifest.evidence
  ) {
    throw new RunEvidenceManifestError("RUN_MANIFEST_INVALID", "Manifest envelope is invalid");
  }
  const expected = digestEvidence(manifest.evidence);
  if (manifest.digest.value !== expected) {
    throw new RunEvidenceManifestError(
      "RUN_MANIFEST_DIGEST_MISMATCH",
      "Manifest evidence digest does not match",
    );
  }
  return manifest as LocalRunEvidenceManifest;
}

export function writeRunEvidenceManifest(
  outputDirectory: string,
  evidence: Omit<LocalRunEvidence, "files"> & {
    files: Omit<LocalRunEvidence["files"], "manifestPath">;
  },
): { manifest: LocalRunEvidenceManifest; path: string } {
  const path = join(outputDirectory, "run-manifest.json");
  if (existsSync(path)) {
    throw new RunEvidenceManifestError(
      "RUN_MANIFEST_ALREADY_EXISTS",
      "Run evidence manifest already exists",
    );
  }
  const completeEvidence: LocalRunEvidence = {
    ...evidence,
    files: { ...evidence.files, manifestPath: path },
  };
  const manifest: LocalRunEvidenceManifest = {
    schemaVersion: LOCAL_RUN_EVIDENCE_MANIFEST_VERSION,
    objectType: LOCAL_RUN_EVIDENCE_MANIFEST_TYPE,
    digest: { algorithm: "SHA-256", value: digestEvidence(completeEvidence) },
    evidence: completeEvidence,
  };
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${canonicalize(manifest as unknown as JsonValue)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  renameSync(temporaryPath, path);
  return { manifest, path };
}

export function readRunEvidenceManifest(path: string): LocalRunEvidenceManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new RunEvidenceManifestError(
      "RUN_MANIFEST_READ_FAILED",
      error instanceof Error ? error.message : "Manifest could not be read",
    );
  }
  return validateManifest(parsed);
}
