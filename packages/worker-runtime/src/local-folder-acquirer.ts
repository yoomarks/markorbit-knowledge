import { createHash } from "node:crypto";
import { lstat, open, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ArtifactKind, ExecutionExecutor } from "@markorbit/contracts";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";

export const LOCAL_FOLDER_CONNECTOR_ID = "local-folder";
export const LOCAL_FOLDER_CONNECTOR_VERSION = "1.0.0";
export const LOCAL_FOLDER_EXECUTOR: ExecutionExecutor = {
  executorId: "local-folder-worker",
  version: "1.0.0",
  mode: "PRODUCTION",
};

const DEFAULT_MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const DEFAULT_MAX_ITEMS = 500;
const DEFAULT_MAX_DEPTH = 20;
const ROOT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const FILE_TYPES: Record<string, { artifactKind: ArtifactKind; mimeType: string }> = {
  ".md": { artifactKind: "MARKDOWN", mimeType: "text/markdown" },
  ".markdown": { artifactKind: "MARKDOWN", mimeType: "text/markdown" },
  ".html": { artifactKind: "HTML", mimeType: "text/html" },
  ".htm": { artifactKind: "HTML", mimeType: "text/html" },
  ".pdf": { artifactKind: "PDF", mimeType: "application/pdf" },
  ".docx": {
    artifactKind: "DOCX",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  ".xlsx": {
    artifactKind: "XLSX",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  ".csv": { artifactKind: "CSV", mimeType: "text/csv" },
  ".json": { artifactKind: "JSON", mimeType: "application/json" },
  ".xml": { artifactKind: "XML", mimeType: "application/xml" },
  ".eml": { artifactKind: "EMAIL", mimeType: "message/rfc822" },
  ".txt": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".png": { artifactKind: "IMAGE", mimeType: "image/png" },
  ".jpg": { artifactKind: "IMAGE", mimeType: "image/jpeg" },
  ".jpeg": { artifactKind: "IMAGE", mimeType: "image/jpeg" },
  ".webp": { artifactKind: "IMAGE", mimeType: "image/webp" },
  ".tif": { artifactKind: "IMAGE", mimeType: "image/tiff" },
  ".tiff": { artifactKind: "IMAGE", mimeType: "image/tiff" },
};

export type LocalFolderRootMap = Readonly<Record<string, string>>;

export type LocalFolderAcquirerOptions = {
  roots: LocalFolderRootMap;
  maxArtifactBytes?: number;
  maxTotalBytes?: number;
  maxItems?: number;
  maxDepth?: number;
};

type LocalFolderSourceConfig = {
  rootId: string;
  relativePath: string;
  recursive: boolean;
  includeHidden: boolean;
};

type Candidate = {
  absolutePath: string;
  relativePath: string;
  artifactKind: ArtifactKind;
  mimeType: string;
};

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function hash(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizedRootId(value: unknown): string {
  if (typeof value !== "string" || !ROOT_ID_PATTERN.test(value)) {
    throw new CollectionAcquisitionError(
      "LOCAL_FOLDER_ROOT_ID_INVALID",
      "Local Folder connectorConfig.rootId must be a lowercase slug",
      false,
    );
  }
  return value;
}

export function normalizeLocalFolderRelativePath(value: unknown): string {
  if (typeof value !== "string") {
    throw new CollectionAcquisitionError(
      "LOCAL_FOLDER_RELATIVE_PATH_INVALID",
      "Local Folder connectorConfig.relativePath must be a string",
      false,
    );
  }
  const normalized = value.trim();
  if (!normalized) return "";
  if (
    normalized.includes("\\") ||
    normalized.includes("\u0000") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    isAbsolute(normalized)
  ) {
    throw new CollectionAcquisitionError(
      "LOCAL_FOLDER_RELATIVE_PATH_INVALID",
      "Local Folder relativePath must be a portable relative path without drive letters or backslashes",
      false,
    );
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new CollectionAcquisitionError(
      "LOCAL_FOLDER_RELATIVE_PATH_INVALID",
      "Local Folder relativePath must not contain empty, dot, or parent segments",
      false,
    );
  }
  return segments.join("/");
}

export function parseLocalFolderRoots(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("MARKORBIT_LOCAL_FOLDER_ROOTS must be a JSON object");
  }
  const container = record(parsed);
  if (!container) throw new Error("MARKORBIT_LOCAL_FOLDER_ROOTS must be a JSON object");

  const result: Record<string, string> = {};
  for (const [rootId, rawPath] of Object.entries(container)) {
    if (!ROOT_ID_PATTERN.test(rootId)) {
      throw new Error(`Invalid Local Folder root id: ${rootId}`);
    }
    if (typeof rawPath !== "string" || !rawPath.trim() || !isAbsolute(rawPath.trim())) {
      throw new Error(`Local Folder root ${rootId} must map to an absolute path`);
    }
    if (rawPath.includes("\u0000")) throw new Error(`Local Folder root ${rootId} contains NUL`);
    result[rootId] = rawPath.trim();
  }
  return result;
}

function sourceConfig(context: ArtifactBackedExecutionContext): LocalFolderSourceConfig {
  const config = record(context.job.sourceSnapshot.connectorConfig);
  if (!config) {
    throw new CollectionAcquisitionError(
      "LOCAL_FOLDER_CONFIG_INVALID",
      "Local Folder source requires connectorConfig",
      false,
    );
  }
  const recursive = config.recursive;
  const includeHidden = config.includeHidden;
  if (typeof recursive !== "boolean" || typeof includeHidden !== "boolean") {
    throw new CollectionAcquisitionError(
      "LOCAL_FOLDER_CONFIG_INVALID",
      "Local Folder recursive and includeHidden settings must be boolean",
      false,
    );
  }
  return {
    rootId: normalizedRootId(config.rootId),
    relativePath: normalizeLocalFolderRelativePath(config.relativePath),
    recursive,
    includeHidden,
  };
}

function assertSupportedJob(
  context: ArtifactBackedExecutionContext,
  workerMaxItems: number,
  workerMaxDepth: number,
): void {
  if (context.job.connector.connectorId !== LOCAL_FOLDER_CONNECTOR_ID) {
    throw new CollectionAcquisitionError(
      "CONNECTOR_NOT_SUPPORTED",
      `Local Folder acquirer cannot execute connector ${context.job.connector.connectorId}`,
      false,
    );
  }
  if (context.job.sourceSnapshot.sourceType !== "LOCAL_FOLDER") {
    throw new CollectionAcquisitionError(
      "SOURCE_TYPE_NOT_SUPPORTED",
      `Local Folder acquirer requires LOCAL_FOLDER sources, received ${context.job.sourceSnapshot.sourceType}`,
      false,
    );
  }
  if (context.job.jobType !== "LOCAL_FILE_SCAN") {
    throw new CollectionAcquisitionError(
      "JOB_TYPE_NOT_SUPPORTED",
      `Local Folder acquirer requires LOCAL_FILE_SCAN, received ${context.job.jobType}`,
      false,
    );
  }
  if (context.job.planSnapshot.policy.maxItems > workerMaxItems) {
    throw new CollectionAcquisitionError(
      "LOCAL_FOLDER_ITEM_LIMIT_EXCEEDED",
      `CollectionPlan maxItems ${context.job.planSnapshot.policy.maxItems} exceeds Worker limit ${workerMaxItems}`,
      false,
    );
  }
  if (context.job.planSnapshot.policy.maxDepth > workerMaxDepth) {
    throw new CollectionAcquisitionError(
      "LOCAL_FOLDER_DEPTH_LIMIT_EXCEEDED",
      `CollectionPlan maxDepth ${context.job.planSnapshot.policy.maxDepth} exceeds Worker limit ${workerMaxDepth}`,
      false,
    );
  }
}

function pathInside(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" ||
    (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot))
  );
}

