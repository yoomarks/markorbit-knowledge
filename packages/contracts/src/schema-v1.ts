import {
  ARTIFACT_STATUSES,
  JOB_TYPES,
  SOURCE_STATUSES,
  SOURCE_TYPES,
  type ArtifactStatus,
  type JobType,
  type SourceStatus,
  type SourceType,
} from "./vocabularies";

export const SCHEMA_V1_VERSION = "1.0" as const;
export const CRAWL4AI_MAX_START_URLS = 500;

export const DATA_DOMAINS = ["PUBLIC", "ORGANIZATION", "WORKSPACE_PRIVATE", "USER_LOCAL"] as const;
export type DataDomain = (typeof DATA_DOMAINS)[number];

export const WORKSPACE_STATUSES = ["ACTIVE", "SUSPENDED", "ARCHIVED"] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

export const SYNC_MODES = ["RAW", "METADATA", "LOCAL_ONLY"] as const;
export type SyncMode = (typeof SYNC_MODES)[number];

export const CONNECTOR_RUNTIMES = ["PYTHON", "NODE", "EXTERNAL", "LOCAL_AGENT"] as const;
export type ConnectorRuntime = (typeof CONNECTOR_RUNTIMES)[number];

export const CONNECTOR_CAPABILITIES = [
  "TEST_CONNECTION",
  "DISCOVER",
  "PREVIEW",
  "COLLECT",
  "CHECK_UPDATE",
  "DEEP_CRAWL",
  "RENDER_JAVASCRIPT",
  "FETCH_ATTACHMENTS",
  "WATCH",
  "IMPORT",
] as const;
export type ConnectorCapability = (typeof CONNECTOR_CAPABILITIES)[number];

export const CONNECTOR_STATUSES = ["ACTIVE", "DEPRECATED", "DISABLED"] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

export const HEALTH_CHECK_MODES = ["NONE", "DECLARATIVE_ENDPOINT", "WORKER_PROBE"] as const;
export type HealthCheckMode = (typeof HEALTH_CHECK_MODES)[number];

export const SOURCE_CATEGORIES = [
  "OFFICIAL_AUTHORITY",
  "OFFICIAL_GUIDANCE",
  "LAW_FIRM",
  "NEWS",
  "RESEARCH",
  "TECHNICAL",
  "INTERNAL",
  "USER_PROVIDED",
  "OTHER",
] as const;
export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];

export const AUTHORITY_LEVELS = [
  "PRIMARY_OFFICIAL",
  "SECONDARY_OFFICIAL",
  "PROFESSIONAL",
  "INDUSTRY",
  "COMMUNITY",
  "INTERNAL",
  "UNKNOWN",
] as const;
export type AuthorityLevel = (typeof AUTHORITY_LEVELS)[number];

export const COLLECTION_PLAN_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED"] as const;
export type CollectionPlanStatus = (typeof COLLECTION_PLAN_STATUSES)[number];

export const SCHEDULE_MODES = ["MANUAL", "INTERVAL", "CRON", "CHANGE_WATCH"] as const;
export type ScheduleMode = (typeof SCHEDULE_MODES)[number];

export const COLLECTION_PRIORITIES = ["CRITICAL", "HIGH", "NORMAL", "LOW"] as const;
export type CollectionPriority = (typeof COLLECTION_PRIORITIES)[number];

