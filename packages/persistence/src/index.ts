import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  AUTHORITY_LEVELS,
  SCHEMA_V1_VERSION,
  SOURCE_CATEGORIES,
  SOURCE_STATUSES,
  SOURCE_TYPES,
  isConnectorManifest,
  isSourceDefinition,
  isWorkspace,
  type AuthorityLevel,
  type ConnectorManifest,
  type Extensions,
  type JsonValue,
  type SourceCategory,
  type SourceDefinition,
  type SourceStatus,
  type SourceType,
  type Workspace,
} from "@markorbit/contracts";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const DEFAULT_CONNECTOR_REGISTERED_AT = "2026-07-15T18:30:00Z";

export const DEFAULT_WORKSPACE: Workspace = {
  schemaVersion: SCHEMA_V1_VERSION,
  objectType: "WORKSPACE",
  id: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  slug: "global-public",
  name: "Global Public Knowledge",
  dataDomain: "PUBLIC",
  status: "ACTIVE",
  defaultLocale: "zh-CN",
  timezone: "Asia/Shanghai",
  syncPolicy: {
    mode: "RAW",
    allowPublicPromotion: true,
  },
  retentionPolicy: {
    rawArtifactDays: null,
    derivedDocumentDays: 3650,
  },
  createdAt: "2026-07-15T16:00:00Z",
  updatedAt: "2026-07-15T16:00:00Z",
  extensions: {
    "x-markorbit-purpose": "public-source-registry",
  },
};

export const DEFAULT_CONNECTOR_MANIFEST: ConnectorManifest = {
  schemaVersion: SCHEMA_V1_VERSION,
  objectType: "CONNECTOR_MANIFEST",
  connectorId: "crawl4ai-web",
  displayName: "Crawl4AI Web Connector",
  version: "1.0.0",
  sourceTypes: ["WEB"],
  runtime: "PYTHON",
  capabilities: [
    "TEST_CONNECTION",
    "DISCOVER",
    "PREVIEW",
    "COLLECT",
    "CHECK_UPDATE",
    "DEEP_CRAWL",
    "RENDER_JAVASCRIPT",
    "FETCH_ATTACHMENTS",
  ],
  supportedJobTypes: ["WEB_DISCOVERY", "WEB_CRAWL", "PAGE_UPDATE_CHECK"],
  configurationSchema: {
    type: "object",
    properties: {
      renderJavascript: { type: "boolean" },
      maxDepth: { type: "integer", minimum: 0 },
    },
  },
  secretSchema: {
    type: "object",
    properties: {},
  },
  outputArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
  healthCheck: {
    mode: "WORKER_PROBE",
    timeoutSeconds: 30,
  },
  status: "ACTIVE",
  extensions: {
    "x-markorbit-default-provider": true,
  },
};

if (!isWorkspace(DEFAULT_WORKSPACE)) {
  throw new Error("Default workspace must remain valid under Schema v1");
}
if (!isConnectorManifest(DEFAULT_CONNECTOR_MANIFEST)) {
  throw new Error("Default connector manifest must remain valid under Schema v1");
}

export type CreateSourceInput = {
  workspaceId?: string;
  name: string;
  slug: string;
  sourceType: SourceType;
  category: SourceCategory;
  authorityLevel: AuthorityLevel;
  status?: SourceStatus;
  jurisdictions: string[];
  languages: string[];
  connector: {
    connectorId: string;
    version: string;
  };
  connectorConfig?: Record<string, JsonValue>;
  secretRef?: string;
  canonicalUri?: string;
  entrypoints: Array<{ uri: string; label?: string }>;
  defaultCollectionPlanId?: string;
  tags?: string[];
  extensions?: Extensions;
};

export type UpdateSourceInput = Partial<
  Pick<
    SourceDefinition,
    | "name"
    | "slug"
    | "sourceType"
    | "category"
    | "authorityLevel"
    | "status"
    | "jurisdictions"
    | "languages"
    | "connector"
    | "connectorConfig"
    | "secretRef"
    | "canonicalUri"
    | "entrypoints"
    | "defaultCollectionPlanId"
    | "tags"
    | "extensions"
  >
