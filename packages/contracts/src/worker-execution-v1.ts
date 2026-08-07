import { type ArtifactKind } from "./schema-v1";

export const WORKER_EXECUTION_PROTOCOL_VERSION = "1.0" as const;

export const EXECUTION_ATTEMPT_STATUSES = [
  "RUNNING",
  "UPLOADING",
  "VERIFYING",
  "COMPLETED",
  "FAILED",
] as const;
export type ExecutionAttemptStatus = (typeof EXECUTION_ATTEMPT_STATUSES)[number];

export const EXECUTION_EVENT_TYPES = [
  "STARTED",
  "UPLOADING",
  "VERIFYING",
  "COMPLETED",
  "FAILED",
  "ABANDONED",
] as const;
export type ExecutionEventType = (typeof EXECUTION_EVENT_TYPES)[number];

export const EXECUTOR_MODES = ["FIXTURE", "PRODUCTION"] as const;
export type ExecutorMode = (typeof EXECUTOR_MODES)[number];

export type ExecutionExecutor = {
  executorId: string;
  version: string;
  mode: ExecutorMode;
};

export type MetadataOnlyExecutionReceipt = {
  executor: ExecutionExecutor;
  outputKinds: ArtifactKind[];
  itemsObserved: number;
  bytesPrepared: number;
  metadataOnly: true;
  summary?: string;
};

export type ArtifactBackedExecutionReceipt = {
  executor: ExecutionExecutor;
  outputKinds: ArtifactKind[];
  itemsObserved: number;
  bytesPrepared: number;
  metadataOnly: false;
  artifactReceiptIds: string[];
  summary?: string;
};

export type ExecutionReceipt = MetadataOnlyExecutionReceipt | ArtifactBackedExecutionReceipt;

export type ExecutionFailure = {
  code: string;
  message: string;
  retryable: boolean;
  occurredAt: string;
};

export type ExecutionAttempt = {
  contractVersion: typeof WORKER_EXECUTION_PROTOCOL_VERSION;
  objectType: "EXECUTION_ATTEMPT";
  id: string;
  workspaceId: string;
  runId: string;
  jobId: string;
  jobAttempt: number;
  leaseId: string;
  workerId: string;
  connector: {
    connectorId: string;
    version: string;
  };
  executor: ExecutionExecutor;
  status: ExecutionAttemptStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  receipt?: ExecutionReceipt;
  failure?: ExecutionFailure;
};

export type ExecutionEvent = {
  contractVersion: typeof WORKER_EXECUTION_PROTOCOL_VERSION;
  objectType: "EXECUTION_EVENT";
  id: string;
  attemptId: string;
  sequence: number;
  eventType: ExecutionEventType;
  fromStatus?: ExecutionAttemptStatus;
  toStatus: ExecutionAttemptStatus;
  idempotencyKey: string;
  payloadHash: string;
  recordedAt: string;
};

