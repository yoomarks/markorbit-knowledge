import { randomBytes } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  CONVERSION_CONTROL_VERSION,
  CONVERSION_PROFILE_STATUSES,
  CONVERTER_STATUSES,
  converterAccepts,
  hasForbiddenConversionConfiguration,
  isConversionProfile,
  isConverterManifest,
  type ArtifactKind,
  type ConversionOutputFormat,
  type ConversionProfile,
  type ConversionProfileStatus,
  type ConverterCapability,
  type ConverterManifest,
  type ConverterRuntime,
  type ConverterStatus,
  type JsonValue,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";

const MIGRATION_ID = "0008_converter_registry";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type CreateConverterManifestInput = Omit<
  ConverterManifest,
  "protocolVersion" | "objectType"
>;
export type ConverterListFilters = {
  q?: string;
  runtime?: ConverterRuntime;
  status?: ConverterStatus;
  capability?: ConverterCapability;
  artifactKind?: ArtifactKind;
  mimeType?: string;
  limit?: number;
  offset?: number;
};
export type ConverterRegistryRecord = {
  manifest: ConverterManifest;
  registeredAt: string;
  updatedAt: string;
  boundProfileCount: number;
  runtimeHealth: "NOT_EVALUATED";
};
export type ConverterListResult = {
  items: ConverterRegistryRecord[];
  total: number;
  limit: number;
  offset: number;
  summary: Record<ConverterStatus, number> & { converterIds: number; totalVersions: number };
};

export type CreateConversionProfileInput = {
  workspaceId: string;
  sourceId?: string;
  name: string;
  status?: ConversionProfileStatus;
  converter: { converterId: string; version: string };
  input: ConversionProfile["input"];
  outputFormat: ConversionOutputFormat;
  targetPathTemplate: string;
  configuration: Record<string, JsonValue>;
  precedence: number;
  autoConvert: boolean;
};
export type UpdateConversionProfileInput = Partial<
  Omit<CreateConversionProfileInput, "workspaceId">
> & { expectedUpdatedAt: string };
export type ConversionProfileFilters = {
  workspaceId?: string;
  sourceId?: string;
  status?: ConversionProfileStatus;
  converterId?: string;
  q?: string;
  limit?: number;
  offset?: number;
};
export type ConversionProfileListResult = {
  items: ConversionProfile[];
  total: number;
  limit: number;
  offset: number;
  summary: Record<ConversionProfileStatus, number> & { total: number };
};

export interface ConverterRegistryRepository {
  createManifest(input: CreateConverterManifestInput): ConverterRegistryRecord;
  getManifest(converterId: string, version: string): ConverterRegistryRecord | null;
  listManifests(filters?: ConverterListFilters): ConverterListResult;
  listVersions(converterId: string): ConverterRegistryRecord[];
  updateManifestStatus(
    converterId: string,
    version: string,
    status: ConverterStatus,
  ): ConverterRegistryRecord;
  compatible(artifactKind: ArtifactKind, mimeType: string): ConverterRegistryRecord[];
  createProfile(input: CreateConversionProfileInput): ConversionProfile;
  getProfile(id: string): ConversionProfile | null;
  listProfiles(filters?: ConversionProfileFilters): ConversionProfileListResult;
  updateProfile(id: string, input: UpdateConversionProfileInput): ConversionProfile;
  updateProfileStatus(
    id: string,
    status: ConversionProfileStatus,
    expectedUpdatedAt: string,
  ): ConversionProfile;
}

export class ConverterNotFoundError extends RegistryError {
  constructor(converterId: string, version: string) {
    super("CONVERTER_NOT_FOUND", `Converter ${converterId}@${version} was not found`, {
      converterId,
      version,
    });
  }
}
export class ConversionProfileNotFoundError extends RegistryError {
  constructor(id: string) {
    super("CONVERSION_PROFILE_NOT_FOUND", `Conversion Profile ${id} was not found`, { id });
  }
}

