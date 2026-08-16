import { randomBytes } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  ARTIFACT_KINDS,
  COLLECTION_PLAN_STATUSES,
  COLLECTION_PRIORITIES,
  CRAWL4AI_MAX_DEPTH,
  CRAWL4AI_MAX_ITEMS,
  CRAWL4AI_MAX_LOCALE_LENGTH,
  CRAWL4AI_MAX_PATTERN_LENGTH,
  CRAWL4AI_MAX_PATTERNS_PER_LIST,
  CRAWL4AI_MAX_RATE_LIMIT_PER_MINUTE,
  CRAWL4AI_MAX_TIMEOUT_SECONDS,
  SCHEMA_V1_VERSION,
  SCHEDULE_MODES,
  isCollectionPlan,
  isConnectorManifest,
  isSourceDefinition,
  type ArtifactKind,
  type CollectionPlan,
  type CollectionPlanStatus,
  type CollectionPriority,
  type CollectionSchedule,
  type ConnectorManifest,
  type Extensions,
  type ScheduleMode,
  type SourceDefinition,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryNotFoundError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MIGRATION_ID = "0003_collection_plan_registry";

export type CreateCollectionPlanInput = {
  workspaceId?: string;
  sourceId: string;
  name: string;
  status?: CollectionPlanStatus;
  schedule: CollectionSchedule;
  priority: CollectionPriority;
  policy: CollectionPlan["policy"];
  output: CollectionPlan["output"];
  extensions?: Extensions;
};

export type UpdateCollectionPlanInput = Partial<
  Pick<CollectionPlan, "name" | "schedule" | "priority" | "policy" | "output" | "extensions">
> & {
  extensions?: Extensions | null;
};

export type CollectionPlanListFilters = {
  q?: string;
  workspaceId?: string;
  sourceId?: string;
  status?: CollectionPlanStatus;
  scheduleMode?: ScheduleMode;
  priority?: CollectionPriority;
  connectorId?: string;
  artifactKind?: ArtifactKind;
  limit?: number;
  offset?: number;
};

export type CollectionPlanRegistryRecord = {
  plan: CollectionPlan;
  source: Pick<SourceDefinition, "id" | "name" | "slug" | "status" | "sourceType" | "connector">;
  runtimeState: "NOT_SCHEDULED";
};

export type CollectionPlanSummary = {
  total: number;
  statuses: Record<CollectionPlanStatus, number>;
  scheduleModes: Record<ScheduleMode, number>;
};

export type CollectionPlanListResult = {
  items: CollectionPlanRegistryRecord[];
  total: number;
  limit: number;
  offset: number;
  summary: CollectionPlanSummary;
};

export interface CollectionPlanRepository {
  create(input: CreateCollectionPlanInput): CollectionPlanRegistryRecord;
  getById(id: string): CollectionPlanRegistryRecord | null;
  list(filters?: CollectionPlanListFilters): CollectionPlanListResult;
  listForSource(sourceId: string): CollectionPlanRegistryRecord[];
  update(
    id: string,
    input: UpdateCollectionPlanInput,
    expectedUpdatedAt: string,
  ): CollectionPlanRegistryRecord;
  updateStatus(
    id: string,
    status: CollectionPlanStatus,
    expectedUpdatedAt: string,
  ): CollectionPlanRegistryRecord;
  setSourceDefaultPlan(
    sourceId: string,
    planId: string | null,
    expectedSourceUpdatedAt: string,
  ): SourceDefinition;
}

export class CollectionPlanNotFoundError extends RegistryError {
  constructor(id: string) {
    super("COLLECTION_PLAN_NOT_FOUND", `Collection plan ${id} was not found`, { id });
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

export function generateCollectionPlanId(now = Date.now()): string {
  const timestamp = encodeBase32(BigInt(now), 10);
  const randomValue = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `pln_${timestamp}${encodeBase32(randomValue, 16)}`;
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

function parseSource(value: unknown): SourceDefinition {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isSourceDefinition(parsed)) {
    throw new RegistryValidationError("Persisted source no longer satisfies Schema v1");
  }
  return parsed;
}

function parseConnector(value: unknown): ConnectorManifest {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isConnectorManifest(parsed)) {
    throw new RegistryValidationError("Persisted connector no longer satisfies Schema v1");
  }
  return parsed;
}

function parsePlan(value: unknown): CollectionPlan {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isCollectionPlan(parsed)) {
    throw new RegistryValidationError("Persisted collection plan no longer satisfies Schema v1");
  }
  return parsed;
}

