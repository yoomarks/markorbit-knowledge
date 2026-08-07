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
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { verifyEvidenceBundle, type LocalEvidenceBundle } from "./evidence-bundle";
import { verifyReadyPackage } from "./ready-package";

const RECEIPT_DIRECTORY = ".markorbit";
const RECEIPT_FILE = "ready-package-consumption.jsonl";
const DEFAULT_INBOX_PREFIX = "00_Inbox/";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type VaultConsumptionReceipt = {
  packageId: string;
  packageSha256: string;
  conversionRunId: string;
  stagingDocumentId: string;
  stagingSha256: string;
  targetPath: string;
  consumedAt: string;
};

export type VaultConsumptionResult = {
  status: "CONSUMED" | "REPLAYED";
  packageId: string;
  targetPath: string;
  absoluteTargetPath: string;
  stagingSha256: string;
  receiptPath: string;
};

export class ObsidianVaultConsumerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ObsidianVaultConsumerError";
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

function normalizeTargetPath(value: string, allowedPrefix: string): string {
  const path = value.trim();
  if (
    !path ||
    isAbsolute(path) ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..") ||
    !path.startsWith(allowedPrefix) ||
    !path.endsWith(".md")
  ) {
    throw new ObsidianVaultConsumerError(
      "VAULT_TARGET_PATH_INVALID",
      `Vault target must be a Markdown file below ${allowedPrefix}`,
    );
  }
  return path;
}

function assertWithinRoot(root: string, absolutePath: string): void {
  const value = relative(root, absolutePath);
  if (!value || value === ".." || value.startsWith(`..${sep}`)) {
    throw new ObsidianVaultConsumerError(
      "VAULT_TARGET_PATH_INVALID",
      "Vault target escapes the configured root",
    );
  }
}

function assertNoSymlinkPath(root: string, targetPath: string): void {
  const segments = targetPath.split("/");
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    if (!existsSync(current)) continue;
    if (lstatSync(current).isSymbolicLink()) {
      throw new ObsidianVaultConsumerError(
        "VAULT_SYMLINK_FORBIDDEN",
        `Symbolic links are not allowed in Vault target paths: ${targetPath}`,
      );
    }
  }
}

function readReceipts(path: string): VaultConsumptionReceipt[] {
  if (!existsSync(path)) return [];
  const details = lstatSync(path);
  if (details.isSymbolicLink() || !details.isFile()) {
    throw new ObsidianVaultConsumerError(
      "VAULT_RECEIPT_FILE_INVALID",
      "Vault receipt registry must be a regular file",
    );
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as VaultConsumptionReceipt);
}

function readEvidenceBundle(root: string): LocalEvidenceBundle {
  const path = join(root, "evidence-bundle.json");
  return JSON.parse(readFileSync(path, "utf8")) as LocalEvidenceBundle;
}

function resolveStagingCasFile(root: string, digest: string): string {
  const bundle = readEvidenceBundle(root);
  const matches = bundle.files.filter(
    (file) => file.role === "STAGING_CAS" && file.sha256 === digest,
  );
  if (matches.length !== 1) {
    throw new ObsidianVaultConsumerError(
      matches.length === 0 ? "VAULT_STAGING_OBJECT_MISSING" : "VAULT_STAGING_OBJECT_AMBIGUOUS",
      "Ready Package must resolve to exactly one Staging CAS object",
    );
  }
  const absolutePath = resolve(root, matches[0].path);
  assertWithinRoot(root, absolutePath);
  const details = lstatSync(absolutePath);
  if (details.isSymbolicLink() || !details.isFile()) {
    throw new ObsidianVaultConsumerError(
      "VAULT_STAGING_OBJECT_INVALID",
      "Staging CAS object must be a regular file",
    );
  }
  const bytes = new Uint8Array(readFileSync(absolutePath));
  if (sha256(bytes) !== digest) {
    throw new ObsidianVaultConsumerError(
      "VAULT_STAGING_DIGEST_MISMATCH",
      "Staging CAS object digest does not match the Ready Package",
    );
  }
  return absolutePath;
}

