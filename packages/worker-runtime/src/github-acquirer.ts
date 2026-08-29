import { createHash } from "node:crypto";
import type { ArtifactKind, ExecutionExecutor } from "@markorbit/contracts";
import {
  defaultApiResolver,
  defaultApiTransport,
  type ApiResolvedAddress,
  type ApiResolver,
  type ApiTransport,
  type ApiTransportResponse,
} from "./api-acquirer";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import { isPublicNetworkAddress } from "./public-network-policy";

export const GITHUB_CONNECTOR_ID = "github-worker";
export const GITHUB_CONNECTOR_VERSION = "1.0.0";
export const GITHUB_EXECUTOR: ExecutionExecutor = {
  executorId: GITHUB_CONNECTOR_ID,
  version: GITHUB_CONNECTOR_VERSION,
  mode: "PRODUCTION",
};

const GITHUB_API_HOST = "api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_TREE_ENTRIES = 20_000;
const DEFAULT_MAX_ITEMS = 500;
const DEFAULT_MAX_DEPTH = 30;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
const MAX_TREE_ENTRIES = 100_000;
const MAX_ITEMS = 5_000;
const MAX_DEPTH = 60;
const MAX_METADATA_RESPONSE_BYTES = 25 * 1024 * 1024;
const MAX_BLOB_RESPONSE_BYTES = 32 * 1024 * 1024;
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const TOKEN_CONTROL = /[\u0000-\u001f\u007f]/;
const SHA_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

const FILE_TYPES: Record<string, { artifactKind: ArtifactKind; mimeType: string }> = {
  ".md": { artifactKind: "MARKDOWN", mimeType: "text/markdown" },
  ".markdown": { artifactKind: "MARKDOWN", mimeType: "text/markdown" },
  ".html": { artifactKind: "HTML", mimeType: "text/html" },
  ".htm": { artifactKind: "HTML", mimeType: "text/html" },
  ".json": { artifactKind: "JSON", mimeType: "application/json" },
  ".xml": { artifactKind: "XML", mimeType: "application/xml" },
  ".rss": { artifactKind: "XML", mimeType: "application/rss+xml" },
  ".atom": { artifactKind: "XML", mimeType: "application/atom+xml" },
  ".csv": { artifactKind: "CSV", mimeType: "text/csv" },
  ".txt": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".yaml": { artifactKind: "TEXT", mimeType: "text/yaml" },
  ".yml": { artifactKind: "TEXT", mimeType: "text/yaml" },
  ".toml": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".ini": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".conf": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".properties": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".ts": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".tsx": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".js": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".jsx": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".mjs": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".cjs": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".py": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".go": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".rs": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".java": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".kt": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".kts": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".c": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".cc": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".cpp": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".h": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".hpp": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".cs": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".rb": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".php": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".swift": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".scala": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".sh": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".bash": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".zsh": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".fish": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".ps1": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".sql": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".graphql": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".gql": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".proto": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".tf": { artifactKind: "TEXT", mimeType: "text/plain" },
  ".hcl": { artifactKind: "TEXT", mimeType: "text/plain" },
};

const TEXT_FILENAMES = new Set([
  "dockerfile",
  "makefile",
  "license",
  "notice",
  "authors",
  "contributors",
  "changelog",
  "changes",
]);

export type GitHubArtifactAcquirerOptions = {
  environment?: NodeJS.ProcessEnv;
  resolver?: ApiResolver;
  transport?: ApiTransport;
  maxFileBytes?: number;
  maxTotalBytes?: number;
  maxTreeEntries?: number;
  maxItems?: number;
  maxDepth?: number;
};

type GitHubSourceConfig = {
  owner: string;
  repository: string;
  ref: string;
  pathPrefix: string;
};

type GitHubCommit = {
  sha: string;
  treeSha: string;
};

type GitHubTreeEntry = {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
};