export const ARTIFACT_KINDS = [
  "HTML",
  "PDF",
  "DOCX",
  "XLSX",
  "CSV",
  "JSON",
  "XML",
  "EMAIL",
  "IMAGE",
  "AUDIO",
  "VIDEO",
  "TEXT",
  "MARKDOWN",
  "OTHER",
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const STORAGE_PROVIDERS = ["LOCAL", "S3", "OBJECT_STORAGE", "REMOTE_REFERENCE"] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

export const HASH_ALGORITHMS = ["SHA-256"] as const;
export type HashAlgorithm = (typeof HASH_ALGORITHMS)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type Extensions = Record<`x-${string}`, JsonValue>;

export type Workspace = {
  schemaVersion: typeof SCHEMA_V1_VERSION;
  objectType: "WORKSPACE";
  id: string;
  slug: string;
  name: string;
  dataDomain: DataDomain;
  status: WorkspaceStatus;
  defaultLocale: string;
  timezone: string;
  syncPolicy: {
    mode: SyncMode;
    allowPublicPromotion: boolean;
  };
  retentionPolicy: {
    rawArtifactDays: number | null;
    derivedDocumentDays: number | null;
  };
  createdAt: string;
  updatedAt: string;
  extensions?: Extensions;
};

export type ConnectorManifest = {
  schemaVersion: typeof SCHEMA_V1_VERSION;
  objectType: "CONNECTOR_MANIFEST";
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
  status: ConnectorStatus;
  extensions?: Extensions;
};

export type ManualSchedule = { mode: "MANUAL" };
export type IntervalSchedule = { mode: "INTERVAL"; intervalSeconds: number };
export type CronSchedule = { mode: "CRON"; expression: string; timezone: string };
export type ChangeWatchSchedule = { mode: "CHANGE_WATCH"; pollIntervalSeconds: number };
export type CollectionSchedule =
  ManualSchedule | IntervalSchedule | CronSchedule | ChangeWatchSchedule;

export type CollectionPlan = {
  schemaVersion: typeof SCHEMA_V1_VERSION;
  objectType: "COLLECTION_PLAN";
  id: string;
  workspaceId: string;
  sourceId: string;
  name: string;
  status: CollectionPlanStatus;
  schedule: CollectionSchedule;
  priority: CollectionPriority;
  policy: {
    includePatterns: string[];
    excludePatterns: string[];
    maxDepth: number;
    maxItems: number;
    renderJavascript: boolean;
    fetchAttachments: boolean;
    respectRobots: boolean;
    rateLimitPerMinute: number;
    timeoutSeconds: number;
    retry: {
      maxAttempts: number;
      backoffSeconds: number;
    };
    locale?: string;
  };
  output: {
    artifactKinds: ArtifactKind[];
    conversionProfileId?: string;
  };
  createdAt: string;
  updatedAt: string;
  extensions?: Extensions;
};

export type SourceDefinition = {
  schemaVersion: typeof SCHEMA_V1_VERSION;
  objectType: "SOURCE_DEFINITION";
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  sourceType: SourceType;
  category: SourceCategory;
  authorityLevel: AuthorityLevel;
  status: SourceStatus;
  jurisdictions: string[];
  languages: string[];
  connector: {
    connectorId: string;
    version: string;
  };
  connectorConfig: Record<string, JsonValue>;
  secretRef?: string;
  canonicalUri?: string;
  entrypoints: Array<{ uri: string; label?: string }>;
  defaultCollectionPlanId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  extensions?: Extensions;
};

export type RawArtifact = {
  schemaVersion: typeof SCHEMA_V1_VERSION;
  objectType: "RAW_ARTIFACT";
  id: string;
  workspaceId: string;
  sourceId: string;
  collectionRunId?: string;
  logicalDocumentId?: string;
  version: number;
  supersedesArtifactId?: string;
  artifactKind: ArtifactKind;
  mimeType: string;
  originalName: string;
  canonicalUri?: string;
  storage: {
    provider: StorageProvider;
    uri: string;
  };
  binaryHash: {
    algorithm: HashAlgorithm;
    value: string;
  };
  contentHash?: {
    algorithm: HashAlgorithm;
    value: string;
  };
  sizeBytes: number;
  capturedAt: string;
  publishedAt?: string;
  collector: {
    connectorId: string;
    connectorVersion: string;
    workerId?: string;
    requestId?: string;
  };
  provenance: {
    sourceUri: string;
    parentArtifactIds?: string[];
  };
  status: ArtifactStatus;
  createdAt: string;
  extensions?: Extensions;
};

const ID_PATTERNS = {
  workspace: /^wsp_[0-9A-HJKMNP-TV-Z]{26}$/,
  source: /^src_[0-9A-HJKMNP-TV-Z]{26}$/,
  plan: /^pln_[0-9A-HJKMNP-TV-Z]{26}$/,
  artifact: /^art_[0-9A-HJKMNP-TV-Z]{26}$/,
  run: /^run_[0-9A-HJKMNP-TV-Z]{26}$/,
  document: /^doc_[0-9A-HJKMNP-TV-Z]{26}$/,
  secret: /^sec_[0-9A-HJKMNP-TV-Z]{26}$/,
  worker: /^wrk_[0-9A-HJKMNP-TV-Z]{26}$/,
  conversion: /^cnv_[0-9A-HJKMNP-TV-Z]{26}$/,
} as const;

const connectorIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const extensionKeyPattern = /^x-[a-z0-9][a-z0-9.-]*$/;
const localePattern = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const forbiddenSecretKeys = new Set([
  "password",
  "token",
  "apikey",
  "apisecret",
  "clientsecret",
  "privatekey",
  "accesskey",
  "secret",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function hasRequiredKeys(value: Record<string, unknown>, required: readonly string[]): boolean {
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isEnumValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isEnumArray<T extends readonly string[]>(values: T, value: unknown): value is T[number][] {
  return Array.isArray(value) && value.every((item) => isEnumValue(values, item));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isRfc3339(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isUri(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value);
}

function isExtensions(value: unknown): value is Extensions {
  return isRecord(value) && Object.keys(value).every((key) => extensionKeyPattern.test(key));
}

function optionalExtensions(value: unknown): boolean {
  return value === undefined || isExtensions(value);
}

function normalizedSecretKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s]/g, "");
}

export function hasForbiddenSecretValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenSecretValue);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) =>
      forbiddenSecretKeys.has(normalizedSecretKey(key)) || hasForbiddenSecretValue(child),
  );
}