> & {
  secretRef?: string | null;
  canonicalUri?: string | null;
  defaultCollectionPlanId?: string | null;
  extensions?: Extensions | null;
};

export type SourceListFilters = {
  q?: string;
  workspaceId?: string;
  sourceType?: SourceType;
  category?: SourceCategory;
  authorityLevel?: AuthorityLevel;
  status?: SourceStatus;
  jurisdiction?: string;
  language?: string;
  tag?: string;
  connectorId?: string;
  limit?: number;
  offset?: number;
};

export type SourceStatusSummary = Record<SourceStatus, number> & { total: number };

export type SourceListResult = {
  items: SourceDefinition[];
  total: number;
  limit: number;
  offset: number;
  summary: SourceStatusSummary;
};

export interface SourceRepository {
  create(input: CreateSourceInput): SourceDefinition;
  getById(id: string): SourceDefinition | null;
  list(filters?: SourceListFilters): SourceListResult;
  update(id: string, input: UpdateSourceInput, expectedUpdatedAt: string): SourceDefinition;
  archive(id: string, expectedUpdatedAt: string): SourceDefinition;
}

export class RegistryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class RegistryValidationError extends RegistryError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("REGISTRY_VALIDATION_ERROR", message, details);
  }
}

export class RegistryNotFoundError extends RegistryError {
  constructor(id: string) {
    super("SOURCE_NOT_FOUND", `Source ${id} was not found`, { id });
  }
}

export class RegistryConflictError extends RegistryError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
  }
}

export const MIGRATIONS = [
  {
    id: "0001_source_registry",
    sql: `
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS source_definitions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        source_type TEXT NOT NULL,
        category TEXT NOT NULL,
        authority_level TEXT NOT NULL,
        status TEXT NOT NULL,
        connector_id TEXT NOT NULL,
        canonical_uri TEXT,
        jurisdictions_json TEXT NOT NULL,
        languages_json TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        UNIQUE (workspace_id, slug)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_sources_workspace_status
        ON source_definitions(workspace_id, status);
      CREATE INDEX IF NOT EXISTS idx_sources_type_category
        ON source_definitions(source_type, category);
      CREATE INDEX IF NOT EXISTS idx_sources_authority
        ON source_definitions(authority_level);
      CREATE INDEX IF NOT EXISTS idx_sources_connector
        ON source_definitions(connector_id);
      CREATE INDEX IF NOT EXISTS idx_sources_updated_at
        ON source_definitions(updated_at DESC);
    `,
  },
  {
    id: "0002_connector_registry",
    sql: `
      CREATE TABLE IF NOT EXISTS connector_manifests (
        connector_id TEXT NOT NULL,
        version TEXT NOT NULL,
        display_name TEXT NOT NULL,
        runtime TEXT NOT NULL,
        status TEXT NOT NULL,
        source_types_json TEXT NOT NULL,
        capabilities_json TEXT NOT NULL,
        job_types_json TEXT NOT NULL,
        artifact_kinds_json TEXT NOT NULL,
        document_json TEXT NOT NULL,
        registered_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (connector_id, version)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_connectors_status_runtime
        ON connector_manifests(status, runtime);
      CREATE INDEX IF NOT EXISTS idx_connectors_display_name
        ON connector_manifests(display_name);

      ALTER TABLE source_definitions ADD COLUMN connector_version TEXT;
      UPDATE source_definitions
        SET connector_version = json_extract(document_json, '$.connector.version')
        WHERE connector_version IS NULL;
      CREATE INDEX IF NOT EXISTS idx_sources_connector_version
        ON source_definitions(connector_id, connector_version);
    `,
  },
] as const;

function encodeBase32(value: bigint, length: number): string {
  let output = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    output = CROCKFORD[Number(remaining & 31n)] + output;
    remaining >>= 5n;
  }
  return output;
}

export function generateTypedId(prefix: "src" | "wsp", now = Date.now()): string {
  const timestamp = encodeBase32(BigInt(now), 10);
  const randomValue = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `${prefix}_${timestamp}${encodeBase32(randomValue, 16)}`;
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value <= 0) {
    throw new RegistryValidationError("limit must be a positive integer");
  }
  return Math.min(value, MAX_LIMIT);
}