export function consumeReadyPackageToVault(
  rootDirectory: string,
  vaultDirectory: string,
  consumedAt = new Date().toISOString(),
  allowedPrefix = DEFAULT_INBOX_PREFIX,
): VaultConsumptionResult {
  const root = resolve(rootDirectory);
  const vault = resolve(vaultDirectory);
  verifyEvidenceBundle(root);
  const readyPackage = verifyReadyPackage(root);
  const targetPath = normalizeTargetPath(readyPackage.stagingTargetPath, allowedPrefix);
  const sourcePath = resolveStagingCasFile(root, readyPackage.stagingSha256);
  const sourceBytes = new Uint8Array(readFileSync(sourcePath));
  const absoluteTargetPath = resolve(vault, ...targetPath.split("/"));
  assertWithinRoot(vault, absoluteTargetPath);
  mkdirSync(vault, { recursive: true });
  assertNoSymlinkPath(vault, targetPath);

  const receiptPath = join(vault, RECEIPT_DIRECTORY, RECEIPT_FILE);
  const receipts = readReceipts(receiptPath);
  const existingReceipt = receipts.find((entry) => entry.packageId === readyPackage.packageId);
  if (
    existingReceipt &&
    (existingReceipt.packageSha256 !== readyPackage.digest.value ||
      existingReceipt.targetPath !== targetPath ||
      existingReceipt.stagingSha256 !== readyPackage.stagingSha256)
  ) {
    throw new ObsidianVaultConsumerError(
      "VAULT_CONSUMPTION_RECEIPT_CONFLICT",
      "Existing consumption receipt conflicts with the Ready Package",
    );
  }

  let status: VaultConsumptionResult["status"] = "CONSUMED";
  if (existsSync(absoluteTargetPath)) {
    const details = lstatSync(absoluteTargetPath);
    if (details.isSymbolicLink() || !details.isFile()) {
      throw new ObsidianVaultConsumerError(
        "VAULT_TARGET_FILE_INVALID",
        "Vault target must be a regular file",
      );
    }
    const existingDigest = sha256(new Uint8Array(readFileSync(absoluteTargetPath)));
    if (existingDigest !== readyPackage.stagingSha256) {
      throw new ObsidianVaultConsumerError(
        "VAULT_TARGET_CONFLICT",
        "Vault target already exists with different content",
      );
    }
    status = "REPLAYED";
  } else {
    mkdirSync(dirname(absoluteTargetPath), { recursive: true });
    assertNoSymlinkPath(vault, targetPath);
    const temporaryPath = `${absoluteTargetPath}.${readyPackage.packageId}.tmp`;
    writeFileSync(temporaryPath, sourceBytes, { flag: "wx" });
    renameSync(temporaryPath, absoluteTargetPath);
  }

  if (!existingReceipt) {
    mkdirSync(dirname(receiptPath), { recursive: true });
    const receipt: VaultConsumptionReceipt = {
      packageId: readyPackage.packageId,
      packageSha256: readyPackage.digest.value,
      conversionRunId: readyPackage.conversionRunId,
      stagingDocumentId: readyPackage.stagingDocumentId,
      stagingSha256: readyPackage.stagingSha256,
      targetPath,
      consumedAt,
    };
    appendFileSync(receiptPath, `${canonicalize(receipt as unknown as JsonValue)}\n`, {
      encoding: "utf8",
      flag: "a",
    });
  }

  return {
    status,
    packageId: readyPackage.packageId,
    targetPath,
    absoluteTargetPath,
    stagingSha256: readyPackage.stagingSha256,
    receiptPath,
  };
}

export function verifyVaultConsumption(
  rootDirectory: string,
  vaultDirectory: string,
  allowedPrefix = DEFAULT_INBOX_PREFIX,
): VaultConsumptionResult {
  const root = resolve(rootDirectory);
  const vault = resolve(vaultDirectory);
  const readyPackage = verifyReadyPackage(root);
  const targetPath = normalizeTargetPath(readyPackage.stagingTargetPath, allowedPrefix);
  const absoluteTargetPath = resolve(vault, ...targetPath.split("/"));
  assertWithinRoot(vault, absoluteTargetPath);
  assertNoSymlinkPath(vault, targetPath);
  if (!existsSync(absoluteTargetPath) || !lstatSync(absoluteTargetPath).isFile()) {
    throw new ObsidianVaultConsumerError(
      "VAULT_TARGET_MISSING",
      "Consumed Vault target is missing",
    );
  }
  if (sha256(new Uint8Array(readFileSync(absoluteTargetPath))) !== readyPackage.stagingSha256) {
    throw new ObsidianVaultConsumerError(
      "VAULT_TARGET_DIGEST_MISMATCH",
      "Consumed Vault target digest does not match the Ready Package",
    );
  }
  const receiptPath = join(vault, RECEIPT_DIRECTORY, RECEIPT_FILE);
  const receipt = readReceipts(receiptPath).find(
    (entry) => entry.packageId === readyPackage.packageId,
  );
  if (
    !receipt ||
    receipt.packageSha256 !== readyPackage.digest.value ||
    receipt.targetPath !== targetPath ||
    receipt.stagingSha256 !== readyPackage.stagingSha256
  ) {
    throw new ObsidianVaultConsumerError(
      "VAULT_CONSUMPTION_RECEIPT_MISMATCH",
      "Vault consumption receipt binding is invalid",
    );
  }
  return {
    status: "REPLAYED",
    packageId: readyPackage.packageId,
    targetPath,
    absoluteTargetPath,
    stagingSha256: readyPackage.stagingSha256,
    receiptPath,
  };
}