function loadSource(database: DatabaseSync, sourceId: string): SourceDefinition {
  const row = database
    .prepare("SELECT document_json FROM source_definitions WHERE id = ?")
    .get(sourceId) as { document_json: string } | undefined;
  if (!row) throw new RegistryNotFoundError(sourceId);
  return parseSource(row.document_json);
}

function loadConnector(database: DatabaseSync, source: SourceDefinition): ConnectorManifest {
  const row = database
    .prepare(
      `SELECT document_json FROM connector_manifests
       WHERE connector_id = ? AND version = ?`,
    )
    .get(source.connector.connectorId, source.connector.version) as
    { document_json: string } | undefined;
  if (!row) {
    throw new RegistryConflictError(
      "COLLECTION_PLAN_CONNECTOR_MISSING",
      `Connector ${source.connector.connectorId}@${source.connector.version} is not registered`,
      { sourceId: source.id },
    );
  }
  return parseConnector(row.document_json);
}

function normalizeSchedule(schedule: CollectionSchedule): CollectionSchedule {
  switch (schedule.mode) {
    case "MANUAL":
      return { mode: "MANUAL" };
    case "INTERVAL":
      return { mode: "INTERVAL", intervalSeconds: schedule.intervalSeconds };
    case "CRON":
      return {
        mode: "CRON",
        expression: schedule.expression.trim(),
        timezone: schedule.timezone.trim(),
      };
    case "CHANGE_WATCH":
      return { mode: "CHANGE_WATCH", pollIntervalSeconds: schedule.pollIntervalSeconds };
  }
}

function normalizePolicy(policy: CollectionPlan["policy"]): CollectionPlan["policy"] {
  return {
    includePatterns: policy.includePatterns.map((value) => value.trim()).filter(Boolean),
    excludePatterns: policy.excludePatterns.map((value) => value.trim()).filter(Boolean),
    maxDepth: policy.maxDepth,
    maxItems: policy.maxItems,
    renderJavascript: policy.renderJavascript,
    fetchAttachments: policy.fetchAttachments,
    respectRobots: policy.respectRobots,
    rateLimitPerMinute: policy.rateLimitPerMinute,
    timeoutSeconds: policy.timeoutSeconds,
    retry: {
      maxAttempts: policy.retry.maxAttempts,
      backoffSeconds: policy.retry.backoffSeconds,
    },
    ...(policy.locale ? { locale: policy.locale.trim() } : {}),
  };
}

function normalizePlan(
  input: CreateCollectionPlanInput,
  id: string,
  timestamp: string,
  source: SourceDefinition,
): CollectionPlan {
  const plan: CollectionPlan = {
    schemaVersion: SCHEMA_V1_VERSION,
    objectType: "COLLECTION_PLAN",
    id,
    workspaceId: input.workspaceId ?? source.workspaceId,
    sourceId: input.sourceId.trim(),
    name: input.name.trim(),
    status: input.status ?? "PAUSED",
    schedule: normalizeSchedule(input.schedule),
    priority: input.priority,
    policy: normalizePolicy(input.policy),
    output: {
      artifactKinds: [...new Set(input.output.artifactKinds)],
      ...(input.output.conversionProfileId
        ? { conversionProfileId: input.output.conversionProfileId.trim() }
        : {}),
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.extensions ? { extensions: input.extensions } : {}),
  };
  if (!isCollectionPlan(plan)) {
    throw new RegistryValidationError("Collection plan input does not satisfy Schema v1");
  }
  if (plan.workspaceId !== source.workspaceId) {
    throw new RegistryValidationError("Collection plan Workspace must match its source Workspace");
  }
  return plan;
}

function applyUpdate(
  current: CollectionPlan,
  input: UpdateCollectionPlanInput,
  timestamp: string,
): CollectionPlan {
  if (current.status === "ARCHIVED") {
    throw new RegistryConflictError(
      "COLLECTION_PLAN_ARCHIVED",
      "Archived collection plans are immutable",
    );
  }
  const next: CollectionPlan = {
    ...current,
    ...input,
    name: input.name === undefined ? current.name : input.name.trim(),
    schedule: input.schedule === undefined ? current.schedule : normalizeSchedule(input.schedule),
    policy: input.policy === undefined ? current.policy : normalizePolicy(input.policy),
    output:
      input.output === undefined
        ? current.output
        : {
            artifactKinds: [...new Set(input.output.artifactKinds)],
            ...(input.output.conversionProfileId
              ? { conversionProfileId: input.output.conversionProfileId.trim() }
              : {}),
          },
    updatedAt: timestamp,
  };
  if (input.extensions === null) delete next.extensions;
  if (!isCollectionPlan(next)) {
    throw new RegistryValidationError("Collection plan update does not satisfy Schema v1");
  }
  return next;
}

