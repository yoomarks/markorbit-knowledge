import {
  JOB_TYPES,
  WORKER_STATUSES,
  type JobStatus,
  type JobType,
  type WorkerStatus,
} from "./vocabularies";
import {
  CONNECTOR_CAPABILITIES,
  hasForbiddenSecretValue,
  type ConnectorCapability,
  type Extensions,
} from "./schema-v1";

export const WORKER_PROTOCOL_VERSION = "1.0" as const;

export const WORKER_DESIRED_STATES = ["ACTIVE", "DRAINING", "DISABLED"] as const;
export type WorkerDesiredState = (typeof WORKER_DESIRED_STATES)[number];

export const WORKER_HEALTH_STATES = ["HEALTHY", "DEGRADED", "ERROR"] as const;
export type WorkerHealthState = (typeof WORKER_HEALTH_STATES)[number];

export const JOB_LEASE_STATUSES = ["ACTIVE", "RELEASED", "EXPIRED", "REVOKED"] as const;
export type JobLeaseStatus = (typeof JOB_LEASE_STATUSES)[number];

export type WorkerConnectorBinding = {
  connectorId: string;
  version: string;
  capabilities: ConnectorCapability[];
};

export type WorkerDefinition = {
  contractVersion: typeof WORKER_PROTOCOL_VERSION;
  objectType: "WORKER_DEFINITION";
  id: string;
  workspaceId: string;
  displayName: string;
  desiredState: WorkerDesiredState;
  runtime: {
    runtimeId: string;
    version: string;
  };
  supportedJobTypes: JobType[];
  connectorBindings: WorkerConnectorBinding[];
  maxConcurrency: number;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  extensions?: Extensions;
};

export type WorkerHeartbeat = {
  contractVersion: typeof WORKER_PROTOCOL_VERSION;
  objectType: "WORKER_HEARTBEAT";
  id: string;
  workerId: string;
  workspaceId: string;
  observedAt: string;
  receivedAt: string;
  runtimeVersion: string;
  health: WorkerHealthState;
  activeLeaseIds: string[];
  diagnostics?: Extensions;
};

export type JobLease = {
  contractVersion: typeof WORKER_PROTOCOL_VERSION;
  objectType: "JOB_LEASE";
  id: string;
  workspaceId: string;
  workerId: string;
  jobId: string;
  runId: string;
  jobType: JobType;
  connector: {
    connectorId: string;
    version: string;
  };
  status: JobLeaseStatus;
  acquiredAt: string;
  expiresAt: string;
  updatedAt: string;
  closedAt?: string;
  closeReason?: string;
  extensions?: Extensions;
};

export type WorkerRuntimeView = {
  worker: WorkerDefinition;
  effectiveStatus: WorkerStatus;
  latestHeartbeat: WorkerHeartbeat | null;
  activeLeaseCount: number;
  activeLeases: JobLease[];
};

const WORKER_ID_PATTERN = /^wrk_[0-9A-HJKMNP-TV-Z]{26}$/;
const HEARTBEAT_ID_PATTERN = /^hbt_[0-9A-HJKMNP-TV-Z]{26}$/;
const LEASE_ID_PATTERN = /^lse_[0-9A-HJKMNP-TV-Z]{26}$/;
const WORKSPACE_ID_PATTERN = /^wsp_[0-9A-HJKMNP-TV-Z]{26}$/;
const JOB_ID_PATTERN = /^job_[0-9A-HJKMNP-TV-Z]{26}$/;
const RUN_ID_PATTERN = /^run_[0-9A-HJKMNP-TV-Z]{26}$/;
const CONNECTOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const RUNTIME_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const EXTENSION_KEY_PATTERN = /^x-[a-z0-9][a-z0-9.-]*$/;

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

function isBoundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isStringArray(value: unknown, maxItems = 100): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => isBoundedText(item, 200)) &&
    new Set(value).size === value.length
  );
}

function isExtensions(value: unknown): value is Extensions {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => EXTENSION_KEY_PATTERN.test(key)) &&
    !hasForbiddenSecretValue(value)
  );
}

function optionalExtensions(value: unknown): boolean {
  return value === undefined || isExtensions(value);
}

