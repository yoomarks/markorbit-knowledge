import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { RegistryConflictError, RegistryValidationError } from "./index";
import { normalizeVaultRelativeRoot } from "./vault-binding-registry";
import type {
  StagingContentRegistryRepository,
  StagingDocumentRecord,
} from "./staging-content-registry";

export type ObsidianVaultProjectionConflictPolicy = "OVERWRITE" | "FAIL_IF_DIFFERENT";

export type ObsidianVaultProjectionOptions = {
  conflictPolicy?: ObsidianVaultProjectionConflictPolicy;
  targetPathOverride?: string;
};

export type ObsidianVaultProjectionResult = {
  stagingDocumentId: string;
  workspaceId: string;
  vaultRelativePath: string;
  contentSha256: string;
  written: boolean;
};

export type ObsidianVaultProjectionInspection = {
  stagingDocumentId: string;
  workspaceId: string;
  vaultRelativePath: string;
  contentSha256: string;
  state: "MISSING" | "MATCH" | "CONFLICT";
};

export type ObsidianVaultProjectionScope =
  { mode: "WORKSPACE_SCOPED" } | { mode: "BOUND_ROOT"; relativeRoot: string };

export interface ObsidianVaultProjectionRepository {
  inspect(workspaceId: string, stagingDocumentId: string): ObsidianVaultProjectionInspection;
  project(
    workspaceId: string,
    stagingDocumentId: string,
    options?: ObsidianVaultProjectionOptions,
  ): ObsidianVaultProjectionResult;
}

export function normalizeObsidianTargetPath(raw: string): string {
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
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new RegistryConflictError(
      "OBSIDIAN_VAULT_ROOT_TYPE_INVALID",
      "Obsidian Vault root must be a regular directory and must not be a symbolic link",
    );
  }
}

function assertDirectory(path: string, code: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new RegistryConflictError(
      code,
      "Obsidian Vault path contains a non-directory or symlink",
    );
  }
}

function walkDirectory(root: string, segments: string[], create: boolean): string {
  let current = root;
  for (const segment of segments) {
    const next = resolve(current, segment);
    if (next === current || !next.startsWith(`${current}${sep}`)) {
      throw new RegistryValidationError("Obsidian Vault path escapes its controlled root");
    }
    if (existsSync(next)) {
      assertDirectory(next, "OBSIDIAN_VAULT_DIRECTORY_TYPE_INVALID");
    } else if (create) {
      mkdirSync(next);
      assertDirectory(next, "OBSIDIAN_VAULT_DIRECTORY_TYPE_INVALID");
    }
    current = next;
  }
  return current;
}

export class LocalObsidianVaultProjectionRepository implements ObsidianVaultProjectionRepository {
  private readonly root: string;
  private readonly scope: ObsidianVaultProjectionScope;

  constructor(
    private readonly staging: StagingContentRegistryRepository,
    vaultRoot: string,
    scope: ObsidianVaultProjectionScope = { mode: "WORKSPACE_SCOPED" },
  ) {
    if (!vaultRoot.trim()) throw new RegistryValidationError("Obsidian Vault root is required");
    this.root = resolve(vaultRoot);
    assertRoot(this.root);
    this.scope =
      scope.mode === "BOUND_ROOT"
        ? { mode: "BOUND_ROOT", relativeRoot: normalizeVaultRelativeRoot(scope.relativeRoot) }
        : scope;
  }

  private loadRecord(workspaceId: string, stagingDocumentId: string): StagingDocumentRecord {
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
    return record;
  }

  private target(
    workspaceId: string,
    targetPath: string,
    createDirectories: boolean,
  ): { absolutePath: string; vaultRelativePath: string } {
    const targetSegments = normalizeObsidianTargetPath(targetPath).split("/");
    const fileName = targetSegments.pop();
    if (!fileName) throw new RegistryValidationError("Obsidian targetPath is invalid");

    const scopeSegments =
      this.scope.mode === "WORKSPACE_SCOPED"
        ? [workspaceId]
        : normalizeVaultRelativeRoot(this.scope.relativeRoot).split("/");
    const base = walkDirectory(this.root, scopeSegments, createDirectories);
    const parent = walkDirectory(base, targetSegments, createDirectories);
    const absolutePath = resolve(parent, fileName);
    if (absolutePath === parent || !absolutePath.startsWith(`${parent}${sep}`)) {
      throw new RegistryValidationError("Obsidian targetPath escapes the controlled Vault root");
    }
    return {
      absolutePath,
      vaultRelativePath: [...scopeSegments, ...targetSegments, fileName].join("/"),
    };
  }

  inspect(workspaceId: string, stagingDocumentId: string): ObsidianVaultProjectionInspection {
    const record = this.loadRecord(workspaceId, stagingDocumentId);
    const targetPath = normalizeObsidianTargetPath(record.descriptor.targetPath);
    const target = this.target(workspaceId, targetPath, false);
    if (!existsSync(target.absolutePath)) {
      return {
        stagingDocumentId,
        workspaceId,
        vaultRelativePath: target.vaultRelativePath,
        contentSha256: record.descriptor.contentHash.value,
        state: "MISSING",
      };
    }
    const stat = lstatSync(target.absolutePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new RegistryConflictError(
        "OBSIDIAN_TARGET_TYPE_INVALID",
        "Obsidian projection target must be a regular file",
      );
    }
    const content = this.staging.readContent(stagingDocumentId, workspaceId);
    const existing = readFileSync(target.absolutePath);
    return {
      stagingDocumentId,
      workspaceId,
      vaultRelativePath: target.vaultRelativePath,
      contentSha256: record.descriptor.contentHash.value,
      state: existing.equals(Buffer.from(content)) ? "MATCH" : "CONFLICT",
    };
  }

  project(
    workspaceId: string,
    stagingDocumentId: string,
    options: ObsidianVaultProjectionOptions = {},
  ): ObsidianVaultProjectionResult {
    const record = this.loadRecord(workspaceId, stagingDocumentId);
    const targetPath = normalizeObsidianTargetPath(
      options.targetPathOverride ?? record.descriptor.targetPath,
    );
    const target = this.target(workspaceId, targetPath, true);
    const content = this.staging.readContent(stagingDocumentId, workspaceId);

    if (existsSync(target.absolutePath)) {
      const stat = lstatSync(target.absolutePath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new RegistryConflictError(
          "OBSIDIAN_TARGET_TYPE_INVALID",
          "Obsidian projection target must be a regular file",
        );
      }
      const existing = readFileSync(target.absolutePath);
      if (existing.equals(Buffer.from(content))) {
        return {
          stagingDocumentId,
          workspaceId,
          vaultRelativePath: target.vaultRelativePath,
          contentSha256: record.descriptor.contentHash.value,
          written: false,
        };
      }
      if (options.conflictPolicy === "FAIL_IF_DIFFERENT") {
        throw new RegistryConflictError(
          "OBSIDIAN_TARGET_CONTENT_CONFLICT",
          "Obsidian target contains different content and will not be overwritten",
        );
      }
    }

    const temporary = `${target.absolutePath}.${randomBytes(8).toString("hex")}.tmp`;
    try {
      writeFileSync(temporary, content, { flag: "wx" });
      renameSync(temporary, target.absolutePath);
    } finally {
      rmSync(temporary, { force: true });
    }
    return {
      stagingDocumentId,
      workspaceId,
      vaultRelativePath: target.vaultRelativePath,
      contentSha256: record.descriptor.contentHash.value,
      written: true,
    };
  }
}
