import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  ARTIFACT_KINDS,
  CONNECTOR_CAPABILITIES,
  CONNECTOR_RUNTIMES,
  CONNECTOR_STATUSES,
  JOB_TYPES,
  SCHEMA_V1_VERSION,
  SOURCE_TYPES,
  isConnectorManifest,
  type ArtifactKind,
  type ConnectorCapability,
  type ConnectorManifest,
  type ConnectorRuntime,
  type ConnectorStatus,
  type Extensions,
  type HealthCheckMode,
  type JobType,
  type JsonValue,
  type SourceType,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export type CreateConnectorManifestInput = {
  connectorId: string;
  displayName: string;
  version: string;
  sourceTypes: SourceType[];
  runtime: ConnectorRuntime;
  capabilities: ConnectorCapability[];
  supportedJobTypes: JobType[];
  configurationSchema: Record<string, JsonValue>;
  secretSchema: Record<string, JsonValue>;
  outputArtifactKinds: ArtifactKind[];
  healthCheck: {
    mode: HealthCheckMode;
    timeoutSeconds: number;
  };
  status?: ConnectorStatus;
  extensions?: Extensions;
};

export type ConnectorListFilters = {
  q?: string;
  runtime?: ConnectorRuntime;
  status?: ConnectorStatus;
  sourceType?: SourceType;
  capability?: ConnectorCapability;
  jobType?: JobType;
  artifactKind?: ArtifactKind;
  limit?: number;
  offset?: number;
};

export type ConnectorRuntimeHealth = "NOT_EVALUATED";

export type ConnectorRegistryRecord = {
  manifest: ConnectorManifest;
  registeredAt: string;
  updatedAt: string;
  boundSourceCount: number;
  runtimeHealth: ConnectorRuntimeHealth;
};

export type ConnectorStatusSummary = Record<ConnectorStatus, number> & {
  totalVersions: number;
  connectorIds: number;
};

export type ConnectorListResult = {
  items: ConnectorRegistryRecord[];
  total: number;
  limit: number;
  offset: number;
  summary: ConnectorStatusSummary;
};

export interface ConnectorRepository {
  create(input: CreateConnectorManifestInput): ConnectorRegistryRecord;
  get(connectorId: string, version: string): ConnectorRegistryRecord | null;
  list(filters?: ConnectorListFilters): ConnectorListResult;
  listVersions(connectorId: string): ConnectorRegistryRecord[];
  updateStatus(
    connectorId: string,
    version: string,
    status: ConnectorStatus,
  ): ConnectorRegistryRecord;
  compatible(sourceType: SourceType): ConnectorRegistryRecord[];
}

export class ConnectorNotFoundError extends RegistryError {
  constructor(connectorId: string, version: string) {
    super("CONNECTOR_NOT_FOUND", `Connector ${connectorId}@${version} was not found`, {
      connectorId,
      version,
    });
  }
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

function uniqueValues<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

function normalizeManifest(input: CreateConnectorManifestInput): ConnectorManifest {
  const allowedKeys = new Set([
    "connectorId",
    "displayName",
    "version",
    "sourceTypes",
    "runtime",
    "capabilities",
    "supportedJobTypes",
    "configurationSchema",
    "secretSchema",
    "outputArtifactKinds",
    "healthCheck",
    "status",
    "extensions",
  ]);
  const unknownKeys = Object.keys(input).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new RegistryValidationError("Connector manifest contains unsupported fields", {
      fields: unknownKeys,
    });
  }

  const manifest: ConnectorManifest = {
    schemaVersion: SCHEMA_V1_VERSION,
    objectType: "CONNECTOR_MANIFEST",
    connectorId: input.connectorId.trim().toLowerCase(),
    displayName: input.displayName.trim(),
    version: input.version.trim(),
    sourceTypes: uniqueValues(input.sourceTypes),
    runtime: input.runtime,
    capabilities: uniqueValues(input.capabilities),
    supportedJobTypes: uniqueValues(input.supportedJobTypes),
    configurationSchema: input.configurationSchema,
    secretSchema: input.secretSchema,
    outputArtifactKinds: uniqueValues(input.outputArtifactKinds),
    healthCheck: {
      mode: input.healthCheck.mode,
      timeoutSeconds: input.healthCheck.timeoutSeconds,
    },
    status: input.status ?? "ACTIVE",
    ...(input.extensions ? { extensions: input.extensions } : {}),
  };

  if (!isConnectorManifest(manifest)) {
    throw new RegistryValidationError("Connector manifest does not satisfy Schema v1");
  }
  return manifest;
}

function parseManifest(value: unknown): ConnectorManifest {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isConnectorManifest(parsed)) {
    throw new RegistryValidationError("Persisted connector no longer satisfies Schema v1");
  }
  return parsed;
}