function isConnectorBinding(value: unknown): value is WorkerConnectorBinding {
  if (!isRecord(value)) return false;
  if (!hasRequiredKeys(value, ["connectorId", "version", "capabilities"])) return false;
  if (!hasOnlyKeys(value, ["connectorId", "version", "capabilities"])) return false;
  return (
    typeof value.connectorId === "string" &&
    CONNECTOR_ID_PATTERN.test(value.connectorId) &&
    typeof value.version === "string" &&
    SEMVER_PATTERN.test(value.version) &&
    Array.isArray(value.capabilities) &&
    value.capabilities.length > 0 &&
    value.capabilities.every((item) => isEnumValue(CONNECTOR_CAPABILITIES, item)) &&
    new Set(value.capabilities).size === value.capabilities.length
  );
}

function bindingsAreUnique(bindings: WorkerConnectorBinding[]): boolean {
  const identities = bindings.map((binding) => `${binding.connectorId}@${binding.version}`);
  return new Set(identities).size === identities.length;
}

function closureFieldsAreValid(
  status: JobLeaseStatus,
  closedAt: unknown,
  closeReason: unknown,
): boolean {
  if (status === "ACTIVE") return closedAt === undefined && closeReason === undefined;
  return (
    isRfc3339(closedAt) &&
    (closeReason === undefined || (typeof closeReason === "string" && closeReason.length <= 500))
  );
}

export function isWorkerDefinition(value: unknown): value is WorkerDefinition {
  if (!isRecord(value)) return false;
  const required = [
    "contractVersion",
    "objectType",
    "id",
    "workspaceId",
    "displayName",
    "desiredState",
    "runtime",
    "supportedJobTypes",
    "connectorBindings",
    "maxConcurrency",
    "labels",
    "createdAt",
    "updatedAt",
  ];
  if (!hasRequiredKeys(value, required)) return false;
  if (!hasOnlyKeys(value, [...required, "extensions"])) return false;
  if (!isRecord(value.runtime)) return false;
  if (!hasRequiredKeys(value.runtime, ["runtimeId", "version"])) return false;
  if (!hasOnlyKeys(value.runtime, ["runtimeId", "version"])) return false;
  if (!Array.isArray(value.supportedJobTypes) || !Array.isArray(value.connectorBindings)) {
    return false;
  }
  if (
    value.contractVersion !== WORKER_PROTOCOL_VERSION ||
    value.objectType !== "WORKER_DEFINITION" ||
    typeof value.id !== "string" ||
    !WORKER_ID_PATTERN.test(value.id) ||
    typeof value.workspaceId !== "string" ||
    !WORKSPACE_ID_PATTERN.test(value.workspaceId) ||
    !isBoundedText(value.displayName, 200) ||
    !isEnumValue(WORKER_DESIRED_STATES, value.desiredState) ||
    typeof value.runtime.runtimeId !== "string" ||
    !RUNTIME_ID_PATTERN.test(value.runtime.runtimeId) ||
    typeof value.runtime.version !== "string" ||
    !SEMVER_PATTERN.test(value.runtime.version) ||
    value.supportedJobTypes.length === 0 ||
    !value.supportedJobTypes.every((item) => isEnumValue(JOB_TYPES, item)) ||
    new Set(value.supportedJobTypes).size !== value.supportedJobTypes.length ||
    value.connectorBindings.length === 0 ||
    !value.connectorBindings.every(isConnectorBinding) ||
    !bindingsAreUnique(value.connectorBindings) ||
    typeof value.maxConcurrency !== "number" ||
    !Number.isInteger(value.maxConcurrency) ||
    value.maxConcurrency < 1 ||
    value.maxConcurrency > 1000 ||
    !isStringArray(value.labels, 50) ||
    !isRfc3339(value.createdAt) ||
    !isRfc3339(value.updatedAt) ||
    !optionalExtensions(value.extensions)
  ) {
    return false;
  }
  return !hasForbiddenSecretValue(value);
}