function encodeBase32(value: bigint, length: number): string {
  let output = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    output = CROCKFORD[Number(remaining & 31n)] + output;
    remaining >>= 5n;
  }
  return output;
}
function profileId(now = Date.now()): string {
  const timestamp = encodeBase32(BigInt(now), 10);
  const random = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `cvp_${timestamp}${encodeBase32(random, 16)}`;
}
function limit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value <= 0)
    throw new RegistryValidationError("limit must be positive");
  return Math.min(value, MAX_LIMIT);
}
function offset(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0)
    throw new RegistryValidationError("offset must be non-negative");
  return value;
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function parseManifest(value: string): ConverterManifest {
  const parsed = JSON.parse(value) as unknown;
  if (!isConverterManifest(parsed))
    throw new RegistryValidationError("Persisted ConverterManifest is invalid");
  return parsed;
}
function parseProfile(value: string): ConversionProfile {
  const parsed = JSON.parse(value) as unknown;
  if (!isConversionProfile(parsed))
    throw new RegistryValidationError("Persisted ConversionProfile is invalid");
  return parsed;
}
function recordFromRow(row: Record<string, unknown>): ConverterRegistryRecord {
  return {
    manifest: parseManifest(String(row.document_json)),
    registeredAt: String(row.registered_at),
    updatedAt: String(row.updated_at),
    boundProfileCount: Number(row.bound_profile_count ?? 0),
    runtimeHealth: "NOT_EVALUATED",
  };
}
function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

function assertAllowedKeys(value: object, allowed: readonly string[], label: string): void {
  const allowlist = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowlist.has(key));
  if (unknown.length > 0) {
    throw new RegistryValidationError(`Unknown ${label} fields: ${unknown.join(", ")}`);
  }
}

function normalizeManifest(input: CreateConverterManifestInput): ConverterManifest {
  assertAllowedKeys(
    input,
    [
      "converterId",
      "displayName",
      "version",
      "runtime",
      "capabilities",
      "inputs",
      "outputFormat",
      "deterministic",
      "configurationSchema",
      "resourceHints",
      "status",
    ],
    "Converter Manifest",
  );
  assertAllowedKeys(input.inputs, ["artifactKinds", "mimePatterns"], "Converter input rule");
  assertAllowedKeys(
    input.resourceHints,
    ["maxInputBytes", "timeoutSeconds"],
    "Converter resource hints",
  );
  const manifest: ConverterManifest = {
    protocolVersion: CONVERSION_CONTROL_VERSION,
    objectType: "CONVERTER_MANIFEST",
    converterId: input.converterId.trim().toLowerCase(),
    displayName: input.displayName.trim(),
    version: input.version.trim(),
    runtime: input.runtime,
    capabilities: unique(input.capabilities),
    inputs: {
      artifactKinds: unique(input.inputs.artifactKinds),
      mimePatterns: unique(input.inputs.mimePatterns.map((value) => value.toLowerCase())),
    },
    outputFormat: input.outputFormat,
    deterministic: input.deterministic,
    configurationSchema: clone(input.configurationSchema),
    resourceHints: clone(input.resourceHints),
    status: input.status,
  };
  if (!isConverterManifest(manifest))
    throw new RegistryValidationError("Converter manifest does not satisfy Conversion Control v1");
  return manifest;
}

function schemaProperties(schema: Record<string, JsonValue>): Record<string, unknown> {
  const properties = schema.properties;
  return properties && typeof properties === "object" && !Array.isArray(properties)
    ? (properties as Record<string, unknown>)
    : {};
}
function validateConfiguration(
  configuration: Record<string, JsonValue>,
  schema: Record<string, JsonValue>,
): void {
  const forbidden = hasForbiddenConversionConfiguration(configuration);
  if (forbidden)
    throw new RegistryValidationError("Conversion configuration contains a forbidden field", {
      path: forbidden,
    });
  const properties = schemaProperties(schema);
  const additional = schema.additionalProperties !== false;
  if (!additional) {
    const unknown = Object.keys(configuration).filter((key) => !(key in properties));
    if (unknown.length)
      throw new RegistryValidationError("Conversion configuration contains unsupported fields", {
        fields: unknown,
      });
  }
  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const key of required) {
    if (typeof key === "string" && !(key in configuration)) {
      throw new RegistryValidationError(`Conversion configuration requires ${key}`);
    }
  }
  for (const [key, value] of Object.entries(configuration)) {
    const rule = properties[key];
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) continue;
    const type = (rule as Record<string, unknown>).type;
    const valid =
      type === undefined ||
      (type === "string" && typeof value === "string") ||
      (type === "boolean" && typeof value === "boolean") ||
      (type === "number" && typeof value === "number") ||
      (type === "integer" && Number.isInteger(value)) ||
      (type === "object" && typeof value === "object" && value !== null && !Array.isArray(value)) ||
      (type === "array" && Array.isArray(value));
    if (!valid)
      throw new RegistryValidationError(`Conversion configuration field ${key} has the wrong type`);
  }
}