function isJsonRecord(value: unknown): value is Record<string, JsonValue> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonRecord(value);
}

function isRetentionDays(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

export function isWorkspace(value: unknown): value is Workspace {
  if (!isRecord(value)) return false;
  const required = [
    "schemaVersion",
    "objectType",
    "id",
    "slug",
    "name",
    "dataDomain",
    "status",
    "defaultLocale",
    "timezone",
    "syncPolicy",
    "retentionPolicy",
    "createdAt",
    "updatedAt",
  ];
  if (!hasRequiredKeys(value, required) || !hasOnlyKeys(value, [...required, "extensions"]))
    return false;
  if (!isRecord(value.syncPolicy) || !isRecord(value.retentionPolicy)) return false;
  return (
    value.schemaVersion === SCHEMA_V1_VERSION &&
    value.objectType === "WORKSPACE" &&
    typeof value.id === "string" &&
    ID_PATTERNS.workspace.test(value.id) &&
    typeof value.slug === "string" &&
    slugPattern.test(value.slug) &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    isEnumValue(DATA_DOMAINS, value.dataDomain) &&
    isEnumValue(WORKSPACE_STATUSES, value.status) &&
    typeof value.defaultLocale === "string" &&
    localePattern.test(value.defaultLocale) &&
    typeof value.timezone === "string" &&
    value.timezone.length > 0 &&
    hasOnlyKeys(value.syncPolicy, ["mode", "allowPublicPromotion"]) &&
    isEnumValue(SYNC_MODES, value.syncPolicy.mode) &&
    typeof value.syncPolicy.allowPublicPromotion === "boolean" &&
    hasOnlyKeys(value.retentionPolicy, ["rawArtifactDays", "derivedDocumentDays"]) &&
    isRetentionDays(value.retentionPolicy.rawArtifactDays) &&
    isRetentionDays(value.retentionPolicy.derivedDocumentDays) &&
    isRfc3339(value.createdAt) &&
    isRfc3339(value.updatedAt) &&
    optionalExtensions(value.extensions)
  );
}

export function isConnectorManifest(value: unknown): value is ConnectorManifest {
  if (!isRecord(value)) return false;
  const required = [
    "schemaVersion",
    "objectType",
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
  ];
  if (!hasRequiredKeys(value, required) || !hasOnlyKeys(value, [...required, "extensions"]))
    return false;
  if (!isRecord(value.healthCheck)) return false;
  return (
    value.schemaVersion === SCHEMA_V1_VERSION &&
    value.objectType === "CONNECTOR_MANIFEST" &&
    typeof value.connectorId === "string" &&
    connectorIdPattern.test(value.connectorId) &&
    typeof value.displayName === "string" &&
    value.displayName.length > 0 &&
    typeof value.version === "string" &&
    semverPattern.test(value.version) &&
    isEnumArray(SOURCE_TYPES, value.sourceTypes) &&
    value.sourceTypes.length > 0 &&
    isEnumValue(CONNECTOR_RUNTIMES, value.runtime) &&
    isEnumArray(CONNECTOR_CAPABILITIES, value.capabilities) &&
    isEnumArray(JOB_TYPES, value.supportedJobTypes) &&
    isJsonRecord(value.configurationSchema) &&
    isJsonRecord(value.secretSchema) &&
    isEnumArray(ARTIFACT_KINDS, value.outputArtifactKinds) &&
    hasOnlyKeys(value.healthCheck, ["mode", "timeoutSeconds"]) &&
    isEnumValue(HEALTH_CHECK_MODES, value.healthCheck.mode) &&
    isPositiveInteger(value.healthCheck.timeoutSeconds) &&
    isEnumValue(CONNECTOR_STATUSES, value.status) &&
    optionalExtensions(value.extensions)
  );
}

function isCollectionSchedule(value: unknown): value is CollectionSchedule {
  if (!isRecord(value) || !isEnumValue(SCHEDULE_MODES, value.mode)) return false;
  switch (value.mode) {
    case "MANUAL":
      return hasOnlyKeys(value, ["mode"]);
    case "INTERVAL":
      return (
        hasOnlyKeys(value, ["mode", "intervalSeconds"]) && isPositiveInteger(value.intervalSeconds)
      );
    case "CRON":
      return (
        hasOnlyKeys(value, ["mode", "expression", "timezone"]) &&
        typeof value.expression === "string" &&
        value.expression.trim().split(/\s+/).length >= 5 &&
        typeof value.timezone === "string" &&
        value.timezone.length > 0
      );
    case "CHANGE_WATCH":
      return (
        hasOnlyKeys(value, ["mode", "pollIntervalSeconds"]) &&
        isPositiveInteger(value.pollIntervalSeconds)
      );
  }
}

export function isCollectionPlan(value: unknown): value is CollectionPlan {
  if (!isRecord(value)) return false;
  const required = [
    "schemaVersion",
    "objectType",
    "id",
    "workspaceId",
    "sourceId",
    "name",
    "status",
    "schedule",
    "priority",
    "policy",
    "output",
    "createdAt",
    "updatedAt",
  ];
  if (!hasRequiredKeys(value, required) || !hasOnlyKeys(value, [...required, "extensions"]))
    return false;
  if (!isRecord(value.policy) || !isRecord(value.output) || !isRecord(value.policy.retry))
    return false;
  const policyKeys = [
    "includePatterns",
    "excludePatterns",
    "maxDepth",
    "maxItems",
    "renderJavascript",
    "fetchAttachments",
    "respectRobots",
    "rateLimitPerMinute",
    "timeoutSeconds",
    "retry",
    "locale",
  ];
  return (
    value.schemaVersion === SCHEMA_V1_VERSION &&
    value.objectType === "COLLECTION_PLAN" &&
    typeof value.id === "string" &&
    ID_PATTERNS.plan.test(value.id) &&
    typeof value.workspaceId === "string" &&
    ID_PATTERNS.workspace.test(value.workspaceId) &&
    typeof value.sourceId === "string" &&
    ID_PATTERNS.source.test(value.sourceId) &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    isEnumValue(COLLECTION_PLAN_STATUSES, value.status) &&
    isCollectionSchedule(value.schedule) &&
    isEnumValue(COLLECTION_PRIORITIES, value.priority) &&
    hasOnlyKeys(value.policy, policyKeys) &&
    isStringArray(value.policy.includePatterns) &&
    isStringArray(value.policy.excludePatterns) &&
    isNonNegativeInteger(value.policy.maxDepth) &&
    isPositiveInteger(value.policy.maxItems) &&
    typeof value.policy.renderJavascript === "boolean" &&
    typeof value.policy.fetchAttachments === "boolean" &&
    typeof value.policy.respectRobots === "boolean" &&
    isPositiveInteger(value.policy.rateLimitPerMinute) &&
    isPositiveInteger(value.policy.timeoutSeconds) &&
    hasOnlyKeys(value.policy.retry, ["maxAttempts", "backoffSeconds"]) &&
    isPositiveInteger(value.policy.retry.maxAttempts) &&
    isNonNegativeInteger(value.policy.retry.backoffSeconds) &&
    (value.policy.locale === undefined ||
      (typeof value.policy.locale === "string" && localePattern.test(value.policy.locale))) &&
    hasOnlyKeys(value.output, ["artifactKinds", "conversionProfileId"]) &&
    isEnumArray(ARTIFACT_KINDS, value.output.artifactKinds) &&
    value.output.artifactKinds.length > 0 &&
    (value.output.conversionProfileId === undefined ||
      (typeof value.output.conversionProfileId === "string" &&
        ID_PATTERNS.conversion.test(value.output.conversionProfileId))) &&
    isRfc3339(value.createdAt) &&
    isRfc3339(value.updatedAt) &&
    optionalExtensions(value.extensions)
  );
}

export function isSourceDefinition(value: unknown): value is SourceDefinition {
  if (!isRecord(value)) return false;
  const required = [
    "schemaVersion",
    "objectType",
    "id",
    "workspaceId",
    "name",
    "slug",
    "sourceType",
    "category",
    "authorityLevel",
    "status",
    "jurisdictions",
    "languages",
    "connector",
    "connectorConfig",
    "entrypoints",
    "tags",
    "createdAt",
    "updatedAt",
  ];
  const optional = ["secretRef", "canonicalUri", "defaultCollectionPlanId", "extensions"];
  if (!hasRequiredKeys(value, required) || !hasOnlyKeys(value, [...required, ...optional]))
    return false;
  if (!isRecord(value.connector) || !isJsonRecord(value.connectorConfig)) return false;
  if (!Array.isArray(value.entrypoints)) return false;
  return (
    value.schemaVersion === SCHEMA_V1_VERSION &&
    value.objectType === "SOURCE_DEFINITION" &&
    typeof value.id === "string" &&
    ID_PATTERNS.source.test(value.id) &&
    typeof value.workspaceId === "string" &&
    ID_PATTERNS.workspace.test(value.workspaceId) &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    typeof value.slug === "string" &&
    slugPattern.test(value.slug) &&
    isEnumValue(SOURCE_TYPES, value.sourceType) &&
    isEnumValue(SOURCE_CATEGORIES, value.category) &&
    isEnumValue(AUTHORITY_LEVELS, value.authorityLevel) &&
    isEnumValue(SOURCE_STATUSES, value.status) &&
    isStringArray(value.jurisdictions) &&
    isStringArray(value.languages) &&
    value.languages.every((language) => localePattern.test(language)) &&
    hasOnlyKeys(value.connector, ["connectorId", "version"]) &&
    typeof value.connector.connectorId === "string" &&
    connectorIdPattern.test(value.connector.connectorId) &&
    typeof value.connector.version === "string" &&
    semverPattern.test(value.connector.version) &&
    !hasForbiddenSecretValue(value.connectorConfig) &&
    (value.secretRef === undefined ||
      (typeof value.secretRef === "string" && ID_PATTERNS.secret.test(value.secretRef))) &&
    (value.canonicalUri === undefined || isUri(value.canonicalUri)) &&
    value.entrypoints.length > 0 &&
    value.entrypoints.every(
      (entrypoint) =>
        isRecord(entrypoint) &&
        hasOnlyKeys(entrypoint, ["uri", "label"]) &&
        isUri(entrypoint.uri) &&
        (entrypoint.label === undefined || typeof entrypoint.label === "string"),
    ) &&
    (value.defaultCollectionPlanId === undefined ||
      (typeof value.defaultCollectionPlanId === "string" &&
        ID_PATTERNS.plan.test(value.defaultCollectionPlanId))) &&
    isStringArray(value.tags) &&
    isRfc3339(value.createdAt) &&
    isRfc3339(value.updatedAt) &&
    optionalExtensions(value.extensions)
  );
}

function isHash(value: unknown): value is { algorithm: HashAlgorithm; value: string } {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["algorithm", "value"]) &&
    isEnumValue(HASH_ALGORITHMS, value.algorithm) &&
    typeof value.value === "string" &&
    sha256Pattern.test(value.value)
  );
}