const ATTEMPT_ID_PATTERN = /^exa_[0-9A-HJKMNP-TV-Z]{26}$/;
const EVENT_ID_PATTERN = /^eve_[0-9A-HJKMNP-TV-Z]{26}$/;
const WORKSPACE_ID_PATTERN = /^wsp_[0-9A-HJKMNP-TV-Z]{26}$/;
const RUN_ID_PATTERN = /^run_[0-9A-HJKMNP-TV-Z]{26}$/;
const JOB_ID_PATTERN = /^job_[0-9A-HJKMNP-TV-Z]{26}$/;
const LEASE_ID_PATTERN = /^lse_[0-9A-HJKMNP-TV-Z]{26}$/;
const WORKER_ID_PATTERN = /^wrk_[0-9A-HJKMNP-TV-Z]{26}$/;
const CONNECTOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXECUTOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const FAILURE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,99}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ARTIFACT_KINDS: ArtifactKind[] = [
  "EMAIL",
  "OTHER",
  "HTML",
  "PDF",
  "DOCX",
  "XLSX",
  "CSV",
  "JSON",
  "XML",
  "IMAGE",
  "AUDIO",
  "VIDEO",
  "TEXT",
  "MARKDOWN",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasRequiredKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isEnumValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function isRfc3339(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function isExecutionExecutor(value: unknown): value is ExecutionExecutor {
  if (!isRecord(value)) return false;
  if (!hasRequiredKeys(value, ["executorId", "version", "mode"])) return false;
  if (!hasOnlyKeys(value, ["executorId", "version", "mode"])) return false;
  return (
    typeof value.executorId === "string" &&
    EXECUTOR_ID_PATTERN.test(value.executorId) &&
    typeof value.version === "string" &&
    SEMVER_PATTERN.test(value.version) &&
    isEnumValue(EXECUTOR_MODES, value.mode)
  );
}

export function isExecutionReceipt(value: unknown): value is ExecutionReceipt {
  if (!isRecord(value)) return false;
  const required = ["executor", "outputKinds", "itemsObserved", "bytesPrepared", "metadataOnly"];
  if (!hasRequiredKeys(value, required)) return false;
  const metadataOnly = value.metadataOnly === true;
  if (
    !hasOnlyKeys(value, [...required, "summary", ...(metadataOnly ? [] : ["artifactReceiptIds"])])
  ) {
    return false;
  }
  const evidenceIsValid = metadataOnly
    ? value.artifactReceiptIds === undefined
    : value.metadataOnly === false &&
      Array.isArray(value.artifactReceiptIds) &&
      value.artifactReceiptIds.length > 0 &&
      value.artifactReceiptIds.every(
        (id) => typeof id === "string" && /^air_[0-9A-HJKMNP-TV-Z]{26}$/.test(id),
      ) &&
      new Set(value.artifactReceiptIds).size === value.artifactReceiptIds.length;
  return (
    isExecutionExecutor(value.executor) &&
    Array.isArray(value.outputKinds) &&
    value.outputKinds.length > 0 &&
    value.outputKinds.every(
      (kind) => typeof kind === "string" && ARTIFACT_KINDS.includes(kind as ArtifactKind),
    ) &&
    new Set(value.outputKinds).size === value.outputKinds.length &&
    isNonNegativeInteger(value.itemsObserved) &&
    isNonNegativeInteger(value.bytesPrepared) &&
    evidenceIsValid &&
    (value.summary === undefined ||
      (typeof value.summary === "string" &&
        value.summary.length > 0 &&
        value.summary.length <= 500))
  );
}

export function isExecutionFailure(value: unknown): value is ExecutionFailure {
  if (!isRecord(value)) return false;
  if (!hasRequiredKeys(value, ["code", "message", "retryable", "occurredAt"])) return false;
  if (!hasOnlyKeys(value, ["code", "message", "retryable", "occurredAt"])) return false;
  return (
    typeof value.code === "string" &&
    FAILURE_CODE_PATTERN.test(value.code) &&
    typeof value.message === "string" &&
    value.message.length > 0 &&
    value.message.length <= 1000 &&
    typeof value.retryable === "boolean" &&
    isRfc3339(value.occurredAt)
  );
}

export function isExecutionAttempt(value: unknown): value is ExecutionAttempt {
  if (!isRecord(value)) return false;
  const required = [
    "contractVersion",
    "objectType",
    "id",
    "workspaceId",
    "runId",
    "jobId",
    "jobAttempt",
    "leaseId",
    "workerId",
    "connector",
    "executor",
    "status",
    "startedAt",
    "updatedAt",
  ];
  if (!hasRequiredKeys(value, required)) return false;
  if (!hasOnlyKeys(value, [...required, "completedAt", "receipt", "failure"])) return false;
  if (!isRecord(value.connector) || !hasOnlyKeys(value.connector, ["connectorId", "version"])) {
    return false;
  }
  if (
    value.contractVersion !== WORKER_EXECUTION_PROTOCOL_VERSION ||
    value.objectType !== "EXECUTION_ATTEMPT" ||
    typeof value.id !== "string" ||
    !ATTEMPT_ID_PATTERN.test(value.id) ||
    typeof value.workspaceId !== "string" ||
    !WORKSPACE_ID_PATTERN.test(value.workspaceId) ||
    typeof value.runId !== "string" ||
    !RUN_ID_PATTERN.test(value.runId) ||
    typeof value.jobId !== "string" ||
    !JOB_ID_PATTERN.test(value.jobId) ||
    !isPositiveInteger(value.jobAttempt) ||
    typeof value.leaseId !== "string" ||
    !LEASE_ID_PATTERN.test(value.leaseId) ||
    typeof value.workerId !== "string" ||
    !WORKER_ID_PATTERN.test(value.workerId) ||
    typeof value.connector.connectorId !== "string" ||
    !CONNECTOR_ID_PATTERN.test(value.connector.connectorId) ||
    typeof value.connector.version !== "string" ||
    !SEMVER_PATTERN.test(value.connector.version) ||
    !isExecutionExecutor(value.executor) ||
    !isEnumValue(EXECUTION_ATTEMPT_STATUSES, value.status) ||
    !isRfc3339(value.startedAt) ||
    !isRfc3339(value.updatedAt)
  ) {
    return false;
  }
  if (value.status === "COMPLETED") {
    return (
      isRfc3339(value.completedAt) &&
      isExecutionReceipt(value.receipt) &&
      value.failure === undefined &&
      JSON.stringify(value.executor) === JSON.stringify(value.receipt.executor)
    );
  }
  if (value.status === "FAILED") {
    return (
      isRfc3339(value.completedAt) &&
      isExecutionFailure(value.failure) &&
      value.receipt === undefined
    );
  }
  return (
    value.completedAt === undefined && value.receipt === undefined && value.failure === undefined
  );
}

export function isExecutionEvent(value: unknown): value is ExecutionEvent {
  if (!isRecord(value)) return false;
  const required = [
    "contractVersion",
    "objectType",
    "id",
    "attemptId",
    "sequence",
    "eventType",
    "toStatus",
    "idempotencyKey",
    "payloadHash",
    "recordedAt",
  ];
  if (!hasRequiredKeys(value, required)) return false;
  if (!hasOnlyKeys(value, [...required, "fromStatus"])) return false;
  return (
    value.contractVersion === WORKER_EXECUTION_PROTOCOL_VERSION &&
    value.objectType === "EXECUTION_EVENT" &&
    typeof value.id === "string" &&
    EVENT_ID_PATTERN.test(value.id) &&
    typeof value.attemptId === "string" &&
    ATTEMPT_ID_PATTERN.test(value.attemptId) &&
    isPositiveInteger(value.sequence) &&
    isEnumValue(EXECUTION_EVENT_TYPES, value.eventType) &&
    (value.fromStatus === undefined || isEnumValue(EXECUTION_ATTEMPT_STATUSES, value.fromStatus)) &&
    isEnumValue(EXECUTION_ATTEMPT_STATUSES, value.toStatus) &&
    typeof value.idempotencyKey === "string" &&
    value.idempotencyKey.length > 0 &&
    value.idempotencyKey.length <= 128 &&
    typeof value.payloadHash === "string" &&
    HASH_PATTERN.test(value.payloadHash) &&
    isRfc3339(value.recordedAt)
  );
}