function assertCapability(
  connector: ConnectorManifest,
  capability: ConnectorManifest["capabilities"][number],
  message: string,
): void {
  if (!connector.capabilities.includes(capability)) {
    throw new RegistryConflictError("COLLECTION_PLAN_CAPABILITY_MISMATCH", message, {
      connectorId: connector.connectorId,
      version: connector.version,
      capability,
    });
  }
}

function crawl4AiStartUrls(source: SourceDefinition): string[] {
  return [
    ...new Set(
      [source.canonicalUri, ...source.entrypoints.map((entrypoint) => entrypoint.uri)].filter(
        (uri): uri is string => Boolean(uri),
      ),
    ),
  ];
}

function validateCrawl4AiChangeWatch(plan: CollectionPlan, source: SourceDefinition): void {
  if (source.connector.connectorId !== "crawl4ai-web" || plan.schedule.mode !== "CHANGE_WATCH") {
    return;
  }
  const watchedStartUrls = crawl4AiStartUrls(source);
  if (watchedStartUrls.length <= plan.policy.maxItems) return;
  throw new RegistryConflictError(
    "COLLECTION_PLAN_CHANGE_WATCH_ENTRYPOINT_BUDGET_EXCEEDED",
    `Change-watch plan maxItems ${plan.policy.maxItems} cannot cover all ${watchedStartUrls.length} governed Crawl4AI start URLs`,
    {
      connectorId: source.connector.connectorId,
      watchedStartUrls: watchedStartUrls.length,
      maxItems: plan.policy.maxItems,
    },
  );
}

function validateCrawl4AiPolicy(plan: CollectionPlan, connector: ConnectorManifest): void {
  if (connector.connectorId !== "crawl4ai-web") return;
  const violations: Array<{ field: string; actual: number; maximum: number }> = [];
  const policy = plan.policy;
  if (policy.maxDepth > CRAWL4AI_MAX_DEPTH) {
    violations.push({ field: "maxDepth", actual: policy.maxDepth, maximum: CRAWL4AI_MAX_DEPTH });
  }
  if (policy.maxItems > CRAWL4AI_MAX_ITEMS) {
    violations.push({ field: "maxItems", actual: policy.maxItems, maximum: CRAWL4AI_MAX_ITEMS });
  }
  if (policy.rateLimitPerMinute > CRAWL4AI_MAX_RATE_LIMIT_PER_MINUTE) {
    violations.push({
      field: "rateLimitPerMinute",
      actual: policy.rateLimitPerMinute,
      maximum: CRAWL4AI_MAX_RATE_LIMIT_PER_MINUTE,
    });
  }
  if (policy.timeoutSeconds > CRAWL4AI_MAX_TIMEOUT_SECONDS) {
    violations.push({
      field: "timeoutSeconds",
      actual: policy.timeoutSeconds,
      maximum: CRAWL4AI_MAX_TIMEOUT_SECONDS,
    });
  }
  if (policy.includePatterns.length > CRAWL4AI_MAX_PATTERNS_PER_LIST) {
    violations.push({
      field: "includePatterns.length",
      actual: policy.includePatterns.length,
      maximum: CRAWL4AI_MAX_PATTERNS_PER_LIST,
    });
  }
  if (policy.excludePatterns.length > CRAWL4AI_MAX_PATTERNS_PER_LIST) {
    violations.push({
      field: "excludePatterns.length",
      actual: policy.excludePatterns.length,
      maximum: CRAWL4AI_MAX_PATTERNS_PER_LIST,
    });
  }
  const longestPattern = Math.max(
    0,
    ...policy.includePatterns.map((pattern) => pattern.length),
    ...policy.excludePatterns.map((pattern) => pattern.length),
  );
  if (longestPattern > CRAWL4AI_MAX_PATTERN_LENGTH) {
    violations.push({
      field: "pattern.length",
      actual: longestPattern,
      maximum: CRAWL4AI_MAX_PATTERN_LENGTH,
    });
  }
  if (policy.locale && policy.locale.length > CRAWL4AI_MAX_LOCALE_LENGTH) {
    violations.push({
      field: "locale.length",
      actual: policy.locale.length,
      maximum: CRAWL4AI_MAX_LOCALE_LENGTH,
    });
  }
  if (violations.length === 0) return;
  throw new RegistryConflictError(
    "COLLECTION_PLAN_CRAWL4AI_POLICY_MISMATCH",
    "Collection plan exceeds the governed Crawl4AI runtime policy boundary",
    { connectorId: connector.connectorId, violations },
  );
}

