import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
  type Dirent,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { readRunEvidenceManifest } from "./run-evidence-manifest";

export const LOCAL_EVIDENCE_BUNDLE_VERSION = "1.0.0" as const;
export const LOCAL_EVIDENCE_BUNDLE_TYPE = "LOCAL_EVIDENCE_BUNDLE" as const;

const BUNDLE_FILE = "evidence-bundle.json";
const REQUIRED_FILE = "run-manifest.json";
const DATABASE_FILE = "knowledge.sqlite";
const APPROVED_DIRECTORIES = ["raw-artifacts", "staging-cas"] as const;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type EvidenceBundleRole =
  "RUN_MANIFEST" | "SQLITE_DATABASE" | "RAW_ARTIFACT" | "STAGING_CAS";

export type EvidenceBundleFile = {
  path: string;
  role: EvidenceBundleRole;
  sizeBytes: number;
  sha256: string;
};

export type LocalEvidenceBundle = {
  schemaVersion: typeof LOCAL_EVIDENCE_BUNDLE_VERSION;
  objectType: typeof LOCAL_EVIDENCE_BUNDLE_TYPE;
  generatedAt: string;
  manifest: { path: typeof REQUIRED_FILE; sha256: string };
  files: EvidenceBundleFile[];
  digest: { algorithm: "SHA-256"; value: string };
};

export type EvidenceBundleVerification = {
  status: "VERIFIED";
  rootDirectory: string;
  bundlePath: string;
  fileCount: number;
  totalSizeBytes: number;
  bundleSha256: string;
  manifestSha256: string;
};

export class EvidenceBundleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "EvidenceBundleError";
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

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeRelative(root: string, absolutePath: string): string {
  const normalizedRoot = resolve(root);
  const normalizedPath = resolve(absolutePath);
  const value = relative(normalizedRoot, normalizedPath);
  if (!value || value === ".." || value.startsWith(`..${sep}`) || value.includes("\0")) {
    throw new EvidenceBundleError(
      "EVIDENCE_BUNDLE_PATH_INVALID",
      "Evidence path escapes the bundle root",
    );
  }
  return value.split(sep).join("/");
}

function assertRegularFile(root: string, path: string): void {
  const absolutePath = join(root, path);
  const details = lstatSync(absolutePath);
  if (details.isSymbolicLink() || !details.isFile()) {
    throw new EvidenceBundleError(
      "EVIDENCE_BUNDLE_FILE_INVALID",
      `Evidence entry must be a regular file: ${path}`,
    );
  }
}

function walkFiles(
  root: string,
  directory: string,
  role: EvidenceBundleRole,
): EvidenceBundleFile[] {
  const absoluteDirectory = join(root, directory);
  let entries: Dirent[];
  try {
    entries = readdirSync(absoluteDirectory, { withFileTypes: true });
  } catch {
    return [];
  }
  const output: EvidenceBundleFile[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = join(absoluteDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new EvidenceBundleError(
        "EVIDENCE_BUNDLE_SYMLINK_FORBIDDEN",
        `Symbolic links are not allowed: ${normalizeRelative(root, absolutePath)}`,
      );
    }
    if (entry.isDirectory()) {
      output.push(...walkFiles(root, normalizeRelative(root, absolutePath), role));
      continue;
    }
    if (!entry.isFile()) {
      throw new EvidenceBundleError(
        "EVIDENCE_BUNDLE_FILE_INVALID",
        `Unsupported evidence entry: ${normalizeRelative(root, absolutePath)}`,
      );
    }
    const path = normalizeRelative(root, absolutePath);
    const bytes = new Uint8Array(readFileSync(absolutePath));
    output.push({ path, role, sizeBytes: bytes.byteLength, sha256: sha256(bytes) });
  }
  return output;
}

