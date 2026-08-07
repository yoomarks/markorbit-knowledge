import { JOB_STATUSES, type JobStatus } from "./vocabularies";
import { hasForbiddenSecretValue, type Extensions } from "./schema-v1";

export const EXECUTION_LIFECYCLE_VERSION = "1.0" as const;

export const EXECUTION_EVENT_TYPES = [
  "STARTED",
  "PROGRESS_REPORTED",
  "UPLOAD_READY",
  "VERIFICATION_READY",
  "COMPLETED",
  "FAILED",
] as const;
export type ExecutionEventType = (typeof EXECUTION_EVENT_TYPES)[number];

export const EXECUTION_FAILURE_KINDS = [
  "CONNECTOR_ERROR",
  "SOURCE_UNAVAILABLE",
  "POLICY_REJECTED",
  "OUTPUT_INVALID",
  "WORKER_ERROR",
  "TIMEOUT",
  "CANCELLED_EXTERNALLY",
  "UNKNOWN",
] as const;
export type ExecutionFailureKind = (typeof EXECUTION_FAILURE_KINDS)[number];

export type ExecutionMetrics = {
  discoveredCount?: number;
  processedCount?: number;
  skippedCount?: number;
  warningCount?: number;
  byteCount?: number;
  durationMs?: number;
};

export type ExecutionOutputSummary = {
  outputCount: number;
  outputTypes: string[];
  contentHashes?: string[];
};

export type ExecutionFailure = {
  kind: ExecutionFailureKind;
  code: string;
  message: string;
  retryable: boolean;
  details?: Extensions;
};

export type ExecutionLifecycleInput = {
  contractVersion: typeof EXECUTION_LIFECYCLE_VERSION;
  workerId: string;
  jobId: string;
  runId: string;
  leaseId: string;
  sequence: number;
  eventType: ExecutionEventType;
  observedAt: string;
  message?: string;
  progressPercent?: number;
  metrics?: ExecutionMetrics;
  outputSummary?: ExecutionOutputSummary;
  failure?: ExecutionFailure;
  metadata?: Extensions;
};

export type JobExecutionEvent = ExecutionLifecycleInput & {
  objectType: "JOB_EXECUTION_EVENT";
  id: string;
  workspaceId: string;
  fromStatus: JobStatus;
  toStatus: JobStatus;
  recordedAt: string;
};

const EVENT_TO_STATUS: Record<ExecutionEventType, JobStatus> = {
  STARTED: "RUNNING",
  PROGRESS_REPORTED: "RUNNING",
  UPLOAD_READY: "UPLOADING",
  VERIFICATION_READY: "VERIFYING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

const ALLOWED_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  PENDING: [],
  LEASED: ["RUNNING"],
  RUNNING: ["RUNNING", "UPLOADING", "FAILED"],
  UPLOADING: ["VERIFYING", "FAILED"],
  VERIFYING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  RETRY: [],
  FAILED: [],
  DEAD_LETTER: [],
  CANCELLED: [],
};

const ID_PATTERNS = {
  workerId: /^wrk_[0-9A-HJKMNP-TV-Z]{26}$/,
  jobId: /^job_[0-9A-HJKMNP-TV-Z]{26}$/,
  runId: /^run_[0-9A-HJKMNP-TV-Z]{26}$/,
  leaseId: /^lse_[0-9A-HJKMNP-TV-Z]{26}$/,
  eventId: /^evt_[0-9A-HJKMNP-TV-Z]{26}$/,
  workspaceId: /^wsp_[0-9A-HJKMNP-TV-Z]{26}$/,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
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

function isExtensions(value: unknown): value is Extensions {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => /^x-[a-z0-9][a-z0-9.-]*$/.test(key)) &&
    !hasForbiddenSecretValue(value)
  );
}

function isMetrics(value: unknown): value is ExecutionMetrics {
  if (!isRecord(value)) return false;
  const keys = [
    "discoveredCount",
    "processedCount",
    "skippedCount",
    "warningCount",
    "byteCount",
    "durationMs",
  ];
  return (
    hasOnlyKeys(value, keys) &&
    Object.values(value).every((item) => item === undefined || isNonNegativeInteger(item))
  );
}

function isOutputSummary(value: unknown): value is ExecutionOutputSummary {
  if (!isRecord(value) || !hasOnlyKeys(value, ["outputCount", "outputTypes", "contentHashes"])) {
    return false;
  }
  return (
    isNonNegativeInteger(value.outputCount) &&
    Array.isArray(value.outputTypes) &&
    value.outputTypes.every(
      (item) => typeof item === "string" && item.length > 0 && item.length <= 100,
    ) &&
    new Set(value.outputTypes).size === value.outputTypes.length &&
    (value.contentHashes === undefined ||
      (Array.isArray(value.contentHashes) &&
        value.contentHashes.every(
          (item) => typeof item === "string" && /^[a-f0-9]{64}$/.test(item),
        )))
  );
}

function isFailure(value: unknown): value is ExecutionFailure {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["kind", "code", "message", "retryable", "details"])
  ) {
    return false;
  }
  return (
    EXECUTION_FAILURE_KINDS.includes(value.kind as ExecutionFailureKind) &&
    typeof value.code === "string" &&
    /^[A-Z0-9][A-Z0-9_]{1,99}$/.test(value.code) &&
    typeof value.message === "string" &&
    value.message.length > 0 &&
    value.message.length <= 1000 &&
    typeof value.retryable === "boolean" &&
    (value.details === undefined || isExtensions(value.details))
  );
}