export function isWorkerHeartbeat(value: unknown): value is WorkerHeartbeat {
  if (!isRecord(value)) return false;
  const required = [
    "contractVersion",
    "objectType",
    "id",
    "workerId",
    "workspaceId",
    "observedAt",
    "receivedAt",
    "runtimeVersion",
    "health",
    "activeLeaseIds",
  ];
  if (!hasRequiredKeys(value, required)) return false;
  if (!hasOnlyKeys(value, [...required, "diagnostics"])) return false;
  return (
    value.contractVersion === WORKER_PROTOCOL_VERSION &&
    value.objectType === "WORKER_HEARTBEAT" &&
    typeof value.id === "string" &&
    HEARTBEAT_ID_PATTERN.test(value.id) &&
    typeof value.workerId === "string" &&
    WORKER_ID_PATTERN.test(value.workerId) &&
    typeof value.workspaceId === "string" &&
    WORKSPACE_ID_PATTERN.test(value.workspaceId) &&
    isRfc3339(value.observedAt) &&
    isRfc3339(value.receivedAt) &&
    typeof value.runtimeVersion === "string" &&
    SEMVER_PATTERN.test(value.runtimeVersion) &&
    isEnumValue(WORKER_HEALTH_STATES, value.health) &&
    Array.isArray(value.activeLeaseIds) &&
    value.activeLeaseIds.length <= 1000 &&
    value.activeLeaseIds.every((item) => typeof item === "string" && LEASE_ID_PATTERN.test(item)) &&
    new Set(value.activeLeaseIds).size === value.activeLeaseIds.length &&
    optionalExtensions(value.diagnostics) &&
    !hasForbiddenSecretValue(value)
  );
}

export function isJobLease(value: unknown): value is JobLease {
  if (!isRecord(value)) return false;
  const required = [
    "contractVersion",
    "objectType",
    "id",
    "workspaceId",
    "workerId",
    "jobId",
    "runId",
    "jobType",
    "connector",
    "status",
    "acquiredAt",
    "expiresAt",
    "updatedAt",
  ];
  if (!hasRequiredKeys(value, required)) return false;
  if (!hasOnlyKeys(value, [...required, "closedAt", "closeReason", "extensions"])) {
    return false;
  }
  if (!isRecord(value.connector)) return false;
  if (!hasRequiredKeys(value.connector, ["connectorId", "version"])) return false;
  if (!hasOnlyKeys(value.connector, ["connectorId", "version"])) return false;
  if (
    value.contractVersion !== WORKER_PROTOCOL_VERSION ||
    value.objectType !== "JOB_LEASE" ||
    typeof value.id !== "string" ||
    !LEASE_ID_PATTERN.test(value.id) ||
    typeof value.workspaceId !== "string" ||
    !WORKSPACE_ID_PATTERN.test(value.workspaceId) ||
    typeof value.workerId !== "string" ||
    !WORKER_ID_PATTERN.test(value.workerId) ||
    typeof value.jobId !== "string" ||
    !JOB_ID_PATTERN.test(value.jobId) ||
    typeof value.runId !== "string" ||
    !RUN_ID_PATTERN.test(value.runId) ||
    !isEnumValue(JOB_TYPES, value.jobType) ||
    typeof value.connector.connectorId !== "string" ||
    !CONNECTOR_ID_PATTERN.test(value.connector.connectorId) ||
    typeof value.connector.version !== "string" ||
    !SEMVER_PATTERN.test(value.connector.version) ||
    !isEnumValue(JOB_LEASE_STATUSES, value.status) ||
    !isRfc3339(value.acquiredAt) ||
    !isRfc3339(value.expiresAt) ||
    Date.parse(value.expiresAt) <= Date.parse(value.acquiredAt) ||
    !isRfc3339(value.updatedAt) ||
    !closureFieldsAreValid(value.status, value.closedAt, value.closeReason) ||
    !optionalExtensions(value.extensions)
  ) {
    return false;
  }
  return !hasForbiddenSecretValue(value);
}

export function isWorkerRuntimeView(value: unknown): value is WorkerRuntimeView {
  if (!isRecord(value)) return false;
  if (
    !hasRequiredKeys(value, [
      "worker",
      "effectiveStatus",
      "latestHeartbeat",
      "activeLeaseCount",
      "activeLeases",
    ])
  ) {
    return false;
  }
  if (
    !hasOnlyKeys(value, [
      "worker",
      "effectiveStatus",
      "latestHeartbeat",
      "activeLeaseCount",
      "activeLeases",
    ])
  ) {
    return false;
  }
  return (
    isWorkerDefinition(value.worker) &&
    isEnumValue(WORKER_STATUSES, value.effectiveStatus) &&
    (value.latestHeartbeat === null || isWorkerHeartbeat(value.latestHeartbeat)) &&
    typeof value.activeLeaseCount === "number" &&
    Number.isInteger(value.activeLeaseCount) &&
    value.activeLeaseCount >= 0 &&
    Array.isArray(value.activeLeases) &&
    value.activeLeases.every(isJobLease) &&
    value.activeLeaseCount === value.activeLeases.length
  );
}

export function jobStatusCanBeLeased(status: JobStatus): boolean {
  return status === "PENDING";
}
