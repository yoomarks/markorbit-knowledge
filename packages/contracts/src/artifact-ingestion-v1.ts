import { ARTIFACT_KINDS, type ArtifactKind } from "./schema-v1";

export const ARTIFACT_INGESTION_PROTOCOL_VERSION = "1.0" as const;

export const ARTIFACT_INGESTION_STATUSES = [
  "CREATED",
  "UPLOADING",
  "VERIFIED",
  "FINALIZED",
  "ABORTED",
  "QUARANTINED",
] as const;
export type ArtifactIngestionStatus = (typeof ARTIFACT_INGESTION_STATUSES)[number];

export const ARTIFACT_VERIFICATION_STATUSES = [
  "MATCHED",
  "SIZE_MISMATCH",
  "DIGEST_MISMATCH",
] as const;
export type ArtifactVerificationStatus = (typeof ARTIFACT_VERIFICATION_STATUSES)[number];

export const ARTIFACT_INGESTION_EVENT_TYPES = [
  "SESSION_CREATED",
  "UPLOAD_STARTED",
  "UPLOAD_VERIFIED",
  "UPLOAD_REJECTED",
  "FINALIZED",
  "ABORTED",
] as const;
export type ArtifactIngestionEventType = (typeof ARTIFACT_INGESTION_EVENT_TYPES)[number];

export type ArtifactUploadDescriptor = {
  artifactKind: ArtifactKind;
  mimeType: string;
  originalName: string;
  expectedSizeBytes: number;
  expectedSha256: string;
  sourceUri: string;
  canonicalUri?: string;
  publishedAt?: string;
  parentArtifactIds?: string[];
};

export type ArtifactIngestionSession = {
  protocolVersion: typeof ARTIFACT_INGESTION_PROTOCOL_VERSION;
  objectType: "ARTIFACT_INGESTION_SESSION";
  id: string;
  workspaceId: string;
  sourceId: string;
  runId: string;
  jobId: string;
  jobAttempt: number;
  executionAttemptId: string;
  leaseId: string;
  workerId: string;
  connector: { connectorId: string; version: string };
  descriptor: ArtifactUploadDescriptor;
  status: ArtifactIngestionStatus;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
};

export type ArtifactVerificationResult = {
  protocolVersion: typeof ARTIFACT_INGESTION_PROTOCOL_VERSION;
  objectType: "ARTIFACT_VERIFICATION_RESULT";
  sessionId: string;
  status: ArtifactVerificationStatus;
  observedSizeBytes: number;
  observedSha256: string;
  verifiedAt: string;
  failureCode?: string;
};

export type ArtifactIngestionReceipt = {
  protocolVersion: typeof ARTIFACT_INGESTION_PROTOCOL_VERSION;
  objectType: "ARTIFACT_INGESTION_RECEIPT";
  id: string;
  sessionId: string;
  artifactId: string;
  executionAttemptId: string;
  contentSha256: string;
  sizeBytes: number;
  artifactKind: ArtifactKind;
  finalizedAt: string;
};

export type ArtifactIngestionFailure = {
  code: string;
  message: string;
  occurredAt: string;
};

export type ArtifactIngestionEvent = {
  protocolVersion: typeof ARTIFACT_INGESTION_PROTOCOL_VERSION;
  objectType: "ARTIFACT_INGESTION_EVENT";
  id: string;
  sessionId: string;
  sequence: number;
  eventType: ArtifactIngestionEventType;
  recordedAt: string;
  failure?: ArtifactIngestionFailure;
};

const ID = "[0-9A-HJKMNP-TV-Z]{26}";
const SESSION_ID_PATTERN = new RegExp(`^ing_${ID}$`);
const RECEIPT_ID_PATTERN = new RegExp(`^air_${ID}$`);
const EVENT_ID_PATTERN = new RegExp(`^aev_${ID}$`);
const WORKSPACE_ID_PATTERN = new RegExp(`^wsp_${ID}$`);
const SOURCE_ID_PATTERN = new RegExp(`^src_${ID}$`);
const RUN_ID_PATTERN = new RegExp(`^run_${ID}$`);
const JOB_ID_PATTERN = new RegExp(`^job_${ID}$`);
const ATTEMPT_ID_PATTERN = new RegExp(`^exa_${ID}$`);
const LEASE_ID_PATTERN = new RegExp(`^lse_${ID}$`);
const WORKER_ID_PATTERN = new RegExp(`^wrk_${ID}$`);
const ARTIFACT_ID_PATTERN = new RegExp(`^art_${ID}$`);
const CONNECTOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const FAILURE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,99}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function hasRequiredKeys(value: Record<string, unknown>, required: readonly string[]): boolean {
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key));
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

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isEnum<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

