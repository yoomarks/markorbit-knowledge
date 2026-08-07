import { JOB_STATUSES, JOB_TYPES, type JobStatus, type JobType } from "./vocabularies";
import {
  hasForbiddenSecretValue,
  isCollectionPlan,
  isConnectorManifest,
  isSourceDefinition,
  type CollectionPlan,
  type CollectionPriority,
  type ConnectorManifest,
  type Extensions,
  type SourceDefinition,
} from "./schema-v1";

export const EXECUTION_CONTRACT_VERSION = "1.0" as const;

export const COLLECTION_RUN_STATUSES = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type CollectionRunStatus = (typeof COLLECTION_RUN_STATUSES)[number];

export const RUN_TRIGGER_TYPES = ["MANUAL", "SCHEDULED", "RETRY", "API"] as const;
export type RunTriggerType = (typeof RUN_TRIGGER_TYPES)[number];

export const EXECUTION_ACTOR_TYPES = ["LOCAL_ADMIN", "SYSTEM", "API_CLIENT"] as const;
export type ExecutionActorType = (typeof EXECUTION_ACTOR_TYPES)[number];

export type ExecutionActor = {
  actorType: ExecutionActorType;
  actorId?: string;
};

export type ExecutionTrigger = {
  type: RunTriggerType;
  requestedBy: ExecutionActor;
  idempotencyKey?: string;
  parentRunId?: string;
};

export type CollectionRun = {
  contractVersion: typeof EXECUTION_CONTRACT_VERSION;
  objectType: "COLLECTION_RUN";
  id: string;
  workspaceId: string;
  sourceId: string;
  planId: string;
  status: CollectionRunStatus;
  trigger: ExecutionTrigger;
  planSnapshot: CollectionPlan;
  sourceSnapshot: SourceDefinition;
  connectorSnapshot: ConnectorManifest;
  requestedAt: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  cancellationReason?: string;
  extensions?: Extensions;
};

export type Job = {
  contractVersion: typeof EXECUTION_CONTRACT_VERSION;
  objectType: "JOB";
  id: string;
  runId: string;
  workspaceId: string;
  sourceId: string;
  planId: string;
  jobType: JobType;
  status: JobStatus;
  connector: {
    connectorId: string;
    version: string;
  };
  priority: CollectionPriority;
  attempt: number;
  maxAttempts: number;
  availableAt: string;
  planSnapshot: CollectionPlan;
  sourceSnapshot: SourceDefinition;
  connectorSnapshot: ConnectorManifest;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  cancellationReason?: string;
  extensions?: Extensions;
};

const RUN_ID_PATTERN = /^run_[0-9A-HJKMNP-TV-Z]{26}$/;
const JOB_ID_PATTERN = /^job_[0-9A-HJKMNP-TV-Z]{26}$/;
const WORKSPACE_ID_PATTERN = /^wsp_[0-9A-HJKMNP-TV-Z]{26}$/;
const SOURCE_ID_PATTERN = /^src_[0-9A-HJKMNP-TV-Z]{26}$/;
const PLAN_ID_PATTERN = /^pln_[0-9A-HJKMNP-TV-Z]{26}$/;
const CONNECTOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
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

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
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

function isExecutionActor(value: unknown): value is ExecutionActor {
  if (!isRecord(value)) return false;
  if (!hasRequiredKeys(value, ["actorType"])) return false;
  if (!hasOnlyKeys(value, ["actorType", "actorId"])) return false;
  return (
    isEnumValue(EXECUTION_ACTOR_TYPES, value.actorType) &&
    (value.actorId === undefined ||
      (typeof value.actorId === "string" &&
        value.actorId.length > 0 &&
        value.actorId.length <= 200))
  );
}

function isExecutionTrigger(value: unknown): value is ExecutionTrigger {
  if (!isRecord(value)) return false;
  if (!hasRequiredKeys(value, ["type", "requestedBy"])) return false;
  if (!hasOnlyKeys(value, ["type", "requestedBy", "idempotencyKey", "parentRunId"])) return false;
  if (!isEnumValue(RUN_TRIGGER_TYPES, value.type) || !isExecutionActor(value.requestedBy)) {
    return false;
  }
  if (
    value.idempotencyKey !== undefined &&
    (typeof value.idempotencyKey !== "string" ||
      value.idempotencyKey.length === 0 ||
      value.idempotencyKey.length > 128)
  ) {
    return false;
  }
  if (
    value.parentRunId !== undefined &&
    (typeof value.parentRunId !== "string" || !RUN_ID_PATTERN.test(value.parentRunId))
  ) {
    return false;
  }
  if (value.type === "RETRY") return typeof value.parentRunId === "string";
  return value.parentRunId === undefined;
}

function snapshotsAlign(
  workspaceId: string,
  sourceId: string,
  planId: string,
  plan: CollectionPlan,
  source: SourceDefinition,
  connector: ConnectorManifest,
): boolean {
  return (
    plan.id === planId &&
    plan.sourceId === sourceId &&
    plan.workspaceId === workspaceId &&
    source.id === sourceId &&
    source.workspaceId === workspaceId &&
    source.connector.connectorId === connector.connectorId &&
    source.connector.version === connector.version
  );
}