function manifestRow(manifest: ConnectorManifest) {
  return {
    connectorId: manifest.connectorId,
    version: manifest.version,
    displayName: manifest.displayName,
    runtime: manifest.runtime,
    status: manifest.status,
    sourceTypesJson: JSON.stringify(manifest.sourceTypes),
    capabilitiesJson: JSON.stringify(manifest.capabilities),
    jobTypesJson: JSON.stringify(manifest.supportedJobTypes),
    artifactKindsJson: JSON.stringify(manifest.outputArtifactKinds),
    documentJson: JSON.stringify(manifest),
  };
}

function recordFromRow(row: Record<string, unknown>): ConnectorRegistryRecord {
  return {
    manifest: parseManifest(row.document_json),
    registeredAt: String(row.registered_at),
    updatedAt: String(row.updated_at),
    boundSourceCount: Number(row.bound_source_count ?? 0),
    runtimeHealth: "NOT_EVALUATED",
  };
}

function selectColumns(): string {
  return `
    c.document_json,
    c.registered_at,
    c.updated_at,
    (
      SELECT COUNT(*) FROM source_definitions s
      WHERE s.connector_id = c.connector_id
        AND s.connector_version = c.version
    ) AS bound_source_count
  `;
}

function buildWhere(filters: ConnectorListFilters, includeStatus = true) {
  const clauses: string[] = [];
  const values: SQLInputValue[] = [];

  if (filters.q?.trim()) {
    const query = `%${filters.q.trim().toLowerCase()}%`;
    clauses.push("(lower(c.connector_id) LIKE ? OR lower(c.display_name) LIKE ?)");
    values.push(query, query);
  }
  if (filters.runtime) {
    clauses.push("c.runtime = ?");
    values.push(filters.runtime);
  }
  if (includeStatus && filters.status) {
    clauses.push("c.status = ?");
    values.push(filters.status);
  }
  if (filters.sourceType) {
    clauses.push("EXISTS (SELECT 1 FROM json_each(c.source_types_json) WHERE value = ?)");
    values.push(filters.sourceType);
  }
  if (filters.capability) {
    clauses.push("EXISTS (SELECT 1 FROM json_each(c.capabilities_json) WHERE value = ?)");
    values.push(filters.capability);
  }
  if (filters.jobType) {
    clauses.push("EXISTS (SELECT 1 FROM json_each(c.job_types_json) WHERE value = ?)");
    values.push(filters.jobType);
  }
  if (filters.artifactKind) {
    clauses.push("EXISTS (SELECT 1 FROM json_each(c.artifact_kinds_json) WHERE value = ?)");
    values.push(filters.artifactKind);
  }

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function isDuplicateVersionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("UNIQUE constraint failed: connector_manifests.connector_id")
  );
}