function validateCompatibility(
  plan: CollectionPlan,
  source: SourceDefinition,
  connector: ConnectorManifest,
): void {
  validateCrawl4AiPolicy(plan, connector);
  validateCrawl4AiChangeWatch(plan, source);

  if (!connector.sourceTypes.includes(source.sourceType)) {
    throw new RegistryConflictError(
      "COLLECTION_PLAN_SOURCE_TYPE_MISMATCH",
      `Connector ${connector.connectorId}@${connector.version} does not support ${source.sourceType}`,
    );
  }

  const unsupportedKinds = plan.output.artifactKinds.filter(
    (kind) => !connector.outputArtifactKinds.includes(kind),
  );
  if (unsupportedKinds.length > 0) {
    throw new RegistryConflictError(
      "COLLECTION_PLAN_OUTPUT_MISMATCH",
      "Collection plan requests unsupported output artifact kinds",
      { unsupportedKinds },
    );
  }

  if (plan.policy.renderJavascript) {
    assertCapability(
      connector,
      "RENDER_JAVASCRIPT",
      "The bound connector does not support JavaScript rendering",
    );
  }
  if (plan.policy.fetchAttachments) {
    assertCapability(
      connector,
      "FETCH_ATTACHMENTS",
      "The bound connector does not support attachment fetching",
    );
  }
  if (
    plan.schedule.mode === "CHANGE_WATCH" &&
    !connector.capabilities.includes("CHECK_UPDATE") &&
    !connector.capabilities.includes("WATCH")
  ) {
    throw new RegistryConflictError(
      "COLLECTION_PLAN_CHANGE_WATCH_UNSUPPORTED",
      "The bound connector does not support update checks or watch mode",
    );
  }

  if (plan.status === "ACTIVE") {
    if (source.status !== "ACTIVE") {
      throw new RegistryConflictError(
        "COLLECTION_PLAN_SOURCE_INACTIVE",
        "An active collection plan requires an active source",
      );
    }
    if (connector.status !== "ACTIVE") {
      throw new RegistryConflictError(
        "COLLECTION_PLAN_CONNECTOR_INACTIVE",
        "An active collection plan requires an active connector version",
      );
    }
    assertCapability(
      connector,
      "COLLECT",
      "An active collection plan requires a connector with COLLECT capability",
    );
  }
}

