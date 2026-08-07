import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { verifyEvidenceBundle } from "./evidence-bundle";
import { type VaultConsumptionReceipt } from "./obsidian-vault-consumer";
import { verifyReadyPackage } from "./ready-package";

const RECEIPT_PATH = ".markorbit/ready-package-consumption.jsonl";
const DEFAULT_INBOX_PREFIX = "00_Inbox/";

export type VaultHandoffInspectionStatus = "PENDING" | "CONSUMED" | "DRIFTED" | "INVALID";

export type VaultHandoffInspection = {
  status: VaultHandoffInspectionStatus;
  reasonCode:
    | "AWAITING_CONSUMPTION"
    | "HANDOFF_VERIFIED"
    | "TARGET_MISSING_AFTER_RECEIPT"
    | "TARGET_DIGEST_DRIFT"
    | "TARGET_PRESENT_WITHOUT_RECEIPT"
    | "READY_PACKAGE_INVALID"
    | "TARGET_PATH_INVALID"
    | "TARGET_FILE_INVALID"
    | "RECEIPT_FILE_INVALID"
    | "RECEIPT_PARSE_FAILED"
    | "RECEIPT_DUPLICATE"
    | "RECEIPT_BINDING_INVALID";
  packageId: string | null;
  conversionRunId: string | null;
  targetPath: string | null;
  absoluteTargetPath: string | null;
  expectedSha256: string | null;
  actualSha256: string | null;
  receiptCount: number;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function invalid(reasonCode: VaultHandoffInspection["reasonCode"]): VaultHandoffInspection {
  return {
    status: "INVALID",
    reasonCode,
    packageId: null,
    conversionRunId: null,
    targetPath: null,
    absoluteTargetPath: null,
    expectedSha256: null,
    actualSha256: null,
    receiptCount: 0,
  };
}

function normalizeTargetPath(value: string, allowedPrefix: string): string | null {
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
    return null;
  }
  return path;
}

function isWithinRoot(root: string, absolutePath: string): boolean {
  const value = relative(root, absolutePath);
  return Boolean(value) && value !== ".." && !value.startsWith(`..${sep}`);
}

function hasSymlink(root: string, targetPath: string): boolean {
  let current = root;
  for (const segment of targetPath.split("/")) {
    current = join(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) return true;
  }
  return false;
}

function readReceipts(
  vault: string,
):
  | { receipts: VaultConsumptionReceipt[]; error: null }
  | { receipts: []; error: "RECEIPT_FILE_INVALID" | "RECEIPT_PARSE_FAILED" } {
  const path = join(vault, RECEIPT_PATH);
  if (!existsSync(path)) return { receipts: [], error: null };
  const details = lstatSync(path);
  if (details.isSymbolicLink() || !details.isFile()) {
    return { receipts: [], error: "RECEIPT_FILE_INVALID" };
  }
  try {
    return {
      receipts: readFileSync(path, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as VaultConsumptionReceipt),
      error: null,
    };
  } catch {
    return { receipts: [], error: "RECEIPT_PARSE_FAILED" };
  }
}

export function inspectVaultHandoff(
  rootDirectory: string,
  vaultDirectory: string,
  allowedPrefix = DEFAULT_INBOX_PREFIX,
): VaultHandoffInspection {
  const root = resolve(rootDirectory);
  const vault = resolve(vaultDirectory);
  let readyPackage;
  try {
    verifyEvidenceBundle(root);
    readyPackage = verifyReadyPackage(root);
  } catch {
    return invalid("READY_PACKAGE_INVALID");
  }

  const targetPath = normalizeTargetPath(readyPackage.stagingTargetPath, allowedPrefix);
  if (!targetPath) return invalid("TARGET_PATH_INVALID");
  const absoluteTargetPath = resolve(vault, ...targetPath.split("/"));
  if (!isWithinRoot(vault, absoluteTargetPath) || hasSymlink(vault, targetPath)) {
    return invalid("TARGET_PATH_INVALID");
  }

  const receiptResult = readReceipts(vault);
  if (receiptResult.error) return invalid(receiptResult.error);
  const receipts = receiptResult.receipts.filter(
    (receipt) => receipt.packageId === readyPackage.packageId,
  );
  const base = {
    packageId: readyPackage.packageId,
    conversionRunId: readyPackage.conversionRunId,
    targetPath,
    absoluteTargetPath,
    expectedSha256: readyPackage.stagingSha256,
    receiptCount: receipts.length,
  };

  if (receipts.length > 1) {
    return { ...base, status: "INVALID", reasonCode: "RECEIPT_DUPLICATE", actualSha256: null };
  }
  const receipt = receipts[0];
  if (
    receipt &&
    (receipt.packageSha256 !== readyPackage.digest.value ||
      receipt.conversionRunId !== readyPackage.conversionRunId ||
      receipt.stagingDocumentId !== readyPackage.stagingDocumentId ||
      receipt.stagingSha256 !== readyPackage.stagingSha256 ||
      receipt.targetPath !== targetPath)
  ) {
    return {
      ...base,
      status: "INVALID",
      reasonCode: "RECEIPT_BINDING_INVALID",
      actualSha256: null,
    };
  }

  if (!existsSync(absoluteTargetPath)) {
    return receipt
      ? {
          ...base,
          status: "DRIFTED",
          reasonCode: "TARGET_MISSING_AFTER_RECEIPT",
          actualSha256: null,
        }
      : {
          ...base,
          status: "PENDING",
          reasonCode: "AWAITING_CONSUMPTION",
          actualSha256: null,
        };
  }

  const details = lstatSync(absoluteTargetPath);
  if (details.isSymbolicLink() || !details.isFile()) {
    return { ...base, status: "INVALID", reasonCode: "TARGET_FILE_INVALID", actualSha256: null };
  }
  const actualSha256 = sha256(new Uint8Array(readFileSync(absoluteTargetPath)));
  if (!receipt) {
    return {
      ...base,
      status: "DRIFTED",
      reasonCode: "TARGET_PRESENT_WITHOUT_RECEIPT",
      actualSha256,
    };
  }
  if (actualSha256 !== readyPackage.stagingSha256) {
    return { ...base, status: "DRIFTED", reasonCode: "TARGET_DIGEST_DRIFT", actualSha256 };
  }
  return { ...base, status: "CONSUMED", reasonCode: "HANDOFF_VERIFIED", actualSha256 };
}