function normalizeOffset(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0) {
    throw new RegistryValidationError("offset must be a non-negative integer");
  }
  return value;
}

function normalizeText(value: string): string {
  return value.trim();
}

function normalizeCreateInput(
  input: CreateSourceInput,
  id: string,
  timestamp: string,
): SourceDefinition {
  const source: SourceDefinition = {
    schemaVersion: SCHEMA_V1_VERSION,
    objectType: "SOURCE_DEFINITION",
    id,
    workspaceId: input.workspaceId ?? DEFAULT_WORKSPACE.id,
    name: normalizeText(input.name),
    slug: normalizeText(input.slug).toLowerCase(),
    sourceType: input.sourceType,
    category: input.category,
    authorityLevel: input.authorityLevel,
    status: input.status ?? "DRAFT",
    jurisdictions: input.jurisdictions.map(normalizeText).filter(Boolean),
    languages: input.languages.map(normalizeText).filter(Boolean),
    connector: {
      connectorId: normalizeText(input.connector.connectorId),
      version: normalizeText(input.connector.version),
    },
    connectorConfig: input.connectorConfig ?? {},
    entrypoints: input.entrypoints.map((entrypoint) => ({
      uri: normalizeText(entrypoint.uri),
      ...(entrypoint.label ? { label: normalizeText(entrypoint.label) } : {}),
    })),
    tags: (input.tags ?? []).map(normalizeText).filter(Boolean),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.secretRef ? { secretRef: normalizeText(input.secretRef) } : {}),
    ...(input.canonicalUri ? { canonicalUri: normalizeText(input.canonicalUri) } : {}),
    ...(input.defaultCollectionPlanId
      ? { defaultCollectionPlanId: normalizeText(input.defaultCollectionPlanId) }
      : {}),
    ...(input.extensions ? { extensions: input.extensions } : {}),
  };

  if (!isSourceDefinition(source)) {
    throw new RegistryValidationError("Source input does not satisfy Schema v1");
  }
  return source;
}

function applyUpdate(
  source: SourceDefinition,
  input: UpdateSourceInput,
  timestamp: string,
): SourceDefinition {
  const next = { ...source, ...input, updatedAt: timestamp } as SourceDefinition;

  next.name = normalizeText(next.name);
  next.slug = normalizeText(next.slug).toLowerCase();
  next.jurisdictions = next.jurisdictions.map(normalizeText).filter(Boolean);
  next.languages = next.languages.map(normalizeText).filter(Boolean);
  next.tags = next.tags.map(normalizeText).filter(Boolean);
  next.connector = {
    connectorId: normalizeText(next.connector.connectorId),
    version: normalizeText(next.connector.version),
  };
  next.entrypoints = next.entrypoints.map((entrypoint) => ({
    uri: normalizeText(entrypoint.uri),
    ...(entrypoint.label ? { label: normalizeText(entrypoint.label) } : {}),
  }));

  if (input.secretRef === null) delete next.secretRef;
  if (input.canonicalUri === null) delete next.canonicalUri;
  if (input.defaultCollectionPlanId === null) delete next.defaultCollectionPlanId;
  if (input.extensions === null) delete next.extensions;

  if (!isSourceDefinition(next)) {
    throw new RegistryValidationError("Source update does not satisfy Schema v1");
  }
  return next;
}

function parseSourceDocument(value: unknown): SourceDefinition {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isSourceDefinition(parsed)) {
    throw new RegistryValidationError("Persisted source no longer satisfies Schema v1");
  }
  return parsed;
}

function parseConnectorDocument(value: unknown): ConnectorManifest {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isConnectorManifest(parsed)) {
    throw new RegistryValidationError("Persisted connector no longer satisfies Schema v1");
  }
  return parsed;
}