export class SqliteConnectorRepository implements ConnectorRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    initializeRegistry(database);
  }

  create(input: CreateConnectorManifestInput): ConnectorRegistryRecord {
    const manifest = normalizeManifest(input);
    const row = manifestRow(manifest);
    const timestamp = this.clock().toISOString();

    try {
      this.database
        .prepare(
          `INSERT INTO connector_manifests (
             connector_id, version, display_name, runtime, status, source_types_json,
             capabilities_json, job_types_json, artifact_kinds_json, document_json,
             registered_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.connectorId,
          row.version,
          row.displayName,
          row.runtime,
          row.status,
          row.sourceTypesJson,
          row.capabilitiesJson,
          row.jobTypesJson,
          row.artifactKindsJson,
          row.documentJson,
          timestamp,
          timestamp,
        );
    } catch (error) {
      if (isDuplicateVersionError(error)) {
        throw new RegistryConflictError(
          "CONNECTOR_VERSION_CONFLICT",
          `Connector ${manifest.connectorId}@${manifest.version} already exists and is immutable`,
          { connectorId: manifest.connectorId, version: manifest.version },
        );
      }
      throw error;
    }

    const created = this.get(manifest.connectorId, manifest.version);
    if (!created) throw new ConnectorNotFoundError(manifest.connectorId, manifest.version);
    return created;
  }

  get(connectorId: string, version: string): ConnectorRegistryRecord | null {
    const row = this.database
      .prepare(
        `SELECT ${selectColumns()}
         FROM connector_manifests c
         WHERE c.connector_id = ? AND c.version = ?`,
      )
      .get(connectorId, version) as Record<string, unknown> | undefined;
    return row ? recordFromRow(row) : null;
  }

  list(filters: ConnectorListFilters = {}): ConnectorListResult {
    assertConnectorFilterValue(filters);
    const limit = normalizeLimit(filters.limit);
    const offset = normalizeOffset(filters.offset);
    const where = buildWhere(filters);

    const items = this.database
      .prepare(
        `SELECT ${selectColumns()}
         FROM connector_manifests c
         ${where.sql}
         ORDER BY c.connector_id ASC, c.registered_at DESC, c.version DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...where.values, limit, offset)
      .map((row) => recordFromRow(row as Record<string, unknown>));

    const totalRow = this.database
      .prepare(`SELECT COUNT(*) AS count FROM connector_manifests c ${where.sql}`)
      .get(...where.values) as { count: number };

    const summaryWhere = buildWhere(filters, false);
    const summaryRows = this.database
      .prepare(
        `SELECT status, COUNT(*) AS count
         FROM connector_manifests c
         ${summaryWhere.sql}
         GROUP BY status`,
      )
      .all(...summaryWhere.values) as Array<{ status: ConnectorStatus; count: number }>;
    const connectorIdsRow = this.database
      .prepare(
        `SELECT COUNT(DISTINCT connector_id) AS count
         FROM connector_manifests c
         ${summaryWhere.sql}`,
      )
      .get(...summaryWhere.values) as { count: number };

    const summary = Object.fromEntries(CONNECTOR_STATUSES.map((status) => [status, 0])) as Record<
      ConnectorStatus,
      number
    >;
    for (const row of summaryRows) {
      if (CONNECTOR_STATUSES.includes(row.status)) summary[row.status] = Number(row.count);
    }

    return {
      items,
      total: Number(totalRow.count),
      limit,
      offset,
      summary: {
        ...summary,
        totalVersions: Object.values(summary).reduce((sum, count) => sum + count, 0),
        connectorIds: Number(connectorIdsRow.count),
      },
    };
  }

  listVersions(connectorId: string): ConnectorRegistryRecord[] {
    return this.database
      .prepare(
        `SELECT ${selectColumns()}
         FROM connector_manifests c
         WHERE c.connector_id = ?
         ORDER BY c.registered_at DESC, c.version DESC`,
      )
      .all(connectorId)
      .map((row) => recordFromRow(row as Record<string, unknown>));
  }

  updateStatus(
    connectorId: string,
    version: string,
    status: ConnectorStatus,
  ): ConnectorRegistryRecord {
    if (!CONNECTOR_STATUSES.includes(status)) {
      throw new RegistryValidationError("Unknown connector status");
    }
    const current = this.get(connectorId, version);
    if (!current) throw new ConnectorNotFoundError(connectorId, version);
    if (current.manifest.status === status) return current;

    const next: ConnectorManifest = { ...current.manifest, status };
    if (!isConnectorManifest(next)) {
      throw new RegistryValidationError("Connector status update does not satisfy Schema v1");
    }
    const timestamp = this.clock().toISOString();
    const result = this.database
      .prepare(
        `UPDATE connector_manifests
         SET status = ?, document_json = ?, updated_at = ?
         WHERE connector_id = ? AND version = ?`,
      )
      .run(status, JSON.stringify(next), timestamp, connectorId, version);
    if (Number(result.changes) !== 1) throw new ConnectorNotFoundError(connectorId, version);

    const updated = this.get(connectorId, version);
    if (!updated) throw new ConnectorNotFoundError(connectorId, version);
    return updated;
  }

  compatible(sourceType: SourceType): ConnectorRegistryRecord[] {
    if (!SOURCE_TYPES.includes(sourceType)) {
      throw new RegistryValidationError("Unknown sourceType");
    }
    return this.list({ sourceType, status: "ACTIVE", limit: MAX_LIMIT }).items;
  }
}

export function assertConnectorFilterValue(filters: ConnectorListFilters): void {
  if (filters.runtime && !CONNECTOR_RUNTIMES.includes(filters.runtime)) {
    throw new RegistryValidationError("Unknown runtime filter");
  }
  if (filters.status && !CONNECTOR_STATUSES.includes(filters.status)) {
    throw new RegistryValidationError("Unknown status filter");
  }
  if (filters.sourceType && !SOURCE_TYPES.includes(filters.sourceType)) {
    throw new RegistryValidationError("Unknown sourceType filter");
  }
  if (filters.capability && !CONNECTOR_CAPABILITIES.includes(filters.capability)) {
    throw new RegistryValidationError("Unknown capability filter");
  }
  if (filters.jobType && !JOB_TYPES.includes(filters.jobType)) {
    throw new RegistryValidationError("Unknown jobType filter");
  }
  if (filters.artifactKind && !ARTIFACT_KINDS.includes(filters.artifactKind)) {
    throw new RegistryValidationError("Unknown artifactKind filter");
  }
}
