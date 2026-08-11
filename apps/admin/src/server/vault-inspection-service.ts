import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  VaultBindingV1,
  VaultExportRunV1,
  VaultInspectionCandidateV1,
  VaultInspectionFrontmatterV1,
  VaultInspectionRunV1,
} from "@markorbit/contracts";
import {
  VAULT_INSPECTION_CONTRACT_VERSION,
  VAULT_INSPECTION_OBJECT_TYPE,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import type { VaultExportRunRepository } from "@markorbit/persistence/vault-export-runs";
import { SqliteVaultExportRunRepository } from "@markorbit/persistence/vault-export-runs";
import {
  newVaultInspectionRunId,
  SqliteVaultInspectionRunRepository,
  type VaultInspectionRunRepository,
} from "@markorbit/persistence/vault-inspection-runs";
import {
  SqliteVaultBindingRepository,
  type VaultBindingRepository,
} from "@markorbit/persistence/vault-bindings";
import { obsidianVaultFilesystemReadiness } from "./obsidian-vault-readiness";
import { getRegistryDatabase } from "./source-registry";

const MAX_FILES = 500;
const MAX_FILE_BYTES = 2_000_000;
const MAX_TOTAL_BYTES = 20_000_000;
const MAX_DEPTH = 12;
const MAX_WIKI_LINKS = 100;
const MAX_FRONTMATTER_LINES = 100;
const UTF8 = new TextDecoder("utf-8", { fatal: true });
const SIMPLE_KEY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u;

export type VaultInspectionOverview = {
  binding: VaultBindingV1 | null;
  filesystem: ReturnType<typeof obsidianVaultFilesystemReadiness>;
  recentRuns: VaultInspectionRunV1[];
};

export type VaultInspectionServiceDependencies = {
  bindings: VaultBindingRepository;
  exports: VaultExportRunRepository;
  inspections: VaultInspectionRunRepository;
  rootProvider?: () => string | undefined;
  clock?: () => Date;
  idFactory?: () => string;
};

type PresentFile = {
  bindingRelativePath: string;
  vaultRelativePath: string;
  observedSha256: string;
  sizeBytes: number;
  frontmatter: VaultInspectionFrontmatterV1;
  wikiLinks: string[];
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireWorkspaceId(value: string): string {
  const workspaceId = value?.trim();
  if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
  return workspaceId;
}

function managedEvidence(run: VaultExportRunV1) {
  return {
    exportRunId: run.id,
    stagingDocumentId: run.staging.stagingDocumentId,
    contentSha256: run.staging.contentSha256,
  };
}

function emptyMetadata(): Pick<VaultInspectionCandidateV1, "frontmatter" | "wikiLinks"> {
  return {
    frontmatter: { status: "NONE", keys: [], fields: {} },
    wikiLinks: [],
  };
}

function parseSimpleFrontmatter(markdown: string): VaultInspectionFrontmatterV1 {
  const lines = markdown.split(/\r?\n/u);
  if (lines[0] !== "---") return { status: "NONE", keys: [], fields: {} };
  const closing = lines.slice(1).findIndex((line) => line.trim() === "---");
  if (closing < 0) return { status: "MALFORMED", keys: [], fields: {} };
  const block = lines.slice(1, closing + 1);
  if (block.length > MAX_FRONTMATTER_LINES) {
    return { status: "UNSUPPORTED", keys: [], fields: {} };
  }

  const keys: string[] = [];
  const fields: Record<string, string> = {};
  for (const rawLine of block) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    if (/^\s/u.test(rawLine)) {
      return { status: "UNSUPPORTED", keys, fields: {} };
    }
    const separator = rawLine.indexOf(":");
    if (separator <= 0) return { status: "MALFORMED", keys, fields: {} };
    const key = rawLine.slice(0, separator).trim();
    const value = rawLine.slice(separator + 1).trim();
    if (!SIMPLE_KEY.test(key) || Object.hasOwn(fields, key)) {
      return { status: "MALFORMED", keys, fields: {} };
    }
    if (
      value.length > 500 ||
      /^[\[\]{|}>&*!]/u.test(value) ||
      /(^|\s)[&*!][A-Za-z0-9_-]+/u.test(value)
    ) {
      return { status: "UNSUPPORTED", keys: [...keys, key], fields: {} };
    }
    keys.push(key);
    fields[key] = value;
  }
  return { status: "PARSED_SIMPLE", keys, fields };
}

function parseWikiLinks(markdown: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();
  const pattern = /\[\[([^\]\n]{1,200})\]\]/gu;
  for (const match of markdown.matchAll(pattern)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    const target = raw.split("|", 1)[0]?.trim();
    if (!target || seen.has(target)) continue;
    seen.add(target);
    links.push(target);
    if (links.length >= MAX_WIKI_LINKS) break;
  }
  return links;
}

function assertDirectory(path: string, code: string, message: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new RegistryConflictError(code, message);
  }
}