function approvedFiles(root: string): EvidenceBundleFile[] {
  const required: Array<[string, EvidenceBundleRole]> = [
    [REQUIRED_FILE, "RUN_MANIFEST"],
    [DATABASE_FILE, "SQLITE_DATABASE"],
  ];
  const files = required.map(([path, role]) => {
    assertRegularFile(root, path);
    const bytes = new Uint8Array(readFileSync(join(root, path)));
    return { path, role, sizeBytes: bytes.byteLength, sha256: sha256(bytes) };
  });
  files.push(...walkFiles(root, APPROVED_DIRECTORIES[0], "RAW_ARTIFACT"));
  files.push(...walkFiles(root, APPROVED_DIRECTORIES[1], "STAGING_CAS"));
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function bundleDigest(value: Omit<LocalEvidenceBundle, "digest">): string {
  return sha256(canonicalize(value as unknown as JsonValue));
}

function parseBundle(path: string): LocalEvidenceBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new EvidenceBundleError(
      "EVIDENCE_BUNDLE_READ_FAILED",
      error instanceof Error ? error.message : "Evidence bundle could not be read",
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new EvidenceBundleError("EVIDENCE_BUNDLE_INVALID", "Evidence bundle must be an object");
  }
  const bundle = parsed as Partial<LocalEvidenceBundle>;
  if (
    bundle.schemaVersion !== LOCAL_EVIDENCE_BUNDLE_VERSION ||
    bundle.objectType !== LOCAL_EVIDENCE_BUNDLE_TYPE ||
    bundle.digest?.algorithm !== "SHA-256" ||
    typeof bundle.digest.value !== "string" ||
    bundle.manifest?.path !== REQUIRED_FILE ||
    typeof bundle.manifest.sha256 !== "string" ||
    !Array.isArray(bundle.files) ||
    typeof bundle.generatedAt !== "string"
  ) {
    throw new EvidenceBundleError("EVIDENCE_BUNDLE_INVALID", "Evidence bundle envelope is invalid");
  }
  const { digest, ...unsigned } = bundle as LocalEvidenceBundle;
  if (digest.value !== bundleDigest(unsigned)) {
    throw new EvidenceBundleError(
      "EVIDENCE_BUNDLE_DIGEST_MISMATCH",
      "Evidence bundle digest is invalid",
    );
  }
  return bundle as LocalEvidenceBundle;
}

export function exportEvidenceBundle(
  rootDirectory: string,
  generatedAt = new Date().toISOString(),
): { bundle: LocalEvidenceBundle; path: string } {
  const root = resolve(rootDirectory);
  const bundlePath = join(root, BUNDLE_FILE);
  try {
    statSync(bundlePath);
    throw new EvidenceBundleError(
      "EVIDENCE_BUNDLE_ALREADY_EXISTS",
      "Evidence bundle already exists and will not be overwritten",
    );
  } catch (error) {
    if (error instanceof EvidenceBundleError) throw error;
  }
  const manifest = readRunEvidenceManifest(join(root, REQUIRED_FILE));
  const unsigned = {
    schemaVersion: LOCAL_EVIDENCE_BUNDLE_VERSION,
    objectType: LOCAL_EVIDENCE_BUNDLE_TYPE,
    generatedAt,
    manifest: { path: REQUIRED_FILE, sha256: manifest.digest.value },
    files: approvedFiles(root),
  } satisfies Omit<LocalEvidenceBundle, "digest">;
  const bundle: LocalEvidenceBundle = {
    ...unsigned,
    digest: { algorithm: "SHA-256", value: bundleDigest(unsigned) },
  };
  mkdirSync(dirname(bundlePath), { recursive: true });
  const temporaryPath = `${bundlePath}.tmp`;
  writeFileSync(temporaryPath, `${canonicalize(bundle as unknown as JsonValue)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  renameSync(temporaryPath, bundlePath);
  return { bundle, path: bundlePath };
}

export function verifyEvidenceBundle(rootDirectory: string): EvidenceBundleVerification {
  const root = resolve(rootDirectory);
  const bundlePath = join(root, BUNDLE_FILE);
  assertRegularFile(root, BUNDLE_FILE);
  const bundle = parseBundle(bundlePath);
  const manifest = readRunEvidenceManifest(join(root, bundle.manifest.path));
  if (manifest.digest.value !== bundle.manifest.sha256) {
    throw new EvidenceBundleError(
      "EVIDENCE_BUNDLE_MANIFEST_MISMATCH",
      "Run manifest digest does not match the bundle",
    );
  }
  const actual = approvedFiles(root);
  if (
    canonicalize(actual as unknown as JsonValue) !==
    canonicalize(bundle.files as unknown as JsonValue)
  ) {
    throw new EvidenceBundleError(
      "EVIDENCE_BUNDLE_FILE_SET_MISMATCH",
      "Evidence files are missing, additional or modified",
    );
  }
  return {
    status: "VERIFIED",
    rootDirectory: root,
    bundlePath,
    fileCount: actual.length,
    totalSizeBytes: actual.reduce((total, file) => total + file.sizeBytes, 0),
    bundleSha256: bundle.digest.value,
    manifestSha256: manifest.digest.value,
  };
}