export function isArtifactUploadDescriptor(value: unknown): value is ArtifactUploadDescriptor {
  if (!isRecord(value)) return false;
  const required = [
    "artifactKind",
    "mimeType",
    "originalName",
    "expectedSizeBytes",
    "expectedSha256",
    "sourceUri",
  ];
  const optional = ["canonicalUri", "publishedAt", "parentArtifactIds"];
  if (!hasRequiredKeys(value, required) || !hasOnlyKeys(value, [...required, ...optional])) {
    return false;
  }
  return (
    isEnum(ARTIFACT_KINDS, value.artifactKind) &&
    typeof value.mimeType === "string" &&
    /^[\w.+-]+\/[\w.+-]+$/.test(value.mimeType) &&
    typeof value.originalName === "string" &&
    value.originalName.length > 0 &&
    value.originalName.length <= 255 &&
    isNonNegativeInteger(value.expectedSizeBytes) &&
    typeof value.expectedSha256 === "string" &&
    SHA256_PATTERN.test(value.expectedSha256) &&
    isUri(value.sourceUri) &&
    (value.canonicalUri === undefined || isUri(value.canonicalUri)) &&
    (value.publishedAt === undefined || isRfc3339(value.publishedAt)) &&
    (value.parentArtifactIds === undefined ||
      (Array.isArray(value.parentArtifactIds) &&
        value.parentArtifactIds.every(
          (id) => typeof id === "string" && ARTIFACT_ID_PATTERN.test(id),
        ) &&
        new Set(value.parentArtifactIds).size === value.parentArtifactIds.length))
  );
}

export function isArtifactIngestionSession(value: unknown): value is ArtifactIngestionSession {
  if (!isRecord(value)) return false;
  const required = [
    "protocolVersion",
    "objectType",
    "id",
    "workspaceId",
    "sourceId",
    "runId",
    "jobId",
    "jobAttempt",
    "executionAttemptId",
    "leaseId",
    "workerId",
    "connector",
    "descriptor",
    "status",
    "idempotencyKey",
    "createdAt",
    "updatedAt",
  ];
  if (!hasRequiredKeys(value, required) || !hasOnlyKeys(value, [...required, "finalizedAt"])) {
    return false;
  }
  if (!isRecord(value.connector) || !hasOnlyKeys(value.connector, ["connectorId", "version"])) {
    return false;
  }
  return (
    value.protocolVersion === ARTIFACT_INGESTION_PROTOCOL_VERSION &&
    value.objectType === "ARTIFACT_INGESTION_SESSION" &&
    typeof value.id === "string" &&
    SESSION_ID_PATTERN.test(value.id) &&
    typeof value.workspaceId === "string" &&
    WORKSPACE_ID_PATTERN.test(value.workspaceId) &&
    typeof value.sourceId === "string" &&
    SOURCE_ID_PATTERN.test(value.sourceId) &&
    typeof value.runId === "string" &&
    RUN_ID_PATTERN.test(value.runId) &&
    typeof value.jobId === "string" &&
    JOB_ID_PATTERN.test(value.jobId) &&
    isPositiveInteger(value.jobAttempt) &&
    typeof value.executionAttemptId === "string" &&
    ATTEMPT_ID_PATTERN.test(value.executionAttemptId) &&
    typeof value.leaseId === "string" &&
    LEASE_ID_PATTERN.test(value.leaseId) &&
    typeof value.workerId === "string" &&
    WORKER_ID_PATTERN.test(value.workerId) &&
    typeof value.connector.connectorId === "string" &&
    CONNECTOR_ID_PATTERN.test(value.connector.connectorId) &&
    typeof value.connector.version === "string" &&
    SEMVER_PATTERN.test(value.connector.version) &&
    isArtifactUploadDescriptor(value.descriptor) &&
    isEnum(ARTIFACT_INGESTION_STATUSES, value.status) &&
    typeof value.idempotencyKey === "string" &&
    value.idempotencyKey.length > 0 &&
    value.idempotencyKey.length <= 128 &&
    isRfc3339(value.createdAt) &&
    isRfc3339(value.updatedAt) &&
    (value.finalizedAt === undefined || isRfc3339(value.finalizedAt)) &&
    ((value.status === "FINALIZED" && value.finalizedAt !== undefined) ||
      (value.status !== "FINALIZED" && value.finalizedAt === undefined))
  );
}

export function isArtifactVerificationResult(value: unknown): value is ArtifactVerificationResult {
  if (!isRecord(value)) return false;
  const required = [
    "protocolVersion",
    "objectType",
    "sessionId",
    "status",
    "observedSizeBytes",
    "observedSha256",
    "verifiedAt",
  ];
  if (!hasRequiredKeys(value, required) || !hasOnlyKeys(value, [...required, "failureCode"])) {
    return false;
  }
  return (
    value.protocolVersion === ARTIFACT_INGESTION_PROTOCOL_VERSION &&
    value.objectType === "ARTIFACT_VERIFICATION_RESULT" &&
    typeof value.sessionId === "string" &&
    SESSION_ID_PATTERN.test(value.sessionId) &&
    isEnum(ARTIFACT_VERIFICATION_STATUSES, value.status) &&
    isNonNegativeInteger(value.observedSizeBytes) &&
    typeof value.observedSha256 === "string" &&
    SHA256_PATTERN.test(value.observedSha256) &&
    isRfc3339(value.verifiedAt) &&
    (value.failureCode === undefined ||
      (typeof value.failureCode === "string" && FAILURE_CODE_PATTERN.test(value.failureCode))) &&
    ((value.status === "MATCHED" && value.failureCode === undefined) ||
      (value.status !== "MATCHED" && value.failureCode !== undefined))
  );
}