function portableRelativePath(root: string, absolutePath: string): string {
  const value = relative(root, absolutePath).split(sep).join("/");
  if (!value || value.startsWith("../") || value === ".." || value.includes("\\")) {
    throw new RegistryConflictError(
      "VAULT_INSPECTION_PATH_ESCAPE",
      "Vault inspection encountered a path outside the bound Vault root",
    );
  }
  return value;
}

function resolveBoundRootReadOnly(root: string, relativeRoot: string): string | null {
  let current = root;
  for (const segment of relativeRoot.split("/")) {
    const next = resolve(current, segment);
    if (next === current || !next.startsWith(`${current}${sep}`)) {
      throw new RegistryConflictError(
        "VAULT_INSPECTION_BINDING_ESCAPE",
        "Vault binding escaped the configured server root",
      );
    }
    if (!existsSync(next)) return null;
    assertDirectory(
      next,
      "VAULT_INSPECTION_BOUND_ROOT_INVALID",
      "Bound Vault path segments must be real directories and not symbolic links",
    );
    current = next;
  }
  return current;
}

function scanMarkdownFiles(root: string, relativeRoot: string): PresentFile[] {
  const resolvedBoundRoot = resolveBoundRootReadOnly(root, relativeRoot);
  if (!resolvedBoundRoot) return [];
  const boundRoot: string = resolvedBoundRoot;

  const files: PresentFile[] = [];
  let totalBytes = 0;

  function walk(directory: string, depth: number): void {
    if (depth > MAX_DEPTH) {
      throw new RegistryConflictError(
        "VAULT_INSPECTION_DEPTH_LIMIT",
        `Vault inspection exceeded the maximum directory depth of ${MAX_DEPTH}`,
      );
    }
    const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      if (entry.name === ".obsidian" || entry.name === ".git") continue;
      const absolute = resolve(directory, entry.name);
      if (absolute !== directory && !absolute.startsWith(`${directory}${sep}`)) {
        throw new RegistryConflictError(
          "VAULT_INSPECTION_PATH_ESCAPE",
          "Vault inspection encountered an unsafe directory entry",
        );
      }
      const fileStat = lstatSync(absolute);
      if (fileStat.isSymbolicLink()) {
        throw new RegistryConflictError(
          "VAULT_INSPECTION_SYMLINK_FORBIDDEN",
          "Vault inspection refuses symbolic links inside the bound Vault directory",
        );
      }
      if (fileStat.isDirectory()) {
        walk(absolute, depth + 1);
        continue;
      }
      if (!fileStat.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
      if (files.length >= MAX_FILES) {
        throw new RegistryConflictError(
          "VAULT_INSPECTION_FILE_LIMIT",
          `Vault inspection exceeded the maximum of ${MAX_FILES} Markdown files`,
        );
      }
      const sizeBytes = statSync(absolute).size;
      if (sizeBytes > MAX_FILE_BYTES) {
        throw new RegistryConflictError(
          "VAULT_INSPECTION_FILE_TOO_LARGE",
          `Vault Markdown file exceeds the ${MAX_FILE_BYTES} byte inspection limit`,
        );
      }
      totalBytes += sizeBytes;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new RegistryConflictError(
          "VAULT_INSPECTION_TOTAL_BYTES_LIMIT",
          `Vault inspection exceeded the ${MAX_TOTAL_BYTES} byte total read limit`,
        );
      }
      const content = readFileSync(absolute);
      let markdown: string;
      try {
        markdown = UTF8.decode(content);
      } catch {
        throw new RegistryConflictError(
          "VAULT_INSPECTION_INVALID_UTF8",
          "Vault Markdown inspection requires valid UTF-8 content",
        );
      }
      const bindingRelativePath = portableRelativePath(boundRoot, absolute);
      files.push({
        bindingRelativePath,
        vaultRelativePath: `${relativeRoot}/${bindingRelativePath}`,
        observedSha256: sha256(content),
        sizeBytes,
        frontmatter: parseSimpleFrontmatter(markdown),
        wikiLinks: parseWikiLinks(markdown),
      });
    }
  }

  walk(boundRoot, 0);
  return files;
}

function latestManagedExports(
  exportsRepository: VaultExportRunRepository,
  workspaceId: string,
  relativeRoot: string,
): Map<string, VaultExportRunV1> {
  const prefix = `${relativeRoot}/`;
  const map = new Map<string, VaultExportRunV1>();
  for (const run of exportsRepository.list(workspaceId, 500)) {
    if (
      run.state !== "SUCCEEDED" ||
      !run.result ||
      !run.result.vaultRelativePath.startsWith(prefix)
    ) {
      continue;
    }
    if (!map.has(run.result.vaultRelativePath)) map.set(run.result.vaultRelativePath, run);
  }
  return map;
}

