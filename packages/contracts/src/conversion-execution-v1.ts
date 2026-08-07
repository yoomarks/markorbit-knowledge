import { ARTIFACT_KINDS, type ArtifactKind, type Extensions } from "./schema-v1";
import {
  CONVERSION_OUTPUT_FORMATS,
  converterAccepts,
  isConversionProfile,
  isConverterManifest,
  mimePatternMatches,
  type ConversionOutputFormat,
  type ConversionProfile,
  type ConverterManifest,
} from "./conversion-control-v1";

export const CONVERSION_EXECUTION_VERSION = "1.0" as const;

export const CONVERSION_RUN_STATUSES = [
  "PENDING",
  "RUNNING",
  "VERIFYING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type ConversionRunStatus = (typeof CONVERSION_RUN_STATUSES)[number];

export const CONVERSION_TRIGGERS = ["MANUAL", "AUTO_PROFILE"] as const;
export type ConversionTrigger = (typeof CONVERSION_TRIGGERS)[number];

export const CONVERSION_ACTOR_TYPES = ["ADMIN", "SYSTEM", "WORKER"] as const;
export type ConversionActorType = (typeof CONVERSION_ACTOR_TYPES)[number];

export const CONVERSION_EVENT_TYPES = [
  "CREATED",
  "STARTED",
  "PROGRESS_REPORTED",
  "VERIFICATION_STARTED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type ConversionEventType = (typeof CONVERSION_EVENT_TYPES)[number];

export const CONVERSION_FAILURE_KINDS = [
  "INPUT_UNAVAILABLE",
  "CONVERTER_ERROR",
  "OUTPUT_INVALID",
  "VERIFICATION_FAILED",
  "POLICY_REJECTED",
  "TIMEOUT",
  "WORKER_ERROR",
  "UNKNOWN",
] as const;
export type ConversionFailureKind = (typeof CONVERSION_FAILURE_KINDS)[number];

export const CONVERSION_STAGING_DOCUMENT_STATUSES = [
  "GENERATED",
  "READY",
  "BLOCKED",
  "ARCHIVED",
] as const;
export type ConversionStagingDocumentStatus = (typeof CONVERSION_STAGING_DOCUMENT_STATUSES)[number];

export const STAGING_VALIDATION_OUTCOMES = ["PASS", "PASS_WITH_WARNINGS", "FAIL"] as const;
export type StagingValidationOutcome = (typeof STAGING_VALIDATION_OUTCOMES)[number];

export const STAGING_CHECK_STATUSES = ["PASS", "WARN", "FAIL"] as const;
export type StagingCheckStatus = (typeof STAGING_CHECK_STATUSES)[number];

export const FRONTMATTER_VALUE_TYPES = [
  "STRING",
  "NUMBER",
  "BOOLEAN",
  "DATE",
  "STRING_LIST",
  "NULL",
] as const;
export type FrontmatterValueType = (typeof FRONTMATTER_VALUE_TYPES)[number];

export type ConversionActor = {
  type: ConversionActorType;
  id: string;
};

export type ConversionInputEvidence = {
  artifactId: string;
  artifactKind: ArtifactKind;
  mimeType: string;
  sha256: string;
  sizeBytes: number;
};

export type ConversionFailure = {
  kind: ConversionFailureKind;
  code: string;
  message: string;
  retryable: boolean;
  details?: Extensions;
};

export type StagingValidationCheck = {
  code: string;
  status: StagingCheckStatus;
  message?: string;
};

export type StagingDocumentDescriptor = {
  contractVersion: typeof CONVERSION_EXECUTION_VERSION;
  objectType: "STAGING_DOCUMENT_DESCRIPTOR";
  id: string;
  workspaceId: string;
  sourceId: string;
  rawArtifactId: string;
  conversionRunId: string;
  title: string;
  targetPath: string;
  outputFormat: ConversionOutputFormat;
  contentHash: {
    algorithm: "SHA-256";
    value: string;
  };
  sizeBytes: number;
  contentAddressedRef: string;
  frontmatterSummary: {
    fieldCount: number;
    fields: Array<{
      key: string;
      valueType: FrontmatterValueType;
    }>;
  };
  converter: {
    converterId: string;
    version: string;
  };
  generatedAt: string;
  validation: {
    outcome: StagingValidationOutcome;
    checks: StagingValidationCheck[];
    warnings: string[];
  };
  status: ConversionStagingDocumentStatus;
};

export type ConversionRun = {
  contractVersion: typeof CONVERSION_EXECUTION_VERSION;
  objectType: "CONVERSION_RUN";
  id: string;
  workspaceId: string;
  sourceId: string;
  rawArtifactId: string;
  conversionProfileId: string;
  conversionProfileSnapshot: ConversionProfile;
  converter: {
    converterId: string;
    version: string;
  };
  converterManifestSnapshot: ConverterManifest;
  input: ConversionInputEvidence;
  trigger: ConversionTrigger;
  actor: ConversionActor;
  idempotencyKey: string;
  requestedOutput: {
    format: ConversionOutputFormat;
    targetPathTemplate: string;
  };
  status: ConversionRunStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  verifyingAt?: string;
  completedAt?: string;
  failedAt?: string;
  cancelledAt?: string;
  failure?: ConversionFailure;
  stagingDocument?: StagingDocumentDescriptor;
};

export type ConversionExecutionEvent = {
  contractVersion: typeof CONVERSION_EXECUTION_VERSION;
  objectType: "CONVERSION_EXECUTION_EVENT";
  id: string;
  runId: string;
  sequence: number;
  eventType: ConversionEventType;
  previousStatus: ConversionRunStatus | null;
  resultingStatus: ConversionRunStatus;
  occurredAt: string;
  actor: ConversionActor;
  message?: string;
  progress?: {
    percent: number;
  };
  verification?: {
    checkCount: number;
    warningCount: number;
  };
  completion?: {
    stagingDocumentId: string;
    contentHash: string;
    sizeBytes: number;
  };
  failure?: ConversionFailure;
};

const IDS = {
  conversionRun: /^cvr_[0-9A-HJKMNP-TV-Z]{26}$/,
  conversionEvent: /^cve_[0-9A-HJKMNP-TV-Z]{26}$/,
  stagingDocument: /^std_[0-9A-HJKMNP-TV-Z]{26}$/,
  workspace: /^wsp_[0-9A-HJKMNP-TV-Z]{26}$/,
  source: /^src_[0-9A-HJKMNP-TV-Z]{26}$/,
  artifact: /^art_[0-9A-HJKMNP-TV-Z]{26}$/,
  conversionProfile: /^cvp_[0-9A-HJKMNP-TV-Z]{26}$/,
  worker: /^wrk_[0-9A-HJKMNP-TV-Z]{26}$/,
} as const;
const CONVERTER_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MIME_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const ACTOR_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const CHECK_CODE = /^[A-Z0-9][A-Z0-9_]{1,99}$/;
const FORBIDDEN_KEYS = new Set([
  "password",
  "passwd",
  "token",
  "apikey",
  "apisecret",
  "clientsecret",
  "privatekey",
  "accesskey",
  "secret",
  "command",
  "cmd",
  "shell",
  "script",
  "executable",
  "argv",
  "args",
  "markdown",
  "yaml",
  "body",
  "content",
  "binary",
]);

const ALLOWED_TRANSITIONS: Readonly<Record<ConversionRunStatus, readonly ConversionRunStatus[]>> = {
  PENDING: ["RUNNING", "CANCELLED"],
  RUNNING: ["RUNNING", "VERIFYING", "FAILED"],
  VERIFYING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function only(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function required(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function enumValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function rfc3339(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[-_\s]/g, "");
}

export function forbiddenConversionExecutionField(value: unknown, path = "root"): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = forbiddenConversionExecutionField(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!record(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    const secretFamily = ["token", "password", "secret", "apikey", "privatekey", "accesskey"].some(
      (term) => normalized.includes(term),
    );
    if (FORBIDDEN_KEYS.has(normalized) || secretFamily) return `${path}.${key}`;
    const found = forbiddenConversionExecutionField(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function extensions(value: unknown): value is Extensions {
  return (
    record(value) &&
    Object.keys(value).every((key) => /^x-[a-z0-9][a-z0-9.-]*$/.test(key)) &&
    forbiddenConversionExecutionField(value) === null
  );
}

function actor(value: unknown): value is ConversionActor {
  if (!record(value) || !required(value, ["type", "id"]) || !only(value, ["type", "id"])) {
    return false;
  }
  return (
    enumValue(CONVERSION_ACTOR_TYPES, value.type) &&
    typeof value.id === "string" &&
    ACTOR_ID.test(value.id) &&
    (value.type !== "WORKER" || IDS.worker.test(value.id))
  );
}

function converterReference(value: unknown): value is { converterId: string; version: string } {
  return (
    record(value) &&
    required(value, ["converterId", "version"]) &&
    only(value, ["converterId", "version"]) &&
    typeof value.converterId === "string" &&
    CONVERTER_ID.test(value.converterId) &&
    typeof value.version === "string" &&
    SEMVER.test(value.version)
  );
}

function inputEvidence(value: unknown): value is ConversionInputEvidence {
  return (
    record(value) &&
    required(value, ["artifactId", "artifactKind", "mimeType", "sha256", "sizeBytes"]) &&
    only(value, ["artifactId", "artifactKind", "mimeType", "sha256", "sizeBytes"]) &&
    typeof value.artifactId === "string" &&
    IDS.artifact.test(value.artifactId) &&
    enumValue(ARTIFACT_KINDS, value.artifactKind) &&
    typeof value.mimeType === "string" &&
    MIME_TYPE.test(value.mimeType) &&
    typeof value.sha256 === "string" &&
    SHA256.test(value.sha256) &&
    positiveInteger(value.sizeBytes)
  );
}

function failure(value: unknown): value is ConversionFailure {
  return (
    record(value) &&
    required(value, ["kind", "code", "message", "retryable"]) &&
    only(value, ["kind", "code", "message", "retryable", "details"]) &&
    enumValue(CONVERSION_FAILURE_KINDS, value.kind) &&
    typeof value.code === "string" &&
    CHECK_CODE.test(value.code) &&
    typeof value.message === "string" &&
    value.message.trim().length > 0 &&
    value.message.length <= 1000 &&
    typeof value.retryable === "boolean" &&
    (value.details === undefined || extensions(value.details))
  );
}

function normalizedTargetPath(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 500 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes(":") ||
    !value.endsWith(".md")
  ) {
    return false;
  }
  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function frontmatterSummary(value: unknown): boolean {
  if (
    !record(value) ||
    !required(value, ["fieldCount", "fields"]) ||
    !only(value, ["fieldCount", "fields"]) ||
    !nonNegativeInteger(value.fieldCount) ||
    !Array.isArray(value.fields) ||
    value.fields.length !== value.fieldCount
  ) {
    return false;
  }
  const keys: string[] = [];
  for (const field of value.fields) {
    if (
      !record(field) ||
      !required(field, ["key", "valueType"]) ||
      !only(field, ["key", "valueType"]) ||
      typeof field.key !== "string" ||
      !/^[a-z][a-z0-9_-]{0,63}$/.test(field.key) ||
      !enumValue(FRONTMATTER_VALUE_TYPES, field.valueType)
    ) {
      return false;
    }
    keys.push(field.key);
  }
  return new Set(keys).size === keys.length;
}

function validationCheck(value: unknown): value is StagingValidationCheck {
  return (
    record(value) &&
    required(value, ["code", "status"]) &&
    only(value, ["code", "status", "message"]) &&
    typeof value.code === "string" &&
    CHECK_CODE.test(value.code) &&
    enumValue(STAGING_CHECK_STATUSES, value.status) &&
    (value.message === undefined ||
      (typeof value.message === "string" &&
        value.message.length > 0 &&
        value.message.length <= 500))
  );
}

function stagingValidation(value: unknown): boolean {
  if (
    !record(value) ||
    !required(value, ["outcome", "checks", "warnings"]) ||
    !only(value, ["outcome", "checks", "warnings"]) ||
    !enumValue(STAGING_VALIDATION_OUTCOMES, value.outcome) ||
    !Array.isArray(value.checks) ||
    !value.checks.every(validationCheck) ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every(
      (warning) => typeof warning === "string" && warning.length > 0 && warning.length <= 500,
    )
  ) {
    return false;
  }
  const statuses = value.checks.map((check) => check.status);
  if (value.outcome === "PASS")
    return !statuses.includes("WARN") && !statuses.includes("FAIL") && value.warnings.length === 0;
  if (value.outcome === "PASS_WITH_WARNINGS") {
    return !statuses.includes("FAIL") && (statuses.includes("WARN") || value.warnings.length > 0);
  }
  return statuses.includes("FAIL");
}

export function isStagingDocumentDescriptor(value: unknown): value is StagingDocumentDescriptor {
  if (!record(value) || forbiddenConversionExecutionField(value) !== null) return false;
  const keys = [
    "contractVersion",
    "objectType",
    "id",
    "workspaceId",
    "sourceId",
    "rawArtifactId",
    "conversionRunId",
    "title",
    "targetPath",
    "outputFormat",
    "contentHash",
    "sizeBytes",
    "contentAddressedRef",
    "frontmatterSummary",
    "converter",
    "generatedAt",
    "validation",
    "status",
  ];
  if (
    !required(value, keys) ||
    !only(value, keys) ||
    !record(value.contentHash) ||
    !required(value.contentHash, ["algorithm", "value"]) ||
    !only(value.contentHash, ["algorithm", "value"])
  ) {
    return false;
  }
  const validationIsValid = stagingValidation(value.validation);
  const validationOutcome = record(value.validation) ? value.validation.outcome : undefined;
  const statusIsValid =
    (value.status === "READY" &&
      (validationOutcome === "PASS" || validationOutcome === "PASS_WITH_WARNINGS")) ||
    (value.status === "BLOCKED" && validationOutcome === "FAIL") ||
    value.status === "GENERATED" ||
    value.status === "ARCHIVED";
  return (
    value.contractVersion === CONVERSION_EXECUTION_VERSION &&
    value.objectType === "STAGING_DOCUMENT_DESCRIPTOR" &&
    typeof value.id === "string" &&
    IDS.stagingDocument.test(value.id) &&
    typeof value.workspaceId === "string" &&
    IDS.workspace.test(value.workspaceId) &&
    typeof value.sourceId === "string" &&
    IDS.source.test(value.sourceId) &&
    typeof value.rawArtifactId === "string" &&
    IDS.artifact.test(value.rawArtifactId) &&
    typeof value.conversionRunId === "string" &&
    IDS.conversionRun.test(value.conversionRunId) &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    value.title.length <= 200 &&
    normalizedTargetPath(value.targetPath) &&
    enumValue(CONVERSION_OUTPUT_FORMATS, value.outputFormat) &&
    value.contentHash.algorithm === "SHA-256" &&
    typeof value.contentHash.value === "string" &&
    SHA256.test(value.contentHash.value) &&
    positiveInteger(value.sizeBytes) &&
    typeof value.contentAddressedRef === "string" &&
    value.contentAddressedRef === `cas:sha256:${value.contentHash.value}` &&
    frontmatterSummary(value.frontmatterSummary) &&
    converterReference(value.converter) &&
    rfc3339(value.generatedAt) &&
    validationIsValid &&
    enumValue(CONVERSION_STAGING_DOCUMENT_STATUSES, value.status) &&
    statusIsValid
  );
}

function requestedOutput(value: unknown): value is {
  format: ConversionOutputFormat;
  targetPathTemplate: string;
} {
  return (
    record(value) &&
    required(value, ["format", "targetPathTemplate"]) &&
    only(value, ["format", "targetPathTemplate"]) &&
    enumValue(CONVERSION_OUTPUT_FORMATS, value.format) &&
    typeof value.targetPathTemplate === "string" &&
    value.targetPathTemplate.length > 0 &&
    value.targetPathTemplate.length <= 300 &&
    !value.targetPathTemplate.startsWith("/") &&
    !value.targetPathTemplate.includes("\\") &&
    !value.targetPathTemplate.includes("..")
  );
}

function profileAccepts(profile: ConversionProfile, input: ConversionInputEvidence): boolean {
  return (
    profile.input.artifactKinds.includes(input.artifactKind) &&
    profile.input.mimePatterns.some((pattern) => mimePatternMatches(pattern, input.mimeType))
  );
}

function timestampsOrdered(value: Record<string, unknown>): boolean {
  const ordered = [
    value.createdAt,
    value.startedAt,
    value.verifyingAt,
    value.completedAt ?? value.failedAt ?? value.cancelledAt,
    value.updatedAt,
  ].filter((item): item is string => typeof item === "string");
  return ordered.every(
    (timestamp, index) => index === 0 || Date.parse(timestamp) >= Date.parse(ordered[index - 1]),
  );
}

function runLifecycle(value: Record<string, unknown>): boolean {
  const noTerminal =
    value.completedAt === undefined &&
    value.failedAt === undefined &&
    value.cancelledAt === undefined &&
    value.failure === undefined &&
    value.stagingDocument === undefined;
  if (value.status === "PENDING") {
    return value.startedAt === undefined && value.verifyingAt === undefined && noTerminal;
  }
  if (value.status === "RUNNING") {
    return rfc3339(value.startedAt) && value.verifyingAt === undefined && noTerminal;
  }
  if (value.status === "VERIFYING") {
    return rfc3339(value.startedAt) && rfc3339(value.verifyingAt) && noTerminal;
  }
  if (value.status === "COMPLETED") {
    return (
      rfc3339(value.startedAt) &&
      rfc3339(value.verifyingAt) &&
      rfc3339(value.completedAt) &&
      value.failedAt === undefined &&
      value.cancelledAt === undefined &&
      value.failure === undefined &&
      isStagingDocumentDescriptor(value.stagingDocument) &&
      value.stagingDocument.status === "READY"
    );
  }
  if (value.status === "FAILED") {
    return (
      rfc3339(value.startedAt) &&
      rfc3339(value.failedAt) &&
      value.completedAt === undefined &&
      value.cancelledAt === undefined &&
      value.stagingDocument === undefined &&
      failure(value.failure)
    );
  }
  if (value.status === "CANCELLED") {
    return (
      value.startedAt === undefined &&
      value.verifyingAt === undefined &&
      value.completedAt === undefined &&
      value.failedAt === undefined &&
      value.failure === undefined &&
      value.stagingDocument === undefined &&
      rfc3339(value.cancelledAt)
    );
  }
  return false;
}

export function isConversionRun(value: unknown): value is ConversionRun {
  if (!record(value) || forbiddenConversionExecutionField(value) !== null) return false;
  const requiredKeys = [
    "contractVersion",
    "objectType",
    "id",
    "workspaceId",
    "sourceId",
    "rawArtifactId",
    "conversionProfileId",
    "conversionProfileSnapshot",
    "converter",
    "converterManifestSnapshot",
    "input",
    "trigger",
    "actor",
    "idempotencyKey",
    "requestedOutput",
    "status",
    "createdAt",
    "updatedAt",
  ];
  const optionalKeys = [
    "startedAt",
    "verifyingAt",
    "completedAt",
    "failedAt",
    "cancelledAt",
    "failure",
    "stagingDocument",
  ];
  if (!required(value, requiredKeys) || !only(value, [...requiredKeys, ...optionalKeys]))
    return false;
  if (
    !isConversionProfile(value.conversionProfileSnapshot) ||
    !isConverterManifest(value.converterManifestSnapshot) ||
    !converterReference(value.converter) ||
    !inputEvidence(value.input) ||
    !actor(value.actor) ||
    !requestedOutput(value.requestedOutput)
  ) {
    return false;
  }
  const profile = value.conversionProfileSnapshot;
  const manifest = value.converterManifestSnapshot;
  const input = value.input;
  const output = value.requestedOutput;
  const staging = value.stagingDocument;
  return (
    value.contractVersion === CONVERSION_EXECUTION_VERSION &&
    value.objectType === "CONVERSION_RUN" &&
    typeof value.id === "string" &&
    IDS.conversionRun.test(value.id) &&
    typeof value.workspaceId === "string" &&
    IDS.workspace.test(value.workspaceId) &&
    typeof value.sourceId === "string" &&
    IDS.source.test(value.sourceId) &&
    typeof value.rawArtifactId === "string" &&
    IDS.artifact.test(value.rawArtifactId) &&
    typeof value.conversionProfileId === "string" &&
    IDS.conversionProfile.test(value.conversionProfileId) &&
    value.conversionProfileId === profile.id &&
    value.workspaceId === profile.workspaceId &&
    (profile.sourceId === undefined || value.sourceId === profile.sourceId) &&
    profile.status === "ACTIVE" &&
    value.converter.converterId === profile.converter.converterId &&
    value.converter.version === profile.converter.version &&
    value.converter.converterId === manifest.converterId &&
    value.converter.version === manifest.version &&
    manifest.status === "ACTIVE" &&
    value.rawArtifactId === input.artifactId &&
    profileAccepts(profile, input) &&
    converterAccepts(manifest, input.artifactKind, input.mimeType) &&
    output.format === profile.outputFormat &&
    output.format === manifest.outputFormat &&
    output.targetPathTemplate === profile.targetPathTemplate &&
    enumValue(CONVERSION_TRIGGERS, value.trigger) &&
    typeof value.idempotencyKey === "string" &&
    IDEMPOTENCY_KEY.test(value.idempotencyKey) &&
    enumValue(CONVERSION_RUN_STATUSES, value.status) &&
    rfc3339(value.createdAt) &&
    rfc3339(value.updatedAt) &&
    timestampsOrdered(value) &&
    runLifecycle(value) &&
    (staging === undefined ||
      (isStagingDocumentDescriptor(staging) &&
        staging.conversionRunId === value.id &&
        staging.workspaceId === value.workspaceId &&
        staging.sourceId === value.sourceId &&
        staging.rawArtifactId === value.rawArtifactId &&
        staging.converter.converterId === value.converter.converterId &&
        staging.converter.version === value.converter.version))
  );
}

export function canTransitionConversionRun(
  from: ConversionRunStatus | null,
  to: ConversionRunStatus,
): boolean {
  if (from === null) return to === "PENDING";
  return ALLOWED_TRANSITIONS[from].includes(to);
}

function eventTransition(value: Record<string, unknown>): boolean {
  if (value.eventType === "CREATED") {
    return value.previousStatus === null && value.resultingStatus === "PENDING";
  }
  if (value.eventType === "STARTED") {
    return value.previousStatus === "PENDING" && value.resultingStatus === "RUNNING";
  }
  if (value.eventType === "PROGRESS_REPORTED") {
    return value.previousStatus === "RUNNING" && value.resultingStatus === "RUNNING";
  }
  if (value.eventType === "VERIFICATION_STARTED") {
    return value.previousStatus === "RUNNING" && value.resultingStatus === "VERIFYING";
  }
  if (value.eventType === "COMPLETED") {
    return value.previousStatus === "VERIFYING" && value.resultingStatus === "COMPLETED";
  }
  if (value.eventType === "FAILED") {
    return (
      (value.previousStatus === "RUNNING" || value.previousStatus === "VERIFYING") &&
      value.resultingStatus === "FAILED"
    );
  }
  if (value.eventType === "CANCELLED") {
    return value.previousStatus === "PENDING" && value.resultingStatus === "CANCELLED";
  }
  return false;
}

function eventPayload(value: Record<string, unknown>): boolean {
  const empty =
    value.progress === undefined &&
    value.verification === undefined &&
    value.completion === undefined &&
    value.failure === undefined;
  if (
    value.eventType === "CREATED" ||
    value.eventType === "STARTED" ||
    value.eventType === "CANCELLED"
  ) {
    return empty;
  }
  if (value.eventType === "PROGRESS_REPORTED") {
    return (
      record(value.progress) &&
      required(value.progress, ["percent"]) &&
      only(value.progress, ["percent"]) &&
      typeof value.progress.percent === "number" &&
      Number.isFinite(value.progress.percent) &&
      value.progress.percent >= 0 &&
      value.progress.percent <= 100 &&
      value.verification === undefined &&
      value.completion === undefined &&
      value.failure === undefined
    );
  }
  if (value.eventType === "VERIFICATION_STARTED") {
    return (
      record(value.verification) &&
      required(value.verification, ["checkCount", "warningCount"]) &&
      only(value.verification, ["checkCount", "warningCount"]) &&
      nonNegativeInteger(value.verification.checkCount) &&
      nonNegativeInteger(value.verification.warningCount) &&
      value.progress === undefined &&
      value.completion === undefined &&
      value.failure === undefined
    );
  }
  if (value.eventType === "COMPLETED") {
    return (
      record(value.completion) &&
      required(value.completion, ["stagingDocumentId", "contentHash", "sizeBytes"]) &&
      only(value.completion, ["stagingDocumentId", "contentHash", "sizeBytes"]) &&
      typeof value.completion.stagingDocumentId === "string" &&
      IDS.stagingDocument.test(value.completion.stagingDocumentId) &&
      typeof value.completion.contentHash === "string" &&
      SHA256.test(value.completion.contentHash) &&
      positiveInteger(value.completion.sizeBytes) &&
      value.progress === undefined &&
      value.verification === undefined &&
      value.failure === undefined
    );
  }
  if (value.eventType === "FAILED") {
    return (
      failure(value.failure) &&
      value.progress === undefined &&
      value.verification === undefined &&
      value.completion === undefined
    );
  }
  return false;
}

export function isConversionExecutionEvent(value: unknown): value is ConversionExecutionEvent {
  if (!record(value) || forbiddenConversionExecutionField(value) !== null) return false;
  const requiredKeys = [
    "contractVersion",
    "objectType",
    "id",
    "runId",
    "sequence",
    "eventType",
    "previousStatus",
    "resultingStatus",
    "occurredAt",
    "actor",
  ];
  const optionalKeys = ["message", "progress", "verification", "completion", "failure"];
  if (!required(value, requiredKeys) || !only(value, [...requiredKeys, ...optionalKeys]))
    return false;
  const previousStatusValid =
    value.previousStatus === null || enumValue(CONVERSION_RUN_STATUSES, value.previousStatus);
  return (
    value.contractVersion === CONVERSION_EXECUTION_VERSION &&
    value.objectType === "CONVERSION_EXECUTION_EVENT" &&
    typeof value.id === "string" &&
    IDS.conversionEvent.test(value.id) &&
    typeof value.runId === "string" &&
    IDS.conversionRun.test(value.runId) &&
    positiveInteger(value.sequence) &&
    enumValue(CONVERSION_EVENT_TYPES, value.eventType) &&
    previousStatusValid &&
    enumValue(CONVERSION_RUN_STATUSES, value.resultingStatus) &&
    canTransitionConversionRun(
      value.previousStatus as ConversionRunStatus | null,
      value.resultingStatus as ConversionRunStatus,
    ) &&
    eventTransition(value) &&
    rfc3339(value.occurredAt) &&
    actor(value.actor) &&
    (value.message === undefined ||
      (typeof value.message === "string" &&
        value.message.length > 0 &&
        value.message.length <= 500)) &&
    eventPayload(value)
  );
}

export function assertStagingDocumentDescriptor(
  value: unknown,
): asserts value is StagingDocumentDescriptor {
  if (!isStagingDocumentDescriptor(value)) {
    throw new TypeError(
      "StagingDocumentDescriptor does not satisfy Conversion Execution Protocol v1",
    );
  }
}

export function assertConversionRun(value: unknown): asserts value is ConversionRun {
  if (!isConversionRun(value)) {
    throw new TypeError("ConversionRun does not satisfy Conversion Execution Protocol v1");
  }
}

export function assertConversionExecutionEvent(
  value: unknown,
): asserts value is ConversionExecutionEvent {
  if (!isConversionExecutionEvent(value)) {
    throw new TypeError(
      "ConversionExecutionEvent does not satisfy Conversion Execution Protocol v1",
    );
  }
}