type Candidate = GitHubTreeEntry & {
  relativePath: string;
  artifactKind: ArtifactKind;
  mimeType: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function positiveInteger(value: number, field: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${field} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

function nonNegativeInteger(value: number, field: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${field} must be an integer between 0 and ${maximum}`);
  }
  return value;
}

function normalizeOwner(value: unknown): string {
  if (typeof value !== "string" || !OWNER_PATTERN.test(value)) {
    throw new CollectionAcquisitionError(
      "GITHUB_OWNER_INVALID",
      "GitHub connectorConfig.owner must be a valid GitHub owner name",
      false,
    );
  }
  return value;
}

function normalizeRepository(value: unknown): string {
  if (
    typeof value !== "string" ||
    !REPOSITORY_PATTERN.test(value) ||
    value === "." ||
    value === ".."
  ) {
    throw new CollectionAcquisitionError(
      "GITHUB_REPOSITORY_INVALID",
      "GitHub connectorConfig.repository must be a bounded repository name",
      false,
    );
  }
  return value;
}

function normalizeRef(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new CollectionAcquisitionError(
      "GITHUB_REF_INVALID",
      "GitHub connectorConfig.ref must contain 1 to 256 characters",
      false,
    );
  }
  if (
    !/^[A-Za-z0-9._/-]+$/.test(value) ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("//") ||
    value.includes("..") ||
    value.includes("@{") ||
    value.endsWith(".")
  ) {
    throw new CollectionAcquisitionError(
      "GITHUB_REF_INVALID",
      "GitHub ref contains unsupported or ambiguous ref syntax",
      false,
    );
  }
  return value;
}

export function normalizeGitHubPathPrefix(value: unknown): string {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || value.length > 2_048) {
    throw new CollectionAcquisitionError(
      "GITHUB_PATH_PREFIX_INVALID",
      "GitHub pathPrefix must be a bounded portable relative path",
      false,
    );
  }
  if (
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new CollectionAcquisitionError(
      "GITHUB_PATH_PREFIX_INVALID",
      "GitHub pathPrefix must be a portable relative path",
      false,
    );
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new CollectionAcquisitionError(
      "GITHUB_PATH_PREFIX_INVALID",
      "GitHub pathPrefix must not contain empty, dot, or parent segments",
      false,
    );
  }
  return segments.join("/");
}

function sourceConfig(context: ArtifactBackedExecutionContext): GitHubSourceConfig {
  const config = record(context.job.sourceSnapshot.connectorConfig);
  if (!config) {
    throw new CollectionAcquisitionError(
      "GITHUB_CONFIG_INVALID",
      "GitHub source requires connectorConfig",
      false,
    );
  }
  const allowed = new Set(["owner", "repository", "ref", "pathPrefix"]);
  const unknown = Object.keys(config).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new CollectionAcquisitionError(
      "GITHUB_CONFIG_INVALID",
      `GitHub connectorConfig contains unsupported fields: ${unknown.sort().join(", ")}`,
      false,
    );
  }
  return {
    owner: normalizeOwner(config.owner),
    repository: normalizeRepository(config.repository),
    ref: normalizeRef(config.ref),
    pathPrefix: normalizeGitHubPathPrefix(config.pathPrefix),
  };
}

function extension(path: string): string {
  const name = path.split("/").pop() ?? path;
  const index = name.lastIndexOf(".");
  return index <= 0 ? "" : name.slice(index).toLowerCase();
}

function fileType(path: string): { artifactKind: ArtifactKind; mimeType: string } | null {
  const name = (path.split("/").pop() ?? path).toLowerCase();
  const byExtension = FILE_TYPES[extension(path)];
  if (byExtension) return byExtension;
  if (TEXT_FILENAMES.has(name)) return { artifactKind: "TEXT", mimeType: "text/plain" };
  return null;
}

function safeRepositoryPath(path: unknown): string {
  if (
    typeof path !== "string" ||
    !path ||
    path.length > 4_096 ||
    path.startsWith("/") ||
    path.endsWith("/") ||
    path.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(path)
  ) {
    throw new CollectionAcquisitionError(
      "GITHUB_TREE_PATH_INVALID",
      "GitHub tree contains a non-portable repository path",
      false,
    );
  }
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new CollectionAcquisitionError(
      "GITHUB_TREE_PATH_INVALID",
      "GitHub tree contains dot, parent, or empty path segments",
      false,
    );
  }
  return segments.join("/");
}

function underPrefix(path: string, prefix: string): string | null {
  if (!prefix) return path;
  if (path === prefix) return "";
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : null;
}

function globRegex(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (character === "?") {
      source += "[^/]";
      continue;
    }
    source += "\\.^$+{}()|[]".includes(character) ? `\\${character}` : character;
  }
  return new RegExp(`${source}$`);
}

function matchesPatterns(path: string, includes: string[], excludes: string[]): boolean {
  const included =
    includes.length === 0 || includes.some((pattern) => globRegex(pattern).test(path));
  return included && !excludes.some((pattern) => globRegex(pattern).test(path));
}

function depthOf(path: string): number {
  return path ? Math.max(0, path.split("/").length - 1) : 0;
}

function encodedPath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function repoIdentity(config: GitHubSourceConfig): string {
  return `${config.owner.toLowerCase()}/${config.repository.toLowerCase()}`;
}

function tokenHeaders(environment: NodeJS.ProcessEnv): Record<string, string> {
  const token = environment.MARKORBIT_GITHUB_TOKEN?.trim();
  if (!token) return {};
  if (token.length > 4_096 || TOKEN_CONTROL.test(token)) {
    throw new CollectionAcquisitionError(
      "GITHUB_CREDENTIAL_INVALID",
      "GitHub Worker token contains invalid characters or exceeds the v1 bound",
      false,
    );
  }
  return { authorization: `Bearer ${token}` };
}

function requestHeaders(environment: NodeJS.ProcessEnv): Record<string, string> {
  return {
    accept: "application/vnd.github+json",
    "user-agent": "MarkOrbit-Knowledge-GitHub-Worker/1.0",
    "x-github-api-version": GITHUB_API_VERSION,
    ...tokenHeaders(environment),
  };
}

function statusFailure(status: number, response: ApiTransportResponse): CollectionAcquisitionError {
  if (status >= 300 && status < 400) {
    return new CollectionAcquisitionError(
      "GITHUB_REDIRECT_REJECTED",
      "GitHub Connector V1 does not follow redirects",
      false,
    );
  }
  const remaining = response.headers["x-ratelimit-remaining"];
  const rateLimited = (Array.isArray(remaining) ? remaining[0] : remaining) === "0";
  const retryable =
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500 ||
    (status === 403 && rateLimited);
  return new CollectionAcquisitionError(
    status === 401 || status === 403
      ? "GITHUB_AUTH_OR_RATE_LIMIT_REJECTED"
      : "GITHUB_HTTP_STATUS_REJECTED",
    `GitHub API returned HTTP ${status}`,
    retryable,
  );
}

function normalizeTransportError(error: unknown): never {
  if (error instanceof CollectionAcquisitionError) {
    if (error.code === "API_TIMEOUT") {
      throw new CollectionAcquisitionError("GITHUB_TIMEOUT", "GitHub API request timed out", true);
    }
    if (error.code === "API_RESPONSE_TOO_LARGE") {
      throw new CollectionAcquisitionError(
        "GITHUB_RESPONSE_TOO_LARGE",
        "GitHub API response exceeded the governed response bound",
        false,
      );
    }
    if (error.code.startsWith("API_")) {
      throw new CollectionAcquisitionError(
        "GITHUB_TRANSPORT_FAILED",
        "GitHub HTTPS transport failed",
        error.retryable,
      );
    }
    throw error;
  }
  const code = record(error)?.code;
  const retryable = new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ETIMEDOUT",
  ]);
  throw new CollectionAcquisitionError(
    "GITHUB_TRANSPORT_FAILED",
    "GitHub HTTPS transport failed before a governed response was obtained",
    typeof code === "string" ? retryable.has(code) : true,
  );
}

function parseJsonResponse(
  response: ApiTransportResponse,
  purpose: string,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.body));
  } catch {
    throw new CollectionAcquisitionError(
      "GITHUB_JSON_INVALID",
      `GitHub ${purpose} response was not valid UTF-8 JSON`,
      false,
    );
  }
  const container = record(parsed);
  if (!container) {
    throw new CollectionAcquisitionError(
      "GITHUB_JSON_INVALID",
      `GitHub ${purpose} response must be a JSON object`,
      false,
    );
  }
  return container;
}

function parseCommit(response: ApiTransportResponse): GitHubCommit {
  const root = parseJsonResponse(response, "commit");
  const commit = record(root.commit);
  const tree = record(commit?.tree);
  if (
    typeof root.sha !== "string" ||
    !SHA_PATTERN.test(root.sha) ||
    typeof tree?.sha !== "string" ||
    !SHA_PATTERN.test(tree.sha)
  ) {
    throw new CollectionAcquisitionError(
      "GITHUB_COMMIT_INVALID",
      "GitHub commit response did not contain bounded commit and tree identities",
      false,
    );
  }
  return { sha: root.sha, treeSha: tree.sha };
}

function parseTree(response: ApiTransportResponse, maxTreeEntries: number): GitHubTreeEntry[] {
  const root = parseJsonResponse(response, "tree");
  if (root.truncated === true) {
    throw new CollectionAcquisitionError(
      "GITHUB_TREE_TRUNCATED",
      "GitHub recursive tree response was truncated; narrow the Source path or repository scope",
      false,
    );
  }
  if (!Array.isArray(root.tree)) {
    throw new CollectionAcquisitionError(
      "GITHUB_TREE_INVALID",
      "GitHub tree response is missing tree entries",
      false,
    );
  }
  if (root.tree.length > maxTreeEntries) {
    throw new CollectionAcquisitionError(
      "GITHUB_TREE_LIMIT_EXCEEDED",
      `GitHub tree contains ${root.tree.length} entries, exceeding Worker limit ${maxTreeEntries}`,
      false,
    );
  }
  const seen = new Set<string>();
  const entries: GitHubTreeEntry[] = [];
  for (const rawEntry of root.tree) {
    const entry = record(rawEntry);
    if (!entry)
      throw new CollectionAcquisitionError(
        "GITHUB_TREE_INVALID",
        "GitHub tree entry is invalid",
        false,
      );
    const path = safeRepositoryPath(entry.path as string);
    if (seen.has(path)) {
      throw new CollectionAcquisitionError(
        "GITHUB_TREE_INVALID",
        "GitHub tree contains duplicate paths",
        false,
      );
    }
    seen.add(path);
    if (
      typeof entry.mode !== "string" ||
      !["blob", "tree", "commit"].includes(String(entry.type)) ||
      typeof entry.sha !== "string" ||
      !SHA_PATTERN.test(entry.sha)
    ) {
      throw new CollectionAcquisitionError(
        "GITHUB_TREE_INVALID",
        "GitHub tree entry metadata is invalid",
        false,
      );
    }
    if (
      entry.size !== undefined &&
      (!Number.isSafeInteger(entry.size) || (entry.size as number) < 0)
    ) {
      throw new CollectionAcquisitionError(
        "GITHUB_TREE_INVALID",
        "GitHub tree entry size is invalid",
        false,
      );
    }
    entries.push({
      path,
      mode: entry.mode,
      type: entry.type as GitHubTreeEntry["type"],
      sha: entry.sha,
      ...(typeof entry.size === "number" ? { size: entry.size } : {}),
    });
  }
  return entries;
}

function parseBlob(
  response: ApiTransportResponse,
  expected: GitHubTreeEntry,
  maxFileBytes: number,
): Uint8Array {
  const root = parseJsonResponse(response, "blob");
  if (root.encoding !== "base64" || typeof root.content !== "string") {
    throw new CollectionAcquisitionError(
      "GITHUB_BLOB_INVALID",
      "GitHub blob response must contain base64 content",
      false,
    );
  }
  const normalized = root.content.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
    throw new CollectionAcquisitionError(
      "GITHUB_BLOB_INVALID",
      "GitHub blob content is not valid base64",
      false,
    );
  }
  const content = Buffer.from(normalized, "base64");
  if (content.byteLength === 0) {
    throw new CollectionAcquisitionError(
      "GITHUB_EMPTY_FILE",
      "GitHub matched file is empty",
      false,
    );
  }
  if (content.byteLength > maxFileBytes) {
    throw new CollectionAcquisitionError(
      "GITHUB_FILE_TOO_LARGE",
      `GitHub file exceeds the ${maxFileBytes}-byte Worker limit`,
      false,
    );
  }
  if (expected.size !== undefined && expected.size !== content.byteLength) {
    throw new CollectionAcquisitionError(
      "GITHUB_BLOB_SIZE_MISMATCH",
      "GitHub blob size differs from tree evidence",
      true,
    );
  }
  const algorithm = expected.sha.length === 64 ? "sha256" : "sha1";
  const header = Buffer.from(`blob ${content.byteLength}\0`, "utf8");
  const objectSha = createHash(algorithm).update(header).update(content).digest("hex");
  if (objectSha !== expected.sha) {
    throw new CollectionAcquisitionError(
      "GITHUB_BLOB_HASH_MISMATCH",
      "GitHub blob bytes do not match tree identity",
      true,
    );
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    throw new CollectionAcquisitionError(
      "GITHUB_NON_TEXT_BLOB",
      "GitHub matched file is not valid UTF-8 text; binary ingestion is outside V1",
      false,
    );
  }
  if (content.includes(0)) {
    throw new CollectionAcquisitionError(
      "GITHUB_NON_TEXT_BLOB",
      "GitHub matched file contains NUL bytes; binary ingestion is outside V1",
      false,
    );
  }
  return content;
}

function assertSupportedJob(
  context: ArtifactBackedExecutionContext,
  maxItems: number,
  maxDepth: number,
): void {
  if (context.job.sourceSnapshot.sourceType !== "GITHUB") {
    throw new CollectionAcquisitionError(
      "SOURCE_TYPE_NOT_SUPPORTED",
      `GitHub acquirer requires GITHUB sources, received ${context.job.sourceSnapshot.sourceType}`,
      false,
    );
  }
  if (context.job.jobType !== "WEB_CRAWL") {
    throw new CollectionAcquisitionError(
      "JOB_TYPE_NOT_SUPPORTED",
      `GitHub acquirer requires WEB_CRAWL, received ${context.job.jobType}`,
      false,
    );
  }
  if (
    context.job.connector.connectorId !== GITHUB_CONNECTOR_ID ||
    context.job.connector.version !== GITHUB_CONNECTOR_VERSION
  ) {
    throw new CollectionAcquisitionError(
      "CONNECTOR_NOT_SUPPORTED",
      `GitHub acquirer requires ${GITHUB_CONNECTOR_ID}@${GITHUB_CONNECTOR_VERSION}`,
      false,
    );
  }
  if (context.job.planSnapshot.policy.maxItems > maxItems) {
    throw new CollectionAcquisitionError(
      "GITHUB_ITEM_LIMIT_EXCEEDED",
      `CollectionPlan maxItems ${context.job.planSnapshot.policy.maxItems} exceeds Worker limit ${maxItems}`,
      false,
    );
  }
  if (context.job.planSnapshot.policy.maxDepth > maxDepth) {
    throw new CollectionAcquisitionError(
      "GITHUB_DEPTH_LIMIT_EXCEEDED",
      `CollectionPlan maxDepth ${context.job.planSnapshot.policy.maxDepth} exceeds Worker limit ${maxDepth}`,
      false,
    );
  }
  if (!context.job.planSnapshot.output.artifactKinds.includes("JSON")) {
    throw new CollectionAcquisitionError(
      "GITHUB_JSON_EVIDENCE_REQUIRED",
      "GitHub CollectionPlan must authorize JSON for immutable commit/tree evidence",
      false,
    );
  }
}

export class GitHubArtifactAcquirer implements CollectionArtifactAcquirer {
  readonly executor = GITHUB_EXECUTOR;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly resolver: ApiResolver;
  private readonly transport: ApiTransport;
  private readonly maxFileBytes: number;
  private readonly maxTotalBytes: number;
  private readonly maxTreeEntries: number;
  private readonly maxItems: number;
  private readonly maxDepth: number;

  constructor(options: GitHubArtifactAcquirerOptions = {}) {
    this.environment = options.environment ?? process.env;
    this.resolver = options.resolver ?? defaultApiResolver;
    this.transport = options.transport ?? defaultApiTransport;
    this.maxFileBytes = positiveInteger(
      options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
      "maxFileBytes",
      MAX_FILE_BYTES,
    );
    this.maxTotalBytes = positiveInteger(
      options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
      "maxTotalBytes",
      MAX_TOTAL_BYTES,
    );
    if (this.maxTotalBytes < this.maxFileBytes) {
      throw new Error("maxTotalBytes must be at least maxFileBytes");
    }
    this.maxTreeEntries = positiveInteger(
      options.maxTreeEntries ?? DEFAULT_MAX_TREE_ENTRIES,
      "maxTreeEntries",
      MAX_TREE_ENTRIES,
    );
    this.maxItems = positiveInteger(options.maxItems ?? DEFAULT_MAX_ITEMS, "maxItems", MAX_ITEMS);
    this.maxDepth = nonNegativeInteger(
      options.maxDepth ?? DEFAULT_MAX_DEPTH,
      "maxDepth",
      MAX_DEPTH,
    );
  }

  private async request(
    resolved: ApiResolvedAddress,
    path: string,
    maxResponseBytes: number,
    headers: Record<string, string>,
  ): Promise<ApiTransportResponse> {
    let response: ApiTransportResponse;
    try {
      response = await this.transport({
        hostname: GITHUB_API_HOST,
        resolvedAddress: resolved.address,
        family: resolved.family,
        port: 443,
        servername: GITHUB_API_HOST,
        path,
        hostHeader: GITHUB_API_HOST,
        headers,
        timeoutMs: 30_000,
        maxResponseBytes,
      });
    } catch (error) {
      return normalizeTransportError(error);
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw statusFailure(response.statusCode, response);
    }
    return response;
  }

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    assertSupportedJob(context, this.maxItems, this.maxDepth);
    const config = sourceConfig(context);
    const headers = requestHeaders(this.environment);
    let resolved: ApiResolvedAddress[];
    try {
      resolved = await this.resolver(GITHUB_API_HOST);
    } catch (error) {
      return normalizeTransportError(error);
    }
    if (
      resolved.length === 0 ||
      resolved.some((item) => !isPublicNetworkAddress(item.address, item.family))
    ) {
      throw new CollectionAcquisitionError(
        "GITHUB_NETWORK_TARGET_REJECTED",
        "GitHub API resolution did not produce an exclusively public address set",
        false,
      );
    }
    const selected = resolved[0]!;
    const owner = encodeURIComponent(config.owner);
    const repository = encodeURIComponent(config.repository);
    const ref = encodeURIComponent(config.ref);
    const commitResponse = await this.request(
      selected,
      `/repos/${owner}/${repository}/commits/${ref}`,
      MAX_METADATA_RESPONSE_BYTES,
      headers,
    );
    const commit = parseCommit(commitResponse);
    const treeResponse = await this.request(
      selected,
      `/repos/${owner}/${repository}/git/trees/${commit.treeSha}?recursive=1`,
      MAX_METADATA_RESPONSE_BYTES,
      headers,
    );
    const tree = parseTree(treeResponse, this.maxTreeEntries);
    const metadataBytes = commitResponse.body.byteLength + treeResponse.body.byteLength;
    if (metadataBytes > this.maxTotalBytes) {
      throw new CollectionAcquisitionError(
        "GITHUB_TOTAL_BYTES_EXCEEDED",
        `GitHub commit/tree evidence exceeds the ${this.maxTotalBytes}-byte Worker aggregate limit`,
        false,
      );
    }
    const authorizedKinds = new Set(context.job.planSnapshot.output.artifactKinds);
    const candidates: Candidate[] = [];

    for (const entry of tree) {
      const relative = underPrefix(entry.path, config.pathPrefix);
      if (relative === null || relative === "") continue;
      if (depthOf(relative) > context.job.planSnapshot.policy.maxDepth) continue;
      if (
        !matchesPatterns(
          relative,
          context.job.planSnapshot.policy.includePatterns,
          context.job.planSnapshot.policy.excludePatterns,
        )
      )
        continue;
      if (entry.type === "commit" || entry.mode === "160000") {
        throw new CollectionAcquisitionError(
          "GITHUB_SUBMODULE_UNSUPPORTED",
          `GitHub matched path ${relative} is a submodule; submodules are outside V1`,
          false,
        );
      }
      if (entry.type !== "blob") continue;
      if (entry.mode === "120000") {
        throw new CollectionAcquisitionError(
          "GITHUB_SYMLINK_UNSUPPORTED",
          `GitHub matched path ${relative} is a symbolic link; symlinks are outside V1`,
          false,
        );
      }
      const type = fileType(relative);
      if (!type || !authorizedKinds.has(type.artifactKind)) continue;
      if (entry.size === 0) continue;
      if (entry.size !== undefined && entry.size > this.maxFileBytes) {
        throw new CollectionAcquisitionError(
          "GITHUB_FILE_TOO_LARGE",
          `GitHub matched file ${relative} exceeds the ${this.maxFileBytes}-byte Worker limit`,
          false,
        );
      }
      candidates.push({ ...entry, relativePath: relative, ...type });
      if (candidates.length > context.job.planSnapshot.policy.maxItems) {
        throw new CollectionAcquisitionError(
          "GITHUB_ITEM_LIMIT_EXCEEDED",
          `GitHub repository contains more than the authorized ${context.job.planSnapshot.policy.maxItems} matching files`,
          false,
        );
      }
    }

    if (candidates.length === 0) {
      throw new CollectionAcquisitionError(
        "GITHUB_NO_SUPPORTED_FILES",
        "GitHub repository snapshot contains no non-empty UTF-8 files matching the authorized path, depth, patterns, and artifact kinds",
        false,
      );
    }

    const identity = repoIdentity(config);
    const snapshotUri = `github://${identity}/snapshot`;
    const treeUri = `github://${identity}/tree`;
    const artifacts: AcquiredCollectionArtifact[] = [
      {
        artifactKind: "JSON",
        mimeType: "application/vnd.github+json",
        originalName: `github-commit-${config.owner}-${config.repository}.json`,
        sourceUri: `github://${identity}/commit/${commit.sha}`,
        canonicalUri: snapshotUri,
        content: commitResponse.body,
      },
      {
        artifactKind: "JSON",
        mimeType: "application/vnd.github+json",
        originalName: `github-tree-${config.owner}-${config.repository}.json`,
        sourceUri: `github://${identity}/tree/${commit.treeSha}`,
        canonicalUri: treeUri,
        content: treeResponse.body,
      },
    ];

    let totalBytes = metadataBytes;
    for (const candidate of candidates.sort((left, right) => left.path.localeCompare(right.path))) {
      const response = await this.request(
        selected,
        `/repos/${owner}/${repository}/git/blobs/${candidate.sha}`,
        Math.min(
          MAX_BLOB_RESPONSE_BYTES,
          Math.max(256 * 1024, Math.ceil((this.maxFileBytes * 4) / 3) + 256 * 1024),
        ),
        headers,
      );
      const content = parseBlob(response, candidate, this.maxFileBytes);
      totalBytes += content.byteLength;
      if (totalBytes > this.maxTotalBytes) {
        throw new CollectionAcquisitionError(
          "GITHUB_TOTAL_BYTES_EXCEEDED",
          `GitHub snapshot exceeds the ${this.maxTotalBytes}-byte Worker aggregate limit`,
          false,
        );
      }
      const fullPath = encodedPath(candidate.path);
      const canonicalUri = `github://${identity}/file/${fullPath}`;
      const sourceUri = `github://${identity}/blob/${commit.sha}/${fullPath}`;
      artifacts.push({
        artifactKind: candidate.artifactKind,
        mimeType: candidate.mimeType,
        originalName: candidate.path.split("/").pop()!,
        sourceUri,
        canonicalUri,
        content,
      });
    }
    return artifacts;
  }
}