async function resolveAuthorizedFolder(rootPath: string, relativePath: string): Promise<string> {
  const canonicalRoot = await realpath(rootPath);
  const rootMetadata = await stat(canonicalRoot);
  if (!rootMetadata.isDirectory()) {
    throw new CollectionAcquisitionError(
      "LOCAL_FOLDER_ROOT_NOT_DIRECTORY",
      "Configured Local Folder root is not a directory",
      false,
    );
  }

  let cursor = canonicalRoot;
  for (const segment of relativePath ? relativePath.split("/") : []) {
    cursor = resolve(cursor, segment);
    const metadata = await lstat(cursor);
    if (metadata.isSymbolicLink()) {
      throw new CollectionAcquisitionError(
        "LOCAL_FOLDER_SYMLINK_FORBIDDEN",
        "Local Folder source path must not traverse symbolic links",
        false,
      );
    }
  }

  const canonicalTarget = await realpath(cursor);
  if (!pathInside(canonicalRoot, canonicalTarget)) {
    throw new CollectionAcquisitionError(
      "LOCAL_FOLDER_PATH_ESCAPE",
      "Local Folder source resolved outside its configured root",
      false,
    );
  }
  const targetMetadata = await stat(canonicalTarget);
  if (!targetMetadata.isDirectory()) {
    throw new CollectionAcquisitionError(
      "LOCAL_FOLDER_TARGET_NOT_DIRECTORY",
      "Local Folder relativePath must resolve to a directory",
      false,
    );
  }
  return canonicalTarget;
}

