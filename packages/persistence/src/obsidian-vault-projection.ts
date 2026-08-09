import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { RegistryConflictError, RegistryValidationError } from "./index";
import type { StagingContentRegistryRepository } from "./staging-content-registry";

export type ObsidianVaultProjectionResult = {
  stagingDocumentId: string;
  workspaceId: string;
  vaultRelativePath: string;
  contentSha256: string;
  written: boolean;
};

export interface ObsidianVaultProjectionRepository {
  project(workspaceId: string, stagingDocumentId: string): ObsidianVaultProjectionResult;
}

function safeTargetPath(raw: string): string {
  const value = raw.trim();
  if (
    !value ||
    isAbsolute(value) ||
    value.includes("\\") ||
    value.includes("\0") ||
    !value.toLowerCase().endsWith(".md")
  ) {
    throw new RegistryValidationError("Obsidian targetPath must be a relative Markdown path");
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new RegistryValidationError("Obsidian targetPath contains an unsafe path segment");
  }
  return segments.join("/");
}

function assertRoot(root: string): void {
  mkdirSync(root, { recursive: true });
  if (lstatSync(root).isSymbolicLink()) {
    throw new RegistryConflictError(
      "OBSIDIAN_VAULT_ROOT_SYMLINK_FORBIDDEN",
      "Obsidian Vault root must not be a symbolic link",
    );
  }
}

export class LocalObsidianVaultProjectionRepository implements ObsidianVaultProjectionRepository {
  private readonly root: string;

  constructor(
    private readonly staging: StagingContentRegistryRepository,
    vaultRoot: string,
  ) {
    if (!vaultRoot.trim()) throw new RegistryValidationError("Obsidian Vault root is required");
    this.root = resolve(vaultRoot);
    assertRoot(this.root);
  }

  project(workspaceId: string, stagingDocumentId: string): ObsidianVaultProjectionResult {
    const record = this.staging.getDocument(stagingDocumentId, workspaceId);
    if (!record) {
      throw new RegistryValidationError(`Staging document ${stagingDocumentId} was not found`);
    }
    if (record.descriptor.status !== "READY") {
      throw new RegistryConflictError(
        "OBSIDIAN_PROJECTION_REQUIRES_READY_STAGING",
        "Only verified READY Staging documents may be projected to Obsidian",
      );
    }
    const targetPath = safeTargetPath(record.descriptor.targetPath);
    const workspaceRoot = resolve(this.root, workspaceId);
    mkdirSync(workspaceRoot, { recursive: true });
    if (lstatSync(workspaceRoot).isSymbolicLink()) {
      throw new RegistryConflictError(
        "OBSIDIAN_WORKSPACE_ROOT_SYMLINK_FORBIDDEN",
        "Obsidian workspace root must not be a symbolic link",
      );
    }
    const target = resolve(workspaceRoot, targetPath);
    if (target !== workspaceRoot && !target.startsWith(`${workspaceRoot}${sep}`)) {
      throw new RegistryValidationError("Obsidian targetPath escapes the workspace Vault root");
    }

    const content = this.staging.readContent(stagingDocumentId, workspaceId);
    if (existsSync(target)) {
      const stat = lstatSync(target);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new RegistryConflictError(
          "OBSIDIAN_TARGET_TYPE_INVALID",
          "Obsidian projection target must be a regular file",
        );
      }
      const existing = readFileSync(target);
      if (existing.equals(Buffer.from(content))) {
        return {
          stagingDocumentId,
          workspaceId,
          vaultRelativePath: `${workspaceId}/${targetPath}`,
          contentSha256: record.descriptor.contentHash.value,
          written: false,
        };
      }
    }

    mkdirSync(dirname(target), { recursive: true });
    const temporary = `${target}.${randomBytes(8).toString("hex")}.tmp`;
    try {
      writeFileSync(temporary, content, { flag: "wx" });
      renameSync(temporary, target);
    } finally {
      rmSync(temporary, { force: true });
    }
    return {
      stagingDocumentId,
      workspaceId,
      vaultRelativePath: `${workspaceId}/${targetPath}`,
      contentSha256: record.descriptor.contentHash.value,
      written: true,
    };
  }
}