function planRow(plan: CollectionPlan, connectorId: string) {
  return {
    id: plan.id,
    workspaceId: plan.workspaceId,
    sourceId: plan.sourceId,
    name: plan.name,
    status: plan.status,
    scheduleMode: plan.schedule.mode,
    priority: plan.priority,
    connectorId,
    outputKindsJson: JSON.stringify(plan.output.artifactKinds),
    documentJson: JSON.stringify(plan),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

function recordFromRow(row: Record<string, unknown>): CollectionPlanRegistryRecord {
  const plan = parsePlan(row.plan_document_json ?? row.document_json);
  const source = parseSource(row.source_document_json);
  return {
    plan,
    source: {
      id: source.id,
      name: source.name,
      slug: source.slug,
      status: source.status,
      sourceType: source.sourceType,
      connector: source.connector,
    },
    runtimeState: "NOT_SCHEDULED",
  };
}

function selectColumns(): string {
  return `
    p.document_json AS plan_document_json,
    s.document_json AS source_document_json
  `;
}

function buildWhere(filters: CollectionPlanListFilters, includeStatus = true) {
  const clauses: string[] = [];
  const values: SQLInputValue[] = [];
  if (filters.q?.trim()) {
    const query = `%${filters.q.trim().toLowerCase()}%`;
    clauses.push("(lower(p.name) LIKE ? OR lower(s.name) LIKE ? OR lower(s.slug) LIKE ?)");
    values.push(query, query, query);
  }
  if (filters.workspaceId) {
    clauses.push("p.workspace_id = ?");
    values.push(filters.workspaceId);
  }
  if (filters.sourceId) {
    clauses.push("p.source_id = ?");
    values.push(filters.sourceId);
  }
  if (includeStatus && filters.status) {
    clauses.push("p.status = ?");
    values.push(filters.status);
  }
  if (filters.scheduleMode) {
    clauses.push("p.schedule_mode = ?");
    values.push(filters.scheduleMode);
  }
  if (filters.priority) {
    clauses.push("p.priority = ?");
    values.push(filters.priority);
  }
  if (filters.connectorId) {
    clauses.push("p.connector_id = ?");
    values.push(filters.connectorId);
  }
  if (filters.artifactKind) {
    clauses.push("EXISTS (SELECT 1 FROM json_each(p.output_kinds_json) WHERE value = ?)");
    values.push(filters.artifactKind);
  }
  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function isUniquePlanNameError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

export function ensureCollectionPlanRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  const applied = database
    .prepare("SELECT id FROM schema_migrations WHERE id = ?")
    .get(MIGRATION_ID);
  if (applied) return;

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS collection_plans (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        schedule_mode TEXT NOT NULL,
        priority TEXT NOT NULL,
        connector_id TEXT NOT NULL,
        output_kinds_json TEXT NOT NULL,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (source_id) REFERENCES source_definitions(id),
        UNIQUE (source_id, name)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_collection_plans_workspace_status
        ON collection_plans(workspace_id, status);
      CREATE INDEX IF NOT EXISTS idx_collection_plans_source
        ON collection_plans(source_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_collection_plans_schedule_priority
        ON collection_plans(schedule_mode, priority);
      CREATE INDEX IF NOT EXISTS idx_collection_plans_connector
        ON collection_plans(connector_id);
    `);
    database
      .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
      .run(MIGRATION_ID, new Date().toISOString());
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

export function assertCollectionPlanFilterValues(filters: CollectionPlanListFilters): void {
  if (filters.status && !COLLECTION_PLAN_STATUSES.includes(filters.status)) {
    throw new RegistryValidationError("Unknown collection plan status filter");
  }
  if (filters.scheduleMode && !SCHEDULE_MODES.includes(filters.scheduleMode)) {
    throw new RegistryValidationError("Unknown collection plan scheduleMode filter");
  }
  if (filters.priority && !COLLECTION_PRIORITIES.includes(filters.priority)) {
    throw new RegistryValidationError("Unknown collection plan priority filter");
  }
  if (filters.artifactKind && !ARTIFACT_KINDS.includes(filters.artifactKind)) {
    throw new RegistryValidationError("Unknown collection plan artifactKind filter");
  }
}

export class SqliteCollectionPlanRepository implements CollectionPlanRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = () => generateCollectionPlanId(),
  ) {
    ensureCollectionPlanRegistry(database);
  }

  create(input: CreateCollectionPlanInput): CollectionPlanRegistryRecord {
    const source = loadSource(this.database, input.sourceId);
    const connector = loadConnector(this.database, source);
    const plan = normalizePlan(input, this.idFactory(), this.clock().toISOString(), source);
    validateCompatibility(plan, source, connector);
    const row = planRow(plan, connector.connectorId);

    try {
      this.database
        .prepare(
          `INSERT INTO collection_plans (
             id, workspace_id, source_id, name, status, schedule_mode, priority,
             connector_id, output_kinds_json, document_json, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.id,
          row.workspaceId,
          row.sourceId,
          row.name,
          row.status,
          row.scheduleMode,
          row.priority,
          row.connectorId,
          row.outputKindsJson,
          row.documentJson,
          row.createdAt,
          row.updatedAt,
        );
    } catch (error) {
      if (isUniquePlanNameError(error)) {
        throw new RegistryConflictError(
          "COLLECTION_PLAN_NAME_CONFLICT",
          `A collection plan named ${plan.name} already exists for source ${plan.sourceId}`,
        );
      }
      throw error;
    }
    return this.getById(plan.id)!;
  }

  getById(id: string): CollectionPlanRegistryRecord | null {
    const row = this.database
      .prepare(
        `SELECT ${selectColumns()}
         FROM collection_plans p
         JOIN source_definitions s ON s.id = p.source_id
         WHERE p.id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    return row ? recordFromRow(row) : null;
  }

  list(filters: CollectionPlanListFilters = {}): CollectionPlanListResult {
    assertCollectionPlanFilterValues(filters);
    const limit = normalizeLimit(filters.limit);
    const offset = normalizeOffset(filters.offset);
    const where = buildWhere(filters);

    const items = this.database
      .prepare(
        `SELECT ${selectColumns()}
         FROM collection_plans p
         JOIN source_definitions s ON s.id = p.source_id
         ${where.sql}
         ORDER BY p.updated_at DESC, p.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...where.values, limit, offset)
      .map((row) => recordFromRow(row as Record<string, unknown>));

    const total = Number(
      (
        this.database
          .prepare(
            `SELECT COUNT(*) AS count
             FROM collection_plans p
             JOIN source_definitions s ON s.id = p.source_id
             ${where.sql}`,
          )
          .get(...where.values) as { count: number }
      ).count,
    );

    const summaryWhere = buildWhere(filters, false);
    const statusRows = this.database
      .prepare(
        `SELECT p.status, COUNT(*) AS count
         FROM collection_plans p
         JOIN source_definitions s ON s.id = p.source_id
         ${summaryWhere.sql}
         GROUP BY p.status`,
      )
      .all(...summaryWhere.values) as Array<{ status: CollectionPlanStatus; count: number }>;
    const scheduleRows = this.database
      .prepare(
        `SELECT p.schedule_mode AS mode, COUNT(*) AS count
         FROM collection_plans p
         JOIN source_definitions s ON s.id = p.source_id
         ${summaryWhere.sql}
         GROUP BY p.schedule_mode`,
      )
      .all(...summaryWhere.values) as Array<{ mode: ScheduleMode; count: number }>;

    const statuses = Object.fromEntries(
      COLLECTION_PLAN_STATUSES.map((status) => [status, 0]),
    ) as Record<CollectionPlanStatus, number>;
    for (const row of statusRows) statuses[row.status] = Number(row.count);
    const scheduleModes = Object.fromEntries(SCHEDULE_MODES.map((mode) => [mode, 0])) as Record<
      ScheduleMode,
      number
    >;
    for (const row of scheduleRows) scheduleModes[row.mode] = Number(row.count);

    return {
      items,
      total,
      limit,
      offset,
      summary: {
        total: Object.values(statuses).reduce((sum, count) => sum + count, 0),
        statuses,
        scheduleModes,
      },
    };
  }

  listForSource(sourceId: string): CollectionPlanRegistryRecord[] {
    loadSource(this.database, sourceId);
    return this.list({ sourceId, limit: MAX_LIMIT }).items;
  }

  update(
    id: string,
    input: UpdateCollectionPlanInput,
    expectedUpdatedAt: string,
  ): CollectionPlanRegistryRecord {
    const currentRecord = this.getById(id);
    if (!currentRecord) throw new CollectionPlanNotFoundError(id);
    if (currentRecord.plan.updatedAt !== expectedUpdatedAt) {
      throw new RegistryConflictError(
        "COLLECTION_PLAN_VERSION_CONFLICT",
        "The collection plan changed after it was loaded. Refresh before saving.",
      );
    }
    const source = loadSource(this.database, currentRecord.plan.sourceId);
    const connector = loadConnector(this.database, source);
    const next = applyUpdate(currentRecord.plan, input, this.clock().toISOString());
    validateCompatibility(next, source, connector);
    this.writeUpdate(next, expectedUpdatedAt, connector.connectorId);
    return this.getById(id)!;
  }

  updateStatus(
    id: string,
    status: CollectionPlanStatus,
    expectedUpdatedAt: string,
  ): CollectionPlanRegistryRecord {
    if (!COLLECTION_PLAN_STATUSES.includes(status)) {
      throw new RegistryValidationError("Unknown collection plan status");
    }
    const currentRecord = this.getById(id);
    if (!currentRecord) throw new CollectionPlanNotFoundError(id);
    if (currentRecord.plan.updatedAt !== expectedUpdatedAt) {
      throw new RegistryConflictError(
        "COLLECTION_PLAN_VERSION_CONFLICT",
        "The collection plan changed after it was loaded. Refresh before saving.",
      );
    }
    if (currentRecord.plan.status === "ARCHIVED" && status !== "ARCHIVED") {
      throw new RegistryConflictError(
        "COLLECTION_PLAN_ARCHIVED",
        "Archived collection plans cannot be reactivated",
      );
    }
    const source = loadSource(this.database, currentRecord.plan.sourceId);
    const connector = loadConnector(this.database, source);
    const next: CollectionPlan = {
      ...currentRecord.plan,
      status,
      updatedAt: this.clock().toISOString(),
    };
    validateCompatibility(next, source, connector);
    this.writeUpdate(next, expectedUpdatedAt, connector.connectorId);
    if (status === "ARCHIVED") this.clearDefaultPlanIfNeeded(next);
    return this.getById(id)!;
  }

  setSourceDefaultPlan(
    sourceId: string,
    planId: string | null,
    expectedSourceUpdatedAt: string,
  ): SourceDefinition {
    const source = loadSource(this.database, sourceId);
    if (source.updatedAt !== expectedSourceUpdatedAt) {
      throw new RegistryConflictError(
        "SOURCE_VERSION_CONFLICT",
        "The source changed after it was loaded. Refresh before saving.",
      );
    }

    if (planId) {
      const record = this.getById(planId);
      if (!record) throw new CollectionPlanNotFoundError(planId);
      if (record.plan.sourceId !== sourceId) {
        throw new RegistryConflictError(
          "SOURCE_DEFAULT_PLAN_MISMATCH",
          "The default collection plan must belong to the same source",
        );
      }
      if (record.plan.status === "ARCHIVED") {
        throw new RegistryConflictError(
          "SOURCE_DEFAULT_PLAN_ARCHIVED",
          "An archived collection plan cannot be the source default",
        );
      }
    }

    const next: SourceDefinition = {
      ...source,
      updatedAt: this.clock().toISOString(),
      ...(planId ? { defaultCollectionPlanId: planId } : {}),
    };
    if (!planId) delete next.defaultCollectionPlanId;
    if (!isSourceDefinition(next)) {
      throw new RegistryValidationError("Source default collection plan update is invalid");
    }
    const result = this.database
      .prepare(
        `UPDATE source_definitions
         SET document_json = ?, updated_at = ?
         WHERE id = ? AND updated_at = ?`,
      )
      .run(JSON.stringify(next), next.updatedAt, sourceId, expectedSourceUpdatedAt);
    if (Number(result.changes) !== 1) {
      throw new RegistryConflictError(
        "SOURCE_VERSION_CONFLICT",
        "The source changed after it was loaded. Refresh before saving.",
      );
    }
    return next;
  }

  private writeUpdate(plan: CollectionPlan, expectedUpdatedAt: string, connectorId: string): void {
    const row = planRow(plan, connectorId);
    try {
      const result = this.database
        .prepare(
          `UPDATE collection_plans SET
             name = ?, status = ?, schedule_mode = ?, priority = ?, connector_id = ?,
             output_kinds_json = ?, document_json = ?, updated_at = ?
           WHERE id = ? AND updated_at = ?`,
        )
        .run(
          row.name,
          row.status,
          row.scheduleMode,
          row.priority,
          row.connectorId,
          row.outputKindsJson,
          row.documentJson,
          row.updatedAt,
          row.id,
          expectedUpdatedAt,
        );
      if (Number(result.changes) !== 1) {
        throw new RegistryConflictError(
          "COLLECTION_PLAN_VERSION_CONFLICT",
          "The collection plan changed after it was loaded. Refresh before saving.",
        );
      }
    } catch (error) {
      if (isUniquePlanNameError(error)) {
        throw new RegistryConflictError(
          "COLLECTION_PLAN_NAME_CONFLICT",
          `A collection plan named ${plan.name} already exists for source ${plan.sourceId}`,
        );
      }
      throw error;
    }
  }

  private clearDefaultPlanIfNeeded(plan: CollectionPlan): void {
    const source = loadSource(this.database, plan.sourceId);
    if (source.defaultCollectionPlanId !== plan.id) return;
    const next = { ...source, updatedAt: this.clock().toISOString() };
    delete next.defaultCollectionPlanId;
    if (!isSourceDefinition(next)) {
      throw new RegistryValidationError("Unable to clear archived default collection plan");
    }
    this.database
      .prepare("UPDATE source_definitions SET document_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(next), next.updatedAt, source.id);
  }
}