function extension(path: string): string {
  const name = path.split("/").pop() ?? path;
  const position = name.lastIndexOf(".");
  return position <= 0 ? "" : name.slice(position).toLowerCase();
}

function globRegex(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]!;
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += "\\.^$+{}()|[]".includes(char) ? `\\${char}` : char;
  }
  return new RegExp(`${source}$`);
}

function matchesPatterns(path: string, includes: string[], excludes: string[]): boolean {
  const included =
    includes.length === 0 || includes.some((pattern) => globRegex(pattern).test(path));
  if (!included) return false;
  return !excludes.some((pattern) => globRegex(pattern).test(path));
}

function encodedLogicalUri(rootId: string, relativePath: string): string {
  const encodedPath = relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `local-folder://${rootId}/${encodedPath}`;
}

async function readStableFile(
  root: string,
  absolutePath: string,
  maxArtifactBytes: number,
): Promise<{ content: Uint8Array; sizeBytes: number; mtimeMs: number }> {
  const before = await lstat(absolutePath);
  if (before.isSymbolicLink()) {
    throw new CollectionAcquisitionError(
      "LOCAL_FOLDER_SYMLINK_FORBIDDEN",
      "Local Folder scan encountered a symbolic link",
      false,
    );
  }
  if (!before.isFile()) {
    throw new CollectionAcquisitionError(
      "LOCAL_FOLDER_NON_FILE_ENTRY",
      "Local Folder scan expected a regular file",
      false,
    );
  }
  if (before.size <= 0) {
    throw new CollectionAcquisitionError(
      "LOCAL_FOLDER_EMPTY_FILE",
      "Local Folder scan does not ingest empty files",
      false,
    );
  }
  if (before.size > maxArtifactBytes) {
    throw new CollectionAcquisitionError(
      "LOCAL_FOLDER_ARTIFACT_TOO_LARGE",
      `Local Folder file exceeds the ${maxArtifactBytes} byte Worker limit`,
      false,
    );
  }

  const canonical = await realpath(absolutePath);
  if (!pathInside(root, canonical)) {
    throw new CollectionAcquisitionError(
      "LOCAL_FOLDER_PATH_ESCAPE",
      "Local Folder file resolved outside its configured root",
      false,
    );
  }

  const handle = await open(canonical, "r");
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size !== before.size) {
      throw new CollectionAcquisitionError(
        "LOCAL_FOLDER_FILE_CHANGED",
        "Local Folder file changed while preparing its immutable snapshot",
        true,
      );
    }
    const content = await handle.readFile();
    const after = await handle.stat();
    const canonicalAfter = await realpath(absolutePath);
    const logicalAfter = await lstat(absolutePath);
    if (
      logicalAfter.isSymbolicLink() ||
      canonicalAfter !== canonical ||
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      content.byteLength !== opened.size
    ) {
      throw new CollectionAcquisitionError(
        "LOCAL_FOLDER_FILE_CHANGED",
        "Local Folder file changed while preparing its immutable snapshot",
        true,
      );
    }
    return { content, sizeBytes: opened.size, mtimeMs: opened.mtimeMs };
  } finally {
    await handle.close();
  }
}

export class LocalFolderArtifactAcquirer implements CollectionArtifactAcquirer {
  readonly executor = LOCAL_FOLDER_EXECUTOR;
  private readonly roots: LocalFolderRootMap;
  private readonly maxArtifactBytes: number;
  private readonly maxTotalBytes: number;
  private readonly maxItems: number;
  private readonly maxDepth: number;

  constructor(options: LocalFolderAcquirerOptions) {
    this.roots = { ...options.roots };
    this.maxArtifactBytes = positiveInteger(
      options.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES,
      "maxArtifactBytes",
    );
    this.maxTotalBytes = positiveInteger(
      options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
      "maxTotalBytes",
    );
    this.maxItems = positiveInteger(options.maxItems ?? DEFAULT_MAX_ITEMS, "maxItems");
    this.maxDepth = nonNegativeInteger(options.maxDepth ?? DEFAULT_MAX_DEPTH, "maxDepth");
  }

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    assertSupportedJob(context, this.maxItems, this.maxDepth);
    const config = sourceConfig(context);
    const configuredRoot = this.roots[config.rootId];
    if (!configuredRoot) {
      throw new CollectionAcquisitionError(
        "LOCAL_FOLDER_ROOT_NOT_ALLOWED",
        `Worker has no allowed Local Folder root named ${config.rootId}`,
        false,
      );
    }