export function isArtifactIngestionReceipt(value: unknown): value is ArtifactIngestionReceipt {
  if (!isRecord(value)) return false;
  const required = [
    "protocolVersion",
    "objectType",
    "id",
    "sessionId",
    "artifactId",
    "executionAttemptId",
    "contentSha256",
    "sizeBytes",
    "artifactKind",
    "finalizedAt",
  ];
  if (!hasRequiredKeys(value, required) || !hasOnlyKeys(value, required)) return false;
  return (
    value.protocolVersion === ARTIFACT_INGESTION_PROTOCOL_VERSION &&
    value.objectType === "ARTIFACT_INGESTION_RECEIPT" &&
    typeof value.id === "string" &&
    RECEIPT_ID_PATTERN.test(value.id) &&
    typeof value.sessionId === "string" &&
    SESSION_ID_PATTERN.test(value.sessionId) &&
    typeof value.artifactId === "string" &&
    ARTIFACT_ID_PATTERN.test(value.artifactId) &&
    typeof value.executionAttemptId === "string" &&
    ATTEMPT_ID_PATTERN.test(value.executionAttemptId) &&
    typeof value.contentSha256 === "string" &&
    SHA256_PATTERN.test(value.contentSha256) &&
    isNonNegativeInteger(value.sizeBytes) &&
    isEnum(ARTIFACT_KINDS, value.artifactKind) &&
    isRfc3339(value.finalizedAt)
  );
}

export function isArtifactIngestionFailure(value: unknown): value is ArtifactIngestionFailure {
  return (
    isRecord(value) &&
    hasRequiredKeys(value, ["code", "message", "occurredAt"]) &&
    hasOnlyKeys(value, ["code", "message", "occurredAt"]) &&
    typeof value.code === "string" &&
    FAILURE_CODE_PATTERN.test(value.code) &&
    typeof value.message === "string" &&
    value.message.length > 0 &&
    value.message.length <= 1000 &&
    isRfc3339(value.occurredAt)
  );
}

export function isArtifactIngestionEvent(value: unknown): value is ArtifactIngestionEvent {
  if (!isRecord(value)) return false;
  const required = [
    "protocolVersion",
    "objectType",
    "id",
    "sessionId",
    "sequence",
    "eventType",
    "recordedAt",
  ];
  if (!hasRequiredKeys(value, required) || !hasOnlyKeys(value, [...required, "failure"])) {
    return false;
  }
  return (
    value.protocolVersion === ARTIFACT_INGESTION_PROTOCOL_VERSION &&
    value.objectType === "ARTIFACT_INGESTION_EVENT" &&
    typeof value.id === "string" &&
    EVENT_ID_PATTERN.test(value.id) &&
    typeof value.sessionId === "string" &&
    SESSION_ID_PATTERN.test(value.sessionId) &&
    isPositiveInteger(value.sequence) &&
    isEnum(ARTIFACT_INGESTION_EVENT_TYPES, value.eventType) &&
    isRfc3339(value.recordedAt) &&
    (value.failure === undefined || isArtifactIngestionFailure(value.failure)) &&
    ((value.eventType === "UPLOAD_REJECTED" && value.failure !== undefined) ||
      (value.eventType !== "UPLOAD_REJECTED" && value.failure === undefined))
  );
}

export function assertArtifactUploadDescriptor(
  value: unknown,
): asserts value is ArtifactUploadDescriptor {
  if (!isArtifactUploadDescriptor(value)) throw new TypeError("Invalid ArtifactUploadDescriptor");
}

export function assertArtifactIngestionSession(
  value: unknown,
): asserts value is ArtifactIngestionSession {
  if (!isArtifactIngestionSession(value)) throw new TypeError("Invalid ArtifactIngestionSession");
}

export function assertArtifactVerificationResult(
  value: unknown,
): asserts value is ArtifactVerificationResult {
  if (!isArtifactVerificationResult(value))
    throw new TypeError("Invalid ArtifactVerificationResult");
}

export function assertArtifactIngestionReceipt(
  value: unknown,
): asserts value is ArtifactIngestionReceipt {
  if (!isArtifactIngestionReceipt(value)) throw new TypeError("Invalid ArtifactIngestionReceipt");
}