function sourceRow(source: SourceDefinition) {
  return {
    id: source.id,
    workspaceId: source.workspaceId,
    slug: source.slug,
    name: source.name,
    sourceType: source.sourceType,
    category: source.category,
    authorityLevel: source.authorityLevel,
    status: source.status,
    connectorId: source.connector.connectorId,
    connectorVersion: source.connector.version,
    canonicalUri: source.canonicalUri ?? null,
    jurisdictionsJson: JSON.stringify(source.jurisdictions),
    languagesJson: JSON.stringify(source.languages),
    tagsJson: JSON.stringify(source.tags),
    documentJson: JSON.stringify(source),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

function buildWhere(filters: SourceListFilters, includeStatus = true) {
  const clauses: string[] = [];
  const values: SQLInputValue[] = [];

  if (filters.q?.trim()) {
    const query = `%${filters.q.trim().toLowerCase()}%`;
    clauses.push(
      "(lower(s.name) LIKE ? OR lower(s.slug) LIKE ? OR lower(COALESCE(s.canonical_uri, '')) LIKE ?)",
    );
    values.push(query, query, query);
  }
  if (filters.workspaceId) {
    clauses.push("s.workspace_id = ?");
    values.push(filters.workspaceId);
  }
  if (filters.sourceType) {
    clauses.push("s.source_type = ?");
    values.push(filters.sourceType);
  }
  if (filters.category) {
    clauses.push("s.category = ?");
    values.push(filters.category);
  }
  if (filters.authorityLevel) {
    clauses.push("s.authority_level = ?");
    values.push(filters.authorityLevel);
  }
  if (includeStatus && filters.status) {
    clauses.push("s.status = ?");
    values.push(filters.status);
  }
  if (filters.connectorId) {
    clauses.push("s.connector_id = ?");
    values.push(filters.connectorId);
  }
  if (filters.jurisdiction) {
    clauses.push("EXISTS (SELECT 1 FROM json_each(s.jurisdictions_json) WHERE value = ?)");
    values.push(filters.jurisdiction);
  }
  if (filters.language) {
    clauses.push("EXISTS (SELECT 1 FROM json_each(s.languages_json) WHERE value = ?)");
    values.push(filters.language);
  }
  if (filters.tag) {
    clauses.push("EXISTS (SELECT 1 FROM json_each(s.tags_json) WHERE value = ?)");
    values.push(filters.tag);
  }

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function isUniqueSlugError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

function connectorManifest(
  database: DatabaseSync,
  connectorId: string,
  version: string,
): ConnectorManifest | null {
  const row = database
    .prepare("SELECT document_json FROM connector_manifests WHERE connector_id = ? AND version = ?")
    .get(connectorId, version) as { document_json: string } | undefined;
  return row ? parseConnectorDocument(row.document_json) : null;
}

function validateConnectorBinding(
  database: DatabaseSync,
  source: SourceDefinition,
  requireActive: boolean,
): ConnectorManifest {
  const manifest = connectorManifest(
    database,
    source.connector.connectorId,
    source.connector.version,
  );
  if (!manifest) {
    throw new RegistryConflictError(
      "CONNECTOR_NOT_REGISTERED",
      `Connector ${source.connector.connectorId}@${source.connector.version} is not registered`,
      { connector: source.connector },
    );
  }
  if (!manifest.sourceTypes.includes(source.sourceType)) {
    throw new RegistryConflictError(
      "CONNECTOR_SOURCE_TYPE_INCOMPATIBLE",
      `Connector ${manifest.connectorId}@${manifest.version} does not support ${source.sourceType}`,
      { connector: source.connector, sourceType: source.sourceType },
    );
  }
  if (requireActive && manifest.status !== "ACTIVE") {
    throw new RegistryConflictError(
      "CONNECTOR_NOT_ACTIVE",
      `Connector ${manifest.connectorId}@${manifest.version} is ${manifest.status}`,
      { connector: source.connector, status: manifest.status },
    );
  }
  return manifest;
}

export function openRegistryDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path, { timeout: 5000 });
  database.exec("PRAGMA foreign_keys = ON;");
  if (path !== ":memory:") database.exec("PRAGMA journal_mode = WAL;");
  initializeRegistry(database);
  return database;
}

export function initializeRegistry(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  for (const migration of MIGRATIONS) {
    const applied = database
      .prepare("SELECT id FROM schema_migrations WHERE id = ?")
      .get(migration.id);
    if (applied) continue;

    database.exec("BEGIN IMMEDIATE;");
    try {
      database.exec(migration.sql);
      database
        .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
        .run(migration.id, new Date().toISOString());
      database.exec("COMMIT;");
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    }
  }

  database
    .prepare(
      `INSERT OR IGNORE INTO workspaces (id, document_json, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      DEFAULT_WORKSPACE.id,
      JSON.stringify(DEFAULT_WORKSPACE),
      DEFAULT_WORKSPACE.createdAt,
      DEFAULT_WORKSPACE.updatedAt,
    );

  database
    .prepare(
      `INSERT OR IGNORE INTO connector_manifests (
         connector_id, version, display_name, runtime, status, source_types_json,
         capabilities_json, job_types_json, artifact_kinds_json, document_json,
         registered_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      DEFAULT_CONNECTOR_MANIFEST.connectorId,
      DEFAULT_CONNECTOR_MANIFEST.version,
      DEFAULT_CONNECTOR_MANIFEST.displayName,
      DEFAULT_CONNECTOR_MANIFEST.runtime,
      DEFAULT_CONNECTOR_MANIFEST.status,
      JSON.stringify(DEFAULT_CONNECTOR_MANIFEST.sourceTypes),
      JSON.stringify(DEFAULT_CONNECTOR_MANIFEST.capabilities),
      JSON.stringify(DEFAULT_CONNECTOR_MANIFEST.supportedJobTypes),
      JSON.stringify(DEFAULT_CONNECTOR_MANIFEST.outputArtifactKinds),
      JSON.stringify(DEFAULT_CONNECTOR_MANIFEST),
      DEFAULT_CONNECTOR_REGISTERED_AT,
      DEFAULT_CONNECTOR_REGISTERED_AT,
    );
}

export function listAppliedMigrations(database: DatabaseSync): string[] {
  return database
    .prepare("SELECT id FROM schema_migrations ORDER BY id")
    .all()
    .map((row) => String((row as { id: unknown }).id));
}

export class SqliteSourceRepository implements SourceRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = () => generateTypedId("src"),
  ) {
    initializeRegistry(database);
  }

  create(input: CreateSourceInput): SourceDefinition {
    const source = normalizeCreateInput(input, this.idFactory(), this.clock().toISOString());
    validateConnectorBinding(this.database, source, true);
    const row = sourceRow(source);

    try {
      this.database
        .prepare(
          `INSERT INTO source_definitions (
             id, workspace_id, slug, name, source_type, category, authority_level,
             status, connector_id, connector_version, canonical_uri, jurisdictions_json,
             languages_json, tags_json, document_json, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.id,
          row.workspaceId,
          row.slug,
          row.name,
          row.sourceType,
          row.category,
          row.authorityLevel,
          row.status,
          row.connectorId,
          row.connectorVersion,
          row.canonicalUri,
          row.jurisdictionsJson,
          row.languagesJson,
          row.tagsJson,
          row.documentJson,
          row.createdAt,
          row.updatedAt,
        );
    } catch (error) {
      if (isUniqueSlugError(error)) {
        throw new RegistryConflictError(
          "SOURCE_SLUG_CONFLICT",
          `Slug ${source.slug} already exists in workspace ${source.workspaceId}`,
        );
      }
      throw error;
    }

    return source;
  }

  getById(id: string): SourceDefinition | null {
    const row = this.database
      .prepare("SELECT document_json FROM source_definitions WHERE id = ?")
      .get(id) as { document_json: string } | undefined;
    return row ? parseSourceDocument(row.document_json) : null;
  }

  list(filters: SourceListFilters = {}): SourceListResult {
    const limit = normalizeLimit(filters.limit);
    const offset = normalizeOffset(filters.offset);
    const where = buildWhere(filters);

    const items = this.database
      .prepare(
        `SELECT document_json FROM source_definitions s
         ${where.sql}
         ORDER BY s.updated_at DESC, s.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...where.values, limit, offset)
      .map((row) => parseSourceDocument((row as { document_json: string }).document_json));

    const totalRow = this.database
      .prepare(`SELECT COUNT(*) AS count FROM source_definitions s ${where.sql}`)
      .get(...where.values) as { count: number };

    const summaryWhere = buildWhere(filters, false);
    const summaryRows = this.database
      .prepare(
        `SELECT status, COUNT(*) AS count FROM source_definitions s
         ${summaryWhere.sql}
         GROUP BY status`,
      )
      .all(...summaryWhere.values) as Array<{ status: SourceStatus; count: number }>;

    const summary = Object.fromEntries(SOURCE_STATUSES.map((status) => [status, 0])) as Record<
      SourceStatus,
      number
    >;
    for (const row of summaryRows) {
      if (SOURCE_STATUSES.includes(row.status)) summary[row.status] = Number(row.count);
    }

    return {
      items,
      total: Number(totalRow.count),
      limit,
      offset,
      summary: {
        ...summary,
        total: Object.values(summary).reduce((sum, count) => sum + count, 0),
      },
    };
  }

  update(id: string, input: UpdateSourceInput, expectedUpdatedAt: string): SourceDefinition {
    const current = this.getById(id);
    if (!current) throw new RegistryNotFoundError(id);
    if (current.updatedAt !== expectedUpdatedAt) {
      throw new RegistryConflictError(
        "SOURCE_VERSION_CONFLICT",
        "The source changed after it was loaded. Refresh before saving.",
      );
    }

    const next = applyUpdate(current, input, this.clock().toISOString());
    const bindingChanged =
      current.sourceType !== next.sourceType ||
      current.connector.connectorId !== next.connector.connectorId ||
      current.connector.version !== next.connector.version;
    const activating = current.status !== "ACTIVE" && next.status === "ACTIVE";
    validateConnectorBinding(this.database, next, bindingChanged || activating);
    const row = sourceRow(next);

    try {
      const result = this.database
        .prepare(
          `UPDATE source_definitions SET
             slug = ?, name = ?, source_type = ?, category = ?, authority_level = ?,
             status = ?, connector_id = ?, connector_version = ?, canonical_uri = ?,
             jurisdictions_json = ?, languages_json = ?, tags_json = ?, document_json = ?,
             updated_at = ?
           WHERE id = ? AND updated_at = ?`,
        )
        .run(
          row.slug,
          row.name,
          row.sourceType,
          row.category,
          row.authorityLevel,
          row.status,
          row.connectorId,
          row.connectorVersion,
          row.canonicalUri,
          row.jurisdictionsJson,
          row.languagesJson,
          row.tagsJson,
          row.documentJson,
          row.updatedAt,
          id,
          expectedUpdatedAt,
        );

      if (Number(result.changes) !== 1) {
        throw new RegistryConflictError(
          "SOURCE_VERSION_CONFLICT",
          "The source changed after it was loaded. Refresh before saving.",
        );
      }
    } catch (error) {
      if (isUniqueSlugError(error)) {
        throw new RegistryConflictError(
          "SOURCE_SLUG_CONFLICT",
          `Slug ${next.slug} already exists in workspace ${next.workspaceId}`,
        );
      }
      throw error;
    }

    return next;
  }

  archive(id: string, expectedUpdatedAt: string): SourceDefinition {
    return this.update(id, { status: "ARCHIVED" }, expectedUpdatedAt);
  }
}

export function assertSourceFilterValue(filters: SourceListFilters): void {
  if (filters.sourceType && !SOURCE_TYPES.includes(filters.sourceType)) {
    throw new RegistryValidationError("Unknown sourceType filter");
  }
  if (filters.category && !SOURCE_CATEGORIES.includes(filters.category)) {
    throw new RegistryValidationError("Unknown category filter");
  }
  if (filters.authorityLevel && !AUTHORITY_LEVELS.includes(filters.authorityLevel)) {
    throw new RegistryValidationError("Unknown authorityLevel filter");
  }
  if (filters.status && !SOURCE_STATUSES.includes(filters.status)) {
    throw new RegistryValidationError("Unknown status filter");
  }
}