function manifestSelect(): string {
  return `c.document_json, c.registered_at, c.updated_at,
    (SELECT COUNT(*) FROM conversion_profiles p
      WHERE p.converter_id = c.converter_id AND p.converter_version = c.version
    ) AS bound_profile_count`;
}

export function ensureConverterRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  const applied = database
    .prepare("SELECT id FROM schema_migrations WHERE id = ?")
    .get(MIGRATION_ID);
  if (applied) return;
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS converter_manifests (
        converter_id TEXT NOT NULL,
        version TEXT NOT NULL,
        display_name TEXT NOT NULL,
        runtime TEXT NOT NULL,
        status TEXT NOT NULL,
        artifact_kinds_json TEXT NOT NULL,
        mime_patterns_json TEXT NOT NULL,
        capabilities_json TEXT NOT NULL,
        output_format TEXT NOT NULL,
        deterministic INTEGER NOT NULL,
        document_json TEXT NOT NULL,
        registered_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (converter_id, version)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS conversion_profiles (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_id TEXT,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        converter_id TEXT NOT NULL,
        converter_version TEXT NOT NULL,
        precedence INTEGER NOT NULL,
        auto_convert INTEGER NOT NULL,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY (source_id) REFERENCES source_definitions(id),
        FOREIGN KEY (converter_id, converter_version) REFERENCES converter_manifests(converter_id, version),
        UNIQUE (workspace_id, name)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_converter_manifest_status
        ON converter_manifests(status, converter_id, version);
      CREATE INDEX IF NOT EXISTS idx_conversion_profile_scope
        ON conversion_profiles(workspace_id, source_id, status, precedence DESC);
    `);
    const now = new Date().toISOString();
    const seeds: CreateConverterManifestInput[] = [
      {
        converterId: "builtin-text-markdown",
        displayName: "Built-in plain text to Markdown",
        version: "1.0.0",
        runtime: "BUILT_IN",
        capabilities: ["CONVERT", "EXTRACT_METADATA"],
        inputs: { artifactKinds: ["TEXT"], mimePatterns: ["text/plain", "text/markdown"] },
        outputFormat: "MARKDOWN",
        deterministic: true,
        configurationSchema: { type: "object", properties: {}, additionalProperties: false },
        resourceHints: { maxInputBytes: 10485760, timeoutSeconds: 30 },
        status: "ACTIVE",
      },
      {
        converterId: "builtin-html-markdown",
        displayName: "Built-in HTML to Markdown",
        version: "1.0.0",
        runtime: "BUILT_IN",
        capabilities: ["CONVERT", "EXTRACT_METADATA", "PRESERVE_LINKS"],
        inputs: { artifactKinds: ["HTML"], mimePatterns: ["text/html", "application/xhtml+xml"] },
        outputFormat: "MARKDOWN",
        deterministic: true,
        configurationSchema: {
          type: "object",
          properties: { preserveLinks: { type: "boolean" } },
          additionalProperties: false,
        },
        resourceHints: { maxInputBytes: 10485760, timeoutSeconds: 30 },
        status: "ACTIVE",
      },
    ];
    const insert = database.prepare(`INSERT OR IGNORE INTO converter_manifests
      (converter_id, version, display_name, runtime, status, artifact_kinds_json,
       mime_patterns_json, capabilities_json, output_format, deterministic,
       document_json, registered_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const seed of seeds) {
      const manifest = normalizeManifest(seed);
      insert.run(
        manifest.converterId,
        manifest.version,
        manifest.displayName,
        manifest.runtime,
        manifest.status,
        JSON.stringify(manifest.inputs.artifactKinds),
        JSON.stringify(manifest.inputs.mimePatterns),
        JSON.stringify(manifest.capabilities),
        manifest.outputFormat,
        manifest.deterministic ? 1 : 0,
        JSON.stringify(manifest),
        now,
        now,
      );
    }
    database
      .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
      .run(MIGRATION_ID, now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export class SqliteConverterRegistryRepository implements ConverterRegistryRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = () => profileId(),
  ) {
    ensureConverterRegistry(database);
  }

  createManifest(input: CreateConverterManifestInput): ConverterRegistryRecord {
    const manifest = normalizeManifest(input);
    if (this.getManifest(manifest.converterId, manifest.version)) {
      throw new RegistryConflictError(
        "CONVERTER_VERSION_EXISTS",
        `Converter ${manifest.converterId}@${manifest.version} already exists`,
      );
    }
    const now = this.clock().toISOString();
    try {
      this.database
        .prepare(
          `INSERT INTO converter_manifests
        (converter_id, version, display_name, runtime, status, artifact_kinds_json,
         mime_patterns_json, capabilities_json, output_format, deterministic,
         document_json, registered_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          manifest.converterId,
          manifest.version,
          manifest.displayName,
          manifest.runtime,
          manifest.status,
          JSON.stringify(manifest.inputs.artifactKinds),
          JSON.stringify(manifest.inputs.mimePatterns),
          JSON.stringify(manifest.capabilities),
          manifest.outputFormat,
          manifest.deterministic ? 1 : 0,
          JSON.stringify(manifest),
          now,
          now,
        );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = (error as { code?: string }).code ?? "";
      if (code.includes("CONSTRAINT") || message.includes("UNIQUE constraint failed")) {
        throw new RegistryConflictError(
          "CONVERTER_VERSION_EXISTS",
          `Converter ${manifest.converterId}@${manifest.version} already exists`,
        );
      }
      throw error;
    }
    return this.requireManifest(manifest.converterId, manifest.version);
  }

  getManifest(converterId: string, version: string): ConverterRegistryRecord | null {
    const row = this.database
      .prepare(
        `SELECT ${manifestSelect()} FROM converter_manifests c WHERE c.converter_id = ? AND c.version = ?`,
      )
      .get(converterId, version) as Record<string, unknown> | undefined;
    return row ? recordFromRow(row) : null;
  }

  listManifests(filters: ConverterListFilters = {}): ConverterListResult {
    const pageLimit = limit(filters.limit);
    const pageOffset = offset(filters.offset);
    const clauses: string[] = [];
    const values: SQLInputValue[] = [];
    if (filters.q?.trim()) {
      clauses.push("(lower(c.converter_id) LIKE ? OR lower(c.display_name) LIKE ?)");
      const q = `%${filters.q.trim().toLowerCase()}%`;
      values.push(q, q);
    }
    const equals = (column: string, value: string | undefined) => {
      if (!value) return;
      clauses.push(`${column} = ?`);
      values.push(value);
    };
    equals("c.runtime", filters.runtime);
    equals("c.status", filters.status);
    equals("c.output_format", undefined);
    if (filters.capability) {
      clauses.push("EXISTS (SELECT 1 FROM json_each(c.capabilities_json) WHERE value = ?)");
      values.push(filters.capability);
    }
    if (filters.artifactKind) {
      clauses.push("EXISTS (SELECT 1 FROM json_each(c.artifact_kinds_json) WHERE value = ?)");
      values.push(filters.artifactKind);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.database
      .prepare(
        `SELECT ${manifestSelect()} FROM converter_manifests c ${where} ORDER BY c.converter_id, c.version DESC LIMIT ? OFFSET ?`,
      )
      .all(...values, pageLimit, pageOffset) as Record<string, unknown>[];
    let items = rows.map(recordFromRow);
    if (filters.mimeType)
      items = items.filter((item) =>
        item.manifest.inputs.mimePatterns.some((pattern) => {
          const [pt, ps] = pattern.split("/");
          const [mt, ms] = filters.mimeType!.toLowerCase().split("/");
          return (pt === "*" || pt === mt) && (ps === "*" || ps === ms);
        }),
      );
    const total = Number(
      (
        this.database
          .prepare(`SELECT COUNT(*) AS count FROM converter_manifests c ${where}`)
          .get(...values) as { count: number }
      ).count,
    );
    const summaryRows = this.database
      .prepare("SELECT status, COUNT(*) AS count FROM converter_manifests GROUP BY status")
      .all() as Array<{ status: ConverterStatus; count: number }>;
    const summary = { ACTIVE: 0, DEPRECATED: 0, DISABLED: 0, converterIds: 0, totalVersions: 0 };
    for (const row of summaryRows) summary[row.status] = Number(row.count);
    summary.totalVersions = summary.ACTIVE + summary.DEPRECATED + summary.DISABLED;
    summary.converterIds = Number(
      (
        this.database
          .prepare("SELECT COUNT(DISTINCT converter_id) AS count FROM converter_manifests")
          .get() as { count: number }
      ).count,
    );
    return { items, total, limit: pageLimit, offset: pageOffset, summary };
  }

  listVersions(converterId: string): ConverterRegistryRecord[] {
    return (
      this.database
        .prepare(
          `SELECT ${manifestSelect()} FROM converter_manifests c WHERE c.converter_id = ? ORDER BY c.version DESC`,
        )
        .all(converterId) as Record<string, unknown>[]
    ).map(recordFromRow);
  }

  updateManifestStatus(
    converterId: string,
    version: string,
    status: ConverterStatus,
  ): ConverterRegistryRecord {
    if (!CONVERTER_STATUSES.includes(status))
      throw new RegistryValidationError("Unknown converter status");
    const record = this.requireManifest(converterId, version);
    const manifest = { ...record.manifest, status };
    if (!isConverterManifest(manifest))
      throw new RegistryValidationError("Updated converter manifest is invalid");
    this.database
      .prepare(
        "UPDATE converter_manifests SET status = ?, document_json = ?, updated_at = ? WHERE converter_id = ? AND version = ?",
      )
      .run(status, JSON.stringify(manifest), this.clock().toISOString(), converterId, version);
    return this.requireManifest(converterId, version);
  }

  compatible(artifactKind: ArtifactKind, mimeType: string): ConverterRegistryRecord[] {
    return this.listManifests({ status: "ACTIVE", artifactKind, limit: MAX_LIMIT }).items.filter(
      (record) => converterAccepts(record.manifest, artifactKind, mimeType),
    );
  }

  createProfile(input: CreateConversionProfileInput): ConversionProfile {
    assertAllowedKeys(
      input,
      [
        "workspaceId",
        "sourceId",
        "name",
        "status",
        "converter",
        "input",
        "outputFormat",
        "targetPathTemplate",
        "configuration",
        "precedence",
        "autoConvert",
      ],
      "Conversion Profile",
    );
    if (input.status === "ARCHIVED") {
      throw new RegistryValidationError("New Conversion Profiles cannot start archived");
    }
    const now = this.clock().toISOString();
    const profile = this.normalizeProfile({
      ...input,
      id: this.idFactory(),
      status: input.status ?? "PAUSED",
      createdAt: now,
      updatedAt: now,
    });
    this.assertProfileCompatibility(profile, profile.status === "ACTIVE");
    try {
      this.database
        .prepare(
          `INSERT INTO conversion_profiles
        (id, workspace_id, source_id, name, status, converter_id, converter_version,
         precedence, auto_convert, document_json, created_at, updated_at, archived_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          profile.id,
          profile.workspaceId,
          profile.sourceId ?? null,
          profile.name,
          profile.status,
          profile.converter.converterId,
          profile.converter.version,
          profile.precedence,
          profile.autoConvert ? 1 : 0,
          JSON.stringify(profile),
          profile.createdAt,
          profile.updatedAt,
          profile.archivedAt ?? null,
        );
    } catch (error) {
      if ((error as { code?: string }).code?.includes("CONSTRAINT"))
        throw new RegistryConflictError(
          "CONVERSION_PROFILE_CONFLICT",
          "Conversion Profile name or reference conflicts with existing data",
        );
      throw error;
    }
    return this.requireProfile(profile.id);
  }

  getProfile(id: string): ConversionProfile | null {
    const row = this.database
      .prepare("SELECT document_json FROM conversion_profiles WHERE id = ?")
      .get(id) as { document_json: string } | undefined;
    return row ? parseProfile(row.document_json) : null;
  }

  listProfiles(filters: ConversionProfileFilters = {}): ConversionProfileListResult {
    const pageLimit = limit(filters.limit);
    const pageOffset = offset(filters.offset);
    const clauses: string[] = [];
    const values: SQLInputValue[] = [];
    const equals = (column: string, value: string | undefined) => {
      if (value) {
        clauses.push(`${column} = ?`);
        values.push(value);
      }
    };
    equals("workspace_id", filters.workspaceId);
    equals("source_id", filters.sourceId);
    equals("status", filters.status);
    equals("converter_id", filters.converterId);
    if (filters.q?.trim()) {
      clauses.push("lower(name) LIKE ?");
      values.push(`%${filters.q.trim().toLowerCase()}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.database
      .prepare(
        `SELECT document_json FROM conversion_profiles ${where} ORDER BY precedence DESC, created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...values, pageLimit, pageOffset) as Array<{ document_json: string }>;
    const total = Number(
      (
        this.database
          .prepare(`SELECT COUNT(*) AS count FROM conversion_profiles ${where}`)
          .get(...values) as { count: number }
      ).count,
    );
    const summaryRows = this.database
      .prepare("SELECT status, COUNT(*) AS count FROM conversion_profiles GROUP BY status")
      .all() as Array<{ status: ConversionProfileStatus; count: number }>;
    const summary = { ACTIVE: 0, PAUSED: 0, ARCHIVED: 0, total: 0 };
    for (const row of summaryRows) summary[row.status] = Number(row.count);
    summary.total = summary.ACTIVE + summary.PAUSED + summary.ARCHIVED;
    return {
      items: rows.map((row) => parseProfile(row.document_json)),
      total,
      limit: pageLimit,
      offset: pageOffset,
      summary,
    };
  }

  updateProfile(id: string, input: UpdateConversionProfileInput): ConversionProfile {
    assertAllowedKeys(
      input,
      [
        "expectedUpdatedAt",
        "sourceId",
        "name",
        "status",
        "converter",
        "input",
        "outputFormat",
        "targetPathTemplate",
        "configuration",
        "precedence",
        "autoConvert",
      ],
      "Conversion Profile update",
    );
    const current = this.requireProfile(id);
    if (current.status === "ARCHIVED")
      throw new RegistryConflictError(
        "CONVERSION_PROFILE_ARCHIVED",
        "Archived profiles cannot be edited",
      );
    if (current.updatedAt !== input.expectedUpdatedAt)
      throw new RegistryConflictError(
        "CONVERSION_PROFILE_STALE",
        "Conversion Profile changed since it was loaded",
      );
    const now = this.nextTimestamp(current.updatedAt);
    const next = this.normalizeProfile({
      ...current,
      ...input,
      id,
      workspaceId: current.workspaceId,
      createdAt: current.createdAt,
      updatedAt: now,
      status: input.status ?? current.status,
    });
    this.assertProfileCompatibility(next, next.status === "ACTIVE");
    this.persistProfile(next);
    return this.requireProfile(id);
  }

  updateProfileStatus(
    id: string,
    status: ConversionProfileStatus,
    expectedUpdatedAt: string,
  ): ConversionProfile {
    if (!CONVERSION_PROFILE_STATUSES.includes(status))
      throw new RegistryValidationError("Unknown profile status");
    const current = this.requireProfile(id);
    if (current.updatedAt !== expectedUpdatedAt)
      throw new RegistryConflictError(
        "CONVERSION_PROFILE_STALE",
        "Conversion Profile changed since it was loaded",
      );
    if (current.status === "ARCHIVED" && status !== "ARCHIVED")
      throw new RegistryConflictError(
        "CONVERSION_PROFILE_ARCHIVED",
        "Archived profiles cannot be re-enabled",
      );
    const now = this.nextTimestamp(current.updatedAt);
    const next = this.normalizeProfile({
      ...current,
      status,
      updatedAt: now,
      ...(status === "ARCHIVED" ? { archivedAt: now } : { archivedAt: undefined }),
    });
    this.assertProfileCompatibility(next, status === "ACTIVE");
    this.persistProfile(next);
    return this.requireProfile(id);
  }

  private nextTimestamp(previous: string): string {
    const candidate = this.clock().toISOString();
    if (candidate > previous) return candidate;
    return new Date(Date.parse(previous) + 1).toISOString();
  }

  private normalizeProfile(
    value: Omit<ConversionProfile, "protocolVersion" | "objectType">,
  ): ConversionProfile {
    assertAllowedKeys(value.converter, ["converterId", "version"], "Conversion Profile converter");
    assertAllowedKeys(value.input, ["artifactKinds", "mimePatterns"], "Conversion Profile input");
    const profile: ConversionProfile = {
      protocolVersion: CONVERSION_CONTROL_VERSION,
      objectType: "CONVERSION_PROFILE",
      id: value.id,
      workspaceId: value.workspaceId,
      ...(value.sourceId ? { sourceId: value.sourceId } : {}),
      name: value.name.trim(),
      status: value.status,
      converter: {
        converterId: value.converter.converterId.trim().toLowerCase(),
        version: value.converter.version.trim(),
      },
      input: {
        artifactKinds: unique(value.input.artifactKinds),
        mimePatterns: unique(value.input.mimePatterns.map((item) => item.toLowerCase())),
      },
      outputFormat: value.outputFormat,
      targetPathTemplate: value.targetPathTemplate.trim(),
      configuration: clone(value.configuration),
      precedence: value.precedence,
      autoConvert: value.autoConvert,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      ...(value.archivedAt ? { archivedAt: value.archivedAt } : {}),
    };
    if (!isConversionProfile(profile))
      throw new RegistryValidationError(
        "Conversion Profile does not satisfy Conversion Control v1",
      );
    return profile;
  }

  private assertProfileCompatibility(profile: ConversionProfile, requireActive: boolean): void {
    const manifestRecord = this.getManifest(
      profile.converter.converterId,
      profile.converter.version,
    );
    if (!manifestRecord)
      throw new ConverterNotFoundError(profile.converter.converterId, profile.converter.version);
    const manifest = manifestRecord.manifest;
    if (requireActive && manifest.status !== "ACTIVE")
      throw new RegistryConflictError(
        "CONVERTER_NOT_ACTIVE",
        "An ACTIVE profile requires an exact ACTIVE Converter version",
      );
    if (profile.outputFormat !== manifest.outputFormat)
      throw new RegistryConflictError(
        "CONVERTER_OUTPUT_INCOMPATIBLE",
        "Profile output format is not supported by the Converter",
      );
    for (const kind of profile.input.artifactKinds) {
      if (!manifest.inputs.artifactKinds.includes(kind))
        throw new RegistryConflictError(
          "CONVERTER_INPUT_INCOMPATIBLE",
          `Converter does not accept ${kind}`,
        );
    }
    for (const mime of profile.input.mimePatterns) {
      if (!manifest.inputs.mimePatterns.includes(mime))
        throw new RegistryConflictError(
          "CONVERTER_MIME_INCOMPATIBLE",
          `Converter does not declare ${mime}`,
        );
    }
    validateConfiguration(profile.configuration, manifest.configurationSchema);
    if (profile.sourceId) {
      const source = this.database
        .prepare("SELECT workspace_id FROM source_definitions WHERE id = ?")
        .get(profile.sourceId) as { workspace_id: string } | undefined;
      if (!source || source.workspace_id !== profile.workspaceId)
        throw new RegistryConflictError(
          "CONVERSION_PROFILE_SOURCE_SCOPE_INVALID",
          "Source must exist in the same Workspace",
        );
    }
  }

  private persistProfile(profile: ConversionProfile): void {
    this.database
      .prepare(
        `UPDATE conversion_profiles SET
      source_id = ?, name = ?, status = ?, converter_id = ?, converter_version = ?,
      precedence = ?, auto_convert = ?, document_json = ?, updated_at = ?, archived_at = ?
      WHERE id = ?`,
      )
      .run(
        profile.sourceId ?? null,
        profile.name,
        profile.status,
        profile.converter.converterId,
        profile.converter.version,
        profile.precedence,
        profile.autoConvert ? 1 : 0,
        JSON.stringify(profile),
        profile.updatedAt,
        profile.archivedAt ?? null,
        profile.id,
      );
  }

  private requireManifest(converterId: string, version: string): ConverterRegistryRecord {
    const record = this.getManifest(converterId, version);
    if (!record) throw new ConverterNotFoundError(converterId, version);
    return record;
  }
  private requireProfile(id: string): ConversionProfile {
    const profile = this.getProfile(id);
    if (!profile) throw new ConversionProfileNotFoundError(id);
    return profile;
  }
}