export class VaultInspectionService {
  private readonly rootProvider: () => string | undefined;
  private readonly clock: () => Date;
  private readonly idFactory: () => string;

  constructor(private readonly dependencies: VaultInspectionServiceDependencies) {
    this.rootProvider =
      dependencies.rootProvider ?? (() => process.env.MARKORBIT_OBSIDIAN_VAULT_ROOT);
    this.clock = dependencies.clock ?? (() => new Date());
    this.idFactory = dependencies.idFactory ?? newVaultInspectionRunId;
  }

  overview(workspaceIdValue: string): VaultInspectionOverview {
    const workspaceId = requireWorkspaceId(workspaceIdValue);
    return {
      binding: this.dependencies.bindings.getByWorkspaceId(workspaceId),
      filesystem: obsidianVaultFilesystemReadiness(this.rootProvider()),
      recentRuns: this.dependencies.inspections.list(workspaceId, 10),
    };
  }

  inspect(workspaceIdValue: string): VaultInspectionRunV1 {
    const workspaceId = requireWorkspaceId(workspaceIdValue);
    const binding = this.dependencies.bindings.getByWorkspaceId(workspaceId);
    if (!binding) {
      throw new RegistryConflictError(
        "VAULT_INSPECTION_BINDING_MISSING",
        "Workspace must have a Vault binding before inspection",
      );
    }
    if (binding.status !== "ACTIVE") {
      throw new RegistryConflictError(
        "VAULT_INSPECTION_BINDING_DISABLED",
        "Workspace Vault binding must be ACTIVE before inspection",
      );
    }
    const root = this.requireReadableRoot();
    const presentFiles = scanMarkdownFiles(root, binding.relativeRoot);
    const managed = latestManagedExports(
      this.dependencies.exports,
      workspaceId,
      binding.relativeRoot,
    );
    const candidates: VaultInspectionCandidateV1[] = [];
    const observedPaths = new Set<string>();

    for (const file of presentFiles) {
      observedPaths.add(file.vaultRelativePath);
      const previous = managed.get(file.vaultRelativePath);
      candidates.push({
        vaultRelativePath: file.vaultRelativePath,
        bindingRelativePath: file.bindingRelativePath,
        classification: previous
          ? previous.staging.contentSha256 === file.observedSha256
            ? "UNCHANGED"
            : "CONFLICT"
          : "IMPORT_CANDIDATE",
        observedSha256: file.observedSha256,
        sizeBytes: file.sizeBytes,
        ...(previous ? { managedExport: managedEvidence(previous) } : {}),
        frontmatter: file.frontmatter,
        wikiLinks: file.wikiLinks,
      });
    }

    for (const [vaultRelativePath, previous] of managed.entries()) {
      if (observedPaths.has(vaultRelativePath)) continue;
      candidates.push({
        vaultRelativePath,
        bindingRelativePath: vaultRelativePath.slice(binding.relativeRoot.length + 1),
        classification: "MISSING",
        managedExport: managedEvidence(previous),
        ...emptyMetadata(),
      });
    }

    candidates.sort((a, b) => a.vaultRelativePath.localeCompare(b.vaultRelativePath));
    const run: VaultInspectionRunV1 = {
      contractVersion: VAULT_INSPECTION_CONTRACT_VERSION,
      objectType: VAULT_INSPECTION_OBJECT_TYPE,
      id: this.idFactory(),
      workspaceId,
      rootFingerprintSha256: sha256(root),
      binding: {
        bindingId: binding.id,
        revision: binding.revision,
        relativeRoot: binding.relativeRoot,
      },
      candidates,
      observedAt: this.clock().toISOString(),
    };
    return this.dependencies.inspections.record(run);
  }

  private requireReadableRoot(): string {
    const raw = this.rootProvider()?.trim();
    const readiness = obsidianVaultFilesystemReadiness(raw);
    if (!readiness.configured || !raw || !isAbsolute(raw)) {
      throw new RegistryConflictError(
        readiness.issueCode ?? "OBSIDIAN_VAULT_ROOT_NOT_CONFIGURED",
        "Server Obsidian Vault root is not configured for inspection",
      );
    }
    const root = resolve(raw);
    if (!existsSync(root)) {
      throw new RegistryConflictError(
        "VAULT_INSPECTION_ROOT_NOT_FOUND",
        "Configured Obsidian Vault root does not exist; inspection never creates it",
      );
    }
    assertDirectory(
      root,
      "VAULT_INSPECTION_ROOT_INVALID",
      "Configured Obsidian Vault root must be a real directory and not a symbolic link",
    );
    return root;
  }
}

export function getConfiguredVaultInspectionService(): VaultInspectionService {
  const database = getRegistryDatabase();
  return new VaultInspectionService({
    bindings: new SqliteVaultBindingRepository(database),
    exports: new SqliteVaultExportRunRepository(database),
    inspections: new SqliteVaultInspectionRunRepository(database),
  });
}