    const canonicalRoot = await realpath(configuredRoot);
    const targetFolder = await resolveAuthorizedFolder(configuredRoot, config.relativePath);
    const authorizedKinds = new Set(context.job.planSnapshot.output.artifactKinds);
    const candidates: Candidate[] = [];
    const maxPlanDepth = context.job.planSnapshot.policy.maxDepth;
    const maxPlanItems = context.job.planSnapshot.policy.maxItems;

    const walk = async (folder: string, logicalPrefix: string, depth: number): Promise<void> => {
      const entries = (await readdir(folder, { withFileTypes: true })).sort((left, right) =>
        left.name.localeCompare(right.name),
      );
      for (const entry of entries) {
        if (!config.includeHidden && entry.name.startsWith(".")) continue;
        const absolutePath = resolve(folder, entry.name);
        const logicalPath = logicalPrefix ? `${logicalPrefix}/${entry.name}` : entry.name;
        const metadata = await lstat(absolutePath);
        if (metadata.isSymbolicLink()) {
          throw new CollectionAcquisitionError(
            "LOCAL_FOLDER_SYMLINK_FORBIDDEN",
            `Local Folder scan encountered symbolic link ${logicalPath}`,
            false,
          );
        }
        if (metadata.isDirectory()) {
          if (config.recursive && depth < maxPlanDepth) {
            const canonicalDirectory = await realpath(absolutePath);
            if (!pathInside(canonicalRoot, canonicalDirectory)) {
              throw new CollectionAcquisitionError(
                "LOCAL_FOLDER_PATH_ESCAPE",
                "Local Folder directory resolved outside its configured root",
                false,
              );
            }
            await walk(canonicalDirectory, logicalPath, depth + 1);
          }
          continue;
        }
        if (!metadata.isFile()) continue;
        if (
          !matchesPatterns(
            logicalPath,
            context.job.planSnapshot.policy.includePatterns,
            context.job.planSnapshot.policy.excludePatterns,
          )
        ) {
          continue;
        }
        const type = FILE_TYPES[extension(logicalPath)];
        if (!type || !authorizedKinds.has(type.artifactKind)) continue;
        candidates.push({ absolutePath, relativePath: logicalPath, ...type });
        if (candidates.length > maxPlanItems) {
          throw new CollectionAcquisitionError(
            "LOCAL_FOLDER_ITEM_LIMIT_EXCEEDED",
            `Local Folder scan found more than the authorized ${maxPlanItems} artifacts`,
            false,
          );
        }
      }
    };

    await walk(targetFolder, "", 0);
    if (candidates.length === 0) {
      throw new CollectionAcquisitionError(
        "LOCAL_FOLDER_NO_SUPPORTED_FILES",
        "Local Folder scan found no files matching the authorized artifact kinds and patterns",
        false,
      );
    }

    const artifacts: AcquiredCollectionArtifact[] = [];
    let totalBytes = 0;
    for (const candidate of candidates.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    )) {
      const snapshot = await readStableFile(
        canonicalRoot,
        candidate.absolutePath,
        this.maxArtifactBytes,
      );
      totalBytes += snapshot.sizeBytes;
      if (totalBytes > this.maxTotalBytes) {
        throw new CollectionAcquisitionError(
          "LOCAL_FOLDER_TOTAL_BYTES_EXCEEDED",
          `Local Folder scan exceeds the ${this.maxTotalBytes} byte Worker total limit`,
          false,
        );
      }
      const contentSha256 = hash(snapshot.content);
      const snapshotSha256 = hash(
        `${candidate.relativePath}\u0000${snapshot.sizeBytes}\u0000${snapshot.mtimeMs}\u0000${contentSha256}`,
      );
      const canonicalUri = encodedLogicalUri(config.rootId, candidate.relativePath);
      const sourceUri = `${canonicalUri}?sha256=${contentSha256}&snapshot=${snapshotSha256}&size=${snapshot.sizeBytes}`;
      artifacts.push({
        artifactKind: candidate.artifactKind,
        mimeType: candidate.mimeType,
        originalName: candidate.relativePath.split("/").pop()!,
        sourceUri,
        canonicalUri,
        content: snapshot.content,
      });
    }
    return artifacts;
  }
}
