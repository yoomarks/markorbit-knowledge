import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { verifyEvidenceBundle } from "./evidence-bundle";
import { readRunEvidenceManifest } from "./run-evidence-manifest";

export const READY_PACKAGE_VERSION = "1.0.0" as const;
export const READY_PACKAGE_TYPE = "READY_PACKAGE" as const;

const READY_PACKAGE_FILE = "ready-package.json";
const REGISTRY_FILE = "ready-package-registry.jsonl";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type ReadyPackageManifest = {
  schemaVersion: typeof READY_PACKAGE_VERSION;
  objectType: typeof READY_PACKAGE_TYPE;
  packageId: string;
  preparedAt: string;
  workspaceId: string;
  sourceId: string;
  conversionRunId: string;
  stagingDocumentId: string;
  stagingTargetPath: string;
  stagingSha256: string;
  verification: {
    id: string;
    verifierId: string;
    verifierVersion: string;
    outcome: "PASS" | "PASS_WITH_WARNINGS";
  };
  evidence: {
    runManifestSha256: string;
    bundleSha256: string;
  };
  handoffStatus: "READY";
  digest: { algorithm: "SHA-256"; value: string };
};

export type ReadyPackageRegistryRecord = {
  packageId: string;
  workspaceId: string;
  conversionRunId: string;
  stagingDocumentId: string;
  packageSha256: string;
  registeredAt: string;
  relativePath: typeof READY_PACKAGE_FILE;
};

export class ReadyPackageError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ReadyPackageError";
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

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function manifestDigest(value: Omit<ReadyPackageManifest, "digest">): string {
  return sha256(canonicalize(value as unknown as JsonValue));
}

function assertRegularFile(path: string): void {
  const details = lstatSync(path);
  if (details.isSymbolicLink() || !details.isFile()) {
    throw new ReadyPackageError(
      "READY_PACKAGE_FILE_INVALID",
      "Ready Package path must be a regular file",
    );
  }
}

function readRegistry(path: string): ReadyPackageRegistryRecord[] {
  if (!existsSync(path)) return [];
  assertRegularFile(path);
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ReadyPackageRegistryRecord);
}

export function prepareReadyPackage(
  rootDirectory: string,
  preparedAt = new Date().toISOString(),
): { manifest: ReadyPackageManifest; path: string; registryPath: string } {
  const root = resolve(rootDirectory);
  const verification = verifyEvidenceBundle(root);
  const runManifest = readRunEvidenceManifest(join(root, "run-manifest.json"));
  const evidence = runManifest.evidence;

  if (evidence.terminal.status !== "COMPLETED" || evidence.terminal.observedPhase !== "COMPLETED") {
    throw new ReadyPackageError(
      "READY_PACKAGE_RUN_NOT_COMPLETED",
      "Conversion run is not completed",
    );
  }
  if (evidence.staging.status !== "READY") {
    throw new ReadyPackageError("READY_PACKAGE_STAGING_NOT_READY", "Staging document is not ready");
  }
  if (
    evidence.verification.outcome !== "PASS" &&
    evidence.verification.outcome !== "PASS_WITH_WARNINGS"
  ) {
    throw new ReadyPackageError(
      "READY_PACKAGE_VERIFICATION_NOT_PASSING",
      "Verification is not passing",
    );
  }

  const packageId = `rpk_${sha256(
    `${evidence.workspaceId}:${evidence.conversion.runId}:${evidence.staging.documentId}:${evidence.staging.sha256}`,
  ).slice(0, 26)}`;
  const unsigned = {
    schemaVersion: READY_PACKAGE_VERSION,
    objectType: READY_PACKAGE_TYPE,
    packageId,
    preparedAt,
    workspaceId: evidence.workspaceId,
    sourceId: evidence.sourceId,
    conversionRunId: evidence.conversion.runId,
    stagingDocumentId: evidence.staging.documentId,
    stagingTargetPath: evidence.staging.targetPath,
    stagingSha256: evidence.staging.sha256,
    verification: {
      id: evidence.verification.id,
      verifierId: evidence.verification.verifierId,
      verifierVersion: evidence.verification.verifierVersion,
      outcome: evidence.verification.outcome,
    },
    evidence: {
      runManifestSha256: verification.manifestSha256,
      bundleSha256: verification.bundleSha256,
    },
    handoffStatus: "READY" as const,
  } satisfies Omit<ReadyPackageManifest, "digest">;
  const manifest: ReadyPackageManifest = {
    ...unsigned,
    digest: { algorithm: "SHA-256", value: manifestDigest(unsigned) },
  };

  const path = join(root, READY_PACKAGE_FILE);
  if (existsSync(path)) {
    throw new ReadyPackageError("READY_PACKAGE_ALREADY_EXISTS", "Ready Package already exists");
  }
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${canonicalize(manifest as unknown as JsonValue)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  renameSync(temporaryPath, path);

  const registryPath = join(root, REGISTRY_FILE);
  const records = readRegistry(registryPath);
  if (
    records.some(
      (record) =>
        record.packageId === packageId || record.conversionRunId === evidence.conversion.runId,
    )
  ) {
    throw new ReadyPackageError(
      "READY_PACKAGE_DUPLICATE_HANDOFF",
      "Conversion run is already registered for handoff",
    );
  }
  const record: ReadyPackageRegistryRecord = {
    packageId,
    workspaceId: evidence.workspaceId,
    conversionRunId: evidence.conversion.runId,
    stagingDocumentId: evidence.staging.documentId,
    packageSha256: manifest.digest.value,
    registeredAt: preparedAt,
    relativePath: READY_PACKAGE_FILE,
  };
  appendFileSync(registryPath, `${canonicalize(record as unknown as JsonValue)}\n`, {
    encoding: "utf8",
    flag: "a",
  });

  return { manifest, path, registryPath };
}

export function verifyReadyPackage(rootDirectory: string): ReadyPackageManifest {
  const root = resolve(rootDirectory);
  verifyEvidenceBundle(root);
  const path = join(root, READY_PACKAGE_FILE);
  assertRegularFile(path);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as ReadyPackageManifest;
  if (
    parsed.schemaVersion !== READY_PACKAGE_VERSION ||
    parsed.objectType !== READY_PACKAGE_TYPE ||
    parsed.handoffStatus !== "READY" ||
    parsed.digest?.algorithm !== "SHA-256"
  ) {
    throw new ReadyPackageError("READY_PACKAGE_INVALID", "Ready Package envelope is invalid");
  }
  const { digest, ...unsigned } = parsed;
  if (digest.value !== manifestDigest(unsigned)) {
    throw new ReadyPackageError("READY_PACKAGE_DIGEST_MISMATCH", "Ready Package digest is invalid");
  }
  const records = readRegistry(join(root, REGISTRY_FILE));
  const record = records.find((entry) => entry.packageId === parsed.packageId);
  if (
    !record ||
    record.packageSha256 !== digest.value ||
    record.conversionRunId !== parsed.conversionRunId
  ) {
    throw new ReadyPackageError(
      "READY_PACKAGE_REGISTRY_MISMATCH",
      "Ready Package registry binding is invalid",
    );
  }
  return parsed;
}