function eventFieldsAreValid(value: Record<string, unknown>): boolean {
  if (value.eventType === "STARTED") {
    return (
      value.progressPercent === undefined &&
      value.outputSummary === undefined &&
      value.failure === undefined
    );
  }
  if (value.eventType === "PROGRESS_REPORTED") {
    return (
      typeof value.progressPercent === "number" &&
      Number.isFinite(value.progressPercent) &&
      value.progressPercent >= 0 &&
      value.progressPercent <= 100 &&
      value.outputSummary === undefined &&
      value.failure === undefined
    );
  }
  if (
    value.eventType === "UPLOAD_READY" ||
    value.eventType === "VERIFICATION_READY" ||
    value.eventType === "COMPLETED"
  ) {
    return isOutputSummary(value.outputSummary) && value.failure === undefined;
  }
  if (value.eventType === "FAILED") {
    return isFailure(value.failure) && value.outputSummary === undefined;
  }
  return false;
}

export function isExecutionLifecycleInput(value: unknown): value is ExecutionLifecycleInput {
  if (!isRecord(value)) return false;
  const allowed = [
    "contractVersion",
    "workerId",
    "jobId",
    "runId",
    "leaseId",
    "sequence",
    "eventType",
    "observedAt",
    "message",
    "progressPercent",
    "metrics",
    "outputSummary",
    "failure",
    "metadata",
  ];
  if (!hasOnlyKeys(value, allowed) || hasForbiddenSecretValue(value)) return false;
  return (
    value.contractVersion === EXECUTION_LIFECYCLE_VERSION &&
    typeof value.workerId === "string" &&
    ID_PATTERNS.workerId.test(value.workerId) &&
    typeof value.jobId === "string" &&
    ID_PATTERNS.jobId.test(value.jobId) &&
    typeof value.runId === "string" &&
    ID_PATTERNS.runId.test(value.runId) &&
    typeof value.leaseId === "string" &&
    ID_PATTERNS.leaseId.test(value.leaseId) &&
    isPositiveInteger(value.sequence) &&
    EXECUTION_EVENT_TYPES.includes(value.eventType as ExecutionEventType) &&
    isRfc3339(value.observedAt) &&
    (value.message === undefined ||
      (typeof value.message === "string" &&
        value.message.length > 0 &&
        value.message.length <= 500)) &&
    (value.metrics === undefined || isMetrics(value.metrics)) &&
    (value.metadata === undefined || isExtensions(value.metadata)) &&
    eventFieldsAreValid(value)
  );
}

export function targetStatusForExecutionEvent(eventType: ExecutionEventType): JobStatus {
  return EVENT_TO_STATUS[eventType];
}

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function deriveRunStatusFromJob(
  status: JobStatus,
): "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" {
  if (status === "RUNNING" || status === "UPLOADING" || status === "VERIFYING") return "RUNNING";
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "FAILED" || status === "DEAD_LETTER") return "FAILED";
  if (status === "CANCELLED") return "CANCELLED";
  return "PENDING";
}

export function isJobExecutionEvent(value: unknown): value is JobExecutionEvent {
  if (!isRecord(value)) return false;
  const lifecycleKeys = [
    "contractVersion",
    "workerId",
    "jobId",
    "runId",
    "leaseId",
    "sequence",
    "eventType",
    "observedAt",
    "message",
    "progressPercent",
    "metrics",
    "outputSummary",
    "failure",
    "metadata",
  ];
  const allowed = [
    ...lifecycleKeys,
    "objectType",
    "id",
    "workspaceId",
    "fromStatus",
    "toStatus",
    "recordedAt",
  ];
  if (!hasOnlyKeys(value, allowed)) return false;
  const lifecycle = Object.fromEntries(
    lifecycleKeys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]),
  );
  return (
    isExecutionLifecycleInput(lifecycle) &&
    value.objectType === "JOB_EXECUTION_EVENT" &&
    typeof value.id === "string" &&
    ID_PATTERNS.eventId.test(value.id) &&
    typeof value.workspaceId === "string" &&
    ID_PATTERNS.workspaceId.test(value.workspaceId) &&
    JOB_STATUSES.includes(value.fromStatus as JobStatus) &&
    JOB_STATUSES.includes(value.toStatus as JobStatus) &&
    value.toStatus === targetStatusForExecutionEvent(value.eventType as ExecutionEventType) &&
    canTransitionJob(value.fromStatus as JobStatus, value.toStatus as JobStatus) &&
    isRfc3339(value.recordedAt)
  );
}

export function assertExecutionLifecycleInput(
  value: unknown,
): asserts value is ExecutionLifecycleInput {
  if (!isExecutionLifecycleInput(value)) {
    throw new TypeError(
      "Execution lifecycle input does not satisfy Execution Lifecycle Protocol v1",
    );
  }
}

export function assertJobExecutionEvent(value: unknown): asserts value is JobExecutionEvent {
  if (!isJobExecutionEvent(value)) {
    throw new TypeError("Job execution event does not satisfy Execution Lifecycle Protocol v1");
  }
}