export function isRawArtifact(value: unknown): value is RawArtifact {
  if (!isRecord(value)) return false;
  const required = [
    "schemaVersion",
    "objectType",
    "id",
    "workspaceId",
    "sourceId",
    "version",
    "artifactKind",
    "mimeType",
    "originalName",
    "storage",
    "binaryHash",
    "sizeBytes",
    "capturedAt",
    "collector",
    "provenance",
    "status",
    "createdAt",
  ];
  const optional = [
    "collectionRunId",
    "logicalDocumentId",
    "supersedesArtifactId",
    "canonicalUri",
    "contentHash",
    "publishedAt",
    "extensions",
  ];
  if (!hasRequiredKeys(value, required) || !hasOnlyKeys(value, [...required, ...optional]))
    return false;
  if (!isRecord(value.storage) || !isRecord(value.collector) || !isRecord(value.provenance))
    return false;
  const versionRelationshipIsValid =
    (value.version === 1 && value.supersedesArtifactId === undefined) ||
    (isPositiveInteger(value.version) &&
      value.version > 1 &&
      typeof value.supersedesArtifactId === "string" &&
      ID_PATTERNS.artifact.test(value.supersedesArtifactId) &&
      value.supersedesArtifactId !== value.id);
  return (
    value.schemaVersion === SCHEMA_V1_VERSION &&
    value.objectType === "RAW_ARTIFACT" &&
    typeof value.id === "string" &&
    ID_PATTERNS.artifact.test(value.id) &&
    typeof value.workspaceId === "string" &&
    ID_PATTERNS.workspace.test(value.workspaceId) &&
    typeof value.sourceId === "string" &&
    ID_PATTERNS.source.test(value.sourceId) &&
    (value.collectionRunId === undefined ||
      (typeof value.collectionRunId === "string" && ID_PATTERNS.run.test(value.collectionRunId))) &&
    (value.logicalDocumentId === undefined ||
      (typeof value.logicalDocumentId === "string" &&
        ID_PATTERNS.document.test(value.logicalDocumentId))) &&
    versionRelationshipIsValid &&
    isEnumValue(ARTIFACT_KINDS, value.artifactKind) &&
    typeof value.mimeType === "string" &&
    /^[\w.+-]+\/[\w.+-]+$/.test(value.mimeType) &&
    typeof value.originalName === "string" &&
    value.originalName.length > 0 &&
    (value.canonicalUri === undefined || isUri(value.canonicalUri)) &&
    hasOnlyKeys(value.storage, ["provider", "uri"]) &&
    isEnumValue(STORAGE_PROVIDERS, value.storage.provider) &&
    isUri(value.storage.uri) &&
    isHash(value.binaryHash) &&
    (value.contentHash === undefined || isHash(value.contentHash)) &&
    isNonNegativeInteger(value.sizeBytes) &&
    isRfc3339(value.capturedAt) &&
    (value.publishedAt === undefined || isRfc3339(value.publishedAt)) &&
    hasOnlyKeys(value.collector, ["connectorId", "connectorVersion", "workerId", "requestId"]) &&
    typeof value.collector.connectorId === "string" &&
    connectorIdPattern.test(value.collector.connectorId) &&
    typeof value.collector.connectorVersion === "string" &&
    semverPattern.test(value.collector.connectorVersion) &&
    (value.collector.workerId === undefined ||
      (typeof value.collector.workerId === "string" &&
        ID_PATTERNS.worker.test(value.collector.workerId))) &&
    (value.collector.requestId === undefined || typeof value.collector.requestId === "string") &&
    hasOnlyKeys(value.provenance, ["sourceUri", "parentArtifactIds"]) &&
    isUri(value.provenance.sourceUri) &&
    (value.provenance.parentArtifactIds === undefined ||
      (isStringArray(value.provenance.parentArtifactIds) &&
        value.provenance.parentArtifactIds.every((id) => ID_PATTERNS.artifact.test(id)))) &&
    isEnumValue(ARTIFACT_STATUSES, value.status) &&
    isRfc3339(value.createdAt) &&
    optionalExtensions(value.extensions)
  );
}

export const SCHEMA_V1_GUARDS = {
  WORKSPACE: isWorkspace,
  CONNECTOR_MANIFEST: isConnectorManifest,
  COLLECTION_PLAN: isCollectionPlan,
  SOURCE_DEFINITION: isSourceDefinition,
  RAW_ARTIFACT: isRawArtifact,
} as const;

export type SchemaV1Contract =
  Workspace | ConnectorManifest | CollectionPlan | SourceDefinition | RawArtifact;

export function isSchemaV1Contract(value: unknown): value is SchemaV1Contract {
  if (!isRecord(value) || typeof value.objectType !== "string") return false;
  const guard = SCHEMA_V1_GUARDS[value.objectType as keyof typeof SCHEMA_V1_GUARDS];
  return guard ? guard(value) : false;
}