function cancellationFieldsAreValid(
  status: CollectionRunStatus | JobStatus,
  cancelledAt: unknown,
  cancellationReason: unknown,
): boolean {
  if (status === "CANCELLED") {
    return (
      isRfc3339(cancelledAt) &&
      (cancellationReason === undefined ||
        (typeof cancellationReason === "string" &&
          cancellationReason.length > 0 &&
          cancellationReason.length <= 500))
    );
  }
  return cancelledAt === undefined && cancellationReason === undefined;
}

export function isCollectionRun(value: unknown): value is CollectionRun {
  if (!isRecord(value)) return false;
  const required = [
    "contractVersion",
    "objectType",
    "id",
    "workspaceId",
    "sourceId",
    "planId",
    "status",
    "trigger",
    "planSnapshot",
    "sourceSnapshot",
    "connectorSnapshot",
    "requestedAt",
    "createdAt",
    "updatedAt",
  ];
  if (!hasRequiredKeys(value, required)) return false;
  if (!hasOnlyKeys(value, [...required, "cancelledAt", "cancellationReason", "extensions"])) {
    return false;
  }
  if (
    value.contractVersion !== EXECUTION_CONTRACT_VERSION ||
    value.objectType !== "COLLECTION_RUN" ||
    typeof value.id !== "string" ||
    !RUN_ID_PATTERN.test(value.id) ||
    typeof value.workspaceId !== "string" ||
    !WORKSPACE_ID_PATTERN.test(value.workspaceId) ||
    typeof value.sourceId !== "string" ||
    !SOURCE_ID_PATTERN.test(value.sourceId) ||
    typeof value.planId !== "string" ||
    !PLAN_ID_PATTERN.test(value.planId) ||
    !isEnumValue(COLLECTION_RUN_STATUSES, value.status) ||
    !isExecutionTrigger(value.trigger) ||
    !isCollectionPlan(value.planSnapshot) ||
    !isSourceDefinition(value.sourceSnapshot) ||
    !isConnectorManifest(value.connectorSnapshot) ||
    !isRfc3339(value.requestedAt) ||
    !isRfc3339(value.createdAt) ||
    !isRfc3339(value.updatedAt) ||
    !optionalExtensions(value.extensions)
  ) {
    return false;
  }
  return (
    snapshotsAlign(
      value.workspaceId,
      value.sourceId,
      value.planId,
      value.planSnapshot,
      value.sourceSnapshot,
      value.connectorSnapshot,
    ) && cancellationFieldsAreValid(value.status, value.cancelledAt, value.cancellationReason)
  );
}

export function isJob(value: unknown): value is Job {
  if (!isRecord(value)) return false;
  const required = [
    "contractVersion",
    "objectType",
    "id",
    "runId",
    "workspaceId",
    "sourceId",
    "planId",
    "jobType",
    "status",
    "connector",
    "priority",
    "attempt",
    "maxAttempts",
    "availableAt",
    "planSnapshot",
    "sourceSnapshot",
    "connectorSnapshot",
    "createdAt",
    "updatedAt",
  ];
  if (!hasRequiredKeys(value, required)) return false;
  if (!hasOnlyKeys(value, [...required, "cancelledAt", "cancellationReason", "extensions"])) {
    return false;
  }
  if (!isRecord(value.connector) || !hasOnlyKeys(value.connector, ["connectorId", "version"])) {
    return false;
  }
  if (
    value.contractVersion !== EXECUTION_CONTRACT_VERSION ||
    value.objectType !== "JOB" ||
    typeof value.id !== "string" ||
    !JOB_ID_PATTERN.test(value.id) ||
    typeof value.runId !== "string" ||
    !RUN_ID_PATTERN.test(value.runId) ||
    typeof value.workspaceId !== "string" ||
    !WORKSPACE_ID_PATTERN.test(value.workspaceId) ||
    typeof value.sourceId !== "string" ||
    !SOURCE_ID_PATTERN.test(value.sourceId) ||
    typeof value.planId !== "string" ||
    !PLAN_ID_PATTERN.test(value.planId) ||
    !isEnumValue(JOB_TYPES, value.jobType) ||
    !isEnumValue(JOB_STATUSES, value.status) ||
    typeof value.connector.connectorId !== "string" ||
    !CONNECTOR_ID_PATTERN.test(value.connector.connectorId) ||
    typeof value.connector.version !== "string" ||
    !SEMVER_PATTERN.test(value.connector.version) ||
    !["CRITICAL", "HIGH", "NORMAL", "LOW"].includes(String(value.priority)) ||
    !isPositiveInteger(value.attempt) ||
    !isPositiveInteger(value.maxAttempts) ||
    value.attempt > value.maxAttempts ||
    !isRfc3339(value.availableAt) ||
    !isCollectionPlan(value.planSnapshot) ||
    !isSourceDefinition(value.sourceSnapshot) ||
    !isConnectorManifest(value.connectorSnapshot) ||
    !isRfc3339(value.createdAt) ||
    !isRfc3339(value.updatedAt) ||
    !optionalExtensions(value.extensions)
  ) {
    return false;
  }
  return (
    snapshotsAlign(
      value.workspaceId,
      value.sourceId,
      value.planId,
      value.planSnapshot,
      value.sourceSnapshot,
      value.connectorSnapshot,
    ) &&
    value.connector.connectorId === value.connectorSnapshot.connectorId &&
    value.connector.version === value.connectorSnapshot.version &&
    cancellationFieldsAreValid(value.status, value.cancelledAt, value.cancellationReason)
  );
}

export function isExecutionContract(value: unknown): value is CollectionRun | Job {
  return isCollectionRun(value) || isJob(value);
}
