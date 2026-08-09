import { DatabaseSync } from "node:sqlite";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { SqliteExecutionLedgerRepository } from "@markorbit/persistence/execution-ledger";
import {
  SqliteFoundationalActionExecutionRepository,
  foundationalActionExecutionId,
} from "@markorbit/persistence/foundational-action-executions";
import { SqliteFoundationalActionIntentRepository } from "@markorbit/persistence/foundational-action-intents";
import { SqliteSourceSupplyHealthRepository } from "@markorbit/persistence/source-supply-health";
import {
  assembleFoundationalActionExecution,
  type FoundationalActionExecution,
} from "@markorbit/worker-runtime/foundational-action-execution";
import { normalizeFoundationalJurisdiction } from "@markorbit/worker-runtime/foundational-readiness";
import { buildFoundationalRemediationQueueSnapshot } from "./foundational-remediation-queue";

const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export type ExecuteFoundationalCollectionIntentInput = {
  intentId: string;
  executedByActorId: string;
  idempotencyKey: string;
  execute: boolean;
};

export type ListFoundationalActionExecutionFilters = {
  workspaceId: string;
  jurisdiction?: string;
  targetId?: string;
  executedByActorId?: string;
  limit?: number;
};

function normalizeActor(value: string): string {
  const actor = value.trim();
  if (!ACTOR.test(actor)) throw new RegistryValidationError("executedByActorId is invalid");
  return actor;
}

function normalizeKey(value: string): string {
  const key = value.trim();
  if (!KEY.test(key)) throw new RegistryValidationError("idempotencyKey is invalid");
  return key;
}

function asExecution(value: unknown): FoundationalActionExecution {
  return value as FoundationalActionExecution;
}

function planTarget(plan: { extensions?: Record<string, unknown> }): string | null {
  const value = plan.extensions?.["x-markorbit-source-coverage-target-id"];
  return typeof value === "string" ? value : null;
}

function isPreparedFoundationalPlan(
  plan: { extensions?: Record<string, unknown> },
  targetId: string,
): boolean {
  return (
    planTarget(plan) === targetId &&
    plan.extensions?.["x-markorbit-purpose"] === "foundational-source-supply" &&
    plan.extensions?.["x-markorbit-collection-authorization"] === false
  );
}

function resolveCollectionContext(
  database: DatabaseSync,
  input: { workspaceId: string; jurisdiction: string; targetId: string },
  clock: () => Date,
) {
  const health = new SqliteSourceSupplyHealthRepository(database, clock).list({
    workspaceId: input.workspaceId,
    jurisdiction: input.jurisdiction,
    coverageTier: "FOUNDATIONAL",
    catalogState: "ACTIVE",
    targetId: input.targetId,
  });
  const item = health.items.find((candidate) => candidate.targetId === input.targetId);
  if (!item || item.registrationState !== "REGISTERED") {
    throw new RegistryConflictError(
      "FOUNDATIONAL_COLLECTION_SOURCE_NOT_REGISTERED",
      `Foundational target ${input.targetId} is not currently registered`,
    );
  }
  if (item.sourceIds.length !== 1) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_COLLECTION_SOURCE_AMBIGUOUS",
      `Foundational target ${input.targetId} must resolve to exactly one registered source before dispatch`,
      { sourceIds: item.sourceIds },
    );
  }
  const sourceId = item.sourceIds[0]!;
  const plans = new SqliteCollectionPlanRepository(database)
    .list({
      workspaceId: input.workspaceId,
      sourceId,
      status: "ACTIVE",
      scheduleMode: "MANUAL",
      limit: 100,
    })
    .items.map((record) => record.plan)
    .filter((plan) => isPreparedFoundationalPlan(plan, input.targetId));
  if (plans.length === 0) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_COLLECTION_PLAN_NOT_PREPARED",
      `No ACTIVE MANUAL foundational supply plan is prepared for ${input.targetId}`,
    );
  }
  if (plans.length !== 1) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_COLLECTION_PLAN_AMBIGUOUS",
      `Foundational target ${input.targetId} has multiple eligible supply plans`,
      { planIds: plans.map((plan) => plan.id) },
    );
  }
  return { sourceId, plan: plans[0]!, healthItem: item };
}

function currentCollectionAction(
  database: DatabaseSync,
  input: { workspaceId: string; jurisdiction: string; targetId: string },
  clock: () => Date,
) {
  const snapshot = buildFoundationalRemediationQueueSnapshot(
    database,
    {
      workspaceId: input.workspaceId,
      jurisdiction: input.jurisdiction,
      targetId: input.targetId,
    },
    clock,
  );
  const item = snapshot.remediationQueue.items.find(
    (candidate) => candidate.targetId === input.targetId,
  );
  const action = item?.actions.find(
    (candidate) => candidate.code === "DISPATCH_GOVERNED_COLLECTION",
  );
  if (
    !item ||
    item.stage !== "COLLECT" ||
    !action ||
    action.executionPath !== "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH" ||
    action.collectionAuthorizationRequired !== true ||
    action.automaticExecution !== false
  ) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_ACTION_INTENT_STALE",
      "The approved collection intent no longer matches the current foundational remediation queue",
      {
        currentStage: item?.stage ?? "READY",
        availableActionCodes: item?.actions.map((candidate) => candidate.code) ?? [],
      },
    );
  }
  return { snapshot, item, action };
}

export function executeApprovedFoundationalCollectionIntent(
  database: DatabaseSync,
  input: ExecuteFoundationalCollectionIntentInput,
  clock: () => Date = () => new Date(),
): FoundationalActionExecution {
  if (input.execute !== true) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_EXPLICIT_EXECUTION_REQUIRED",
      "Controlled foundational collection dispatch requires execute=true from an explicit operator action",
    );
  }
  const executedByActorId = normalizeActor(input.executedByActorId);
  const idempotencyKey = normalizeKey(input.idempotencyKey);
  const intentRepository = new SqliteFoundationalActionIntentRepository(database, clock);
  const intent = intentRepository.getById(input.intentId);
  if (!intent) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_ACTION_INTENT_NOT_FOUND",
      `Foundational action intent ${input.intentId.trim()} was not found`,
    );
  }
  if (intent.status !== "APPROVED" || !intent.approvedByActorId) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_ACTION_INTENT_NOT_APPROVED",
      "Foundational collection dispatch requires an APPROVED action intent",
      { status: intent.status },
    );
  }
  if (
    intent.readinessStage !== "COLLECT" ||
    intent.actionCode !== "DISPATCH_GOVERNED_COLLECTION" ||
    intent.executionPath !== "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH" ||
    intent.collectionAuthorizationRequired !== true ||
    intent.automaticExecution !== false ||
    intent.executionAuthorization !== "NONE"
  ) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_ACTION_EXECUTION_UNSUPPORTED",
      "M24 executes only approved governed collection intents from the COLLECT stage",
      { actionCode: intent.actionCode, readinessStage: intent.readinessStage },
    );
  }

  const executionRepository = new SqliteFoundationalActionExecutionRepository(database);
  const existing = executionRepository.getByIntentId(intent.intentId);
  if (existing) {
    if (
      existing.executedByActorId !== executedByActorId ||
      existing.idempotencyKey !== idempotencyKey
    ) {
      throw new RegistryConflictError(
        "FOUNDATIONAL_ACTION_INTENT_ALREADY_EXECUTED",
        "This foundational action intent already dispatched a collection run",
        { runId: existing.runId },
      );
    }
    return { ...asExecution(existing), replayed: true };
  }

  const { snapshot } = currentCollectionAction(
    database,
    {
      workspaceId: intent.workspaceId,
      jurisdiction: intent.jurisdiction,
      targetId: intent.targetId,
    },
    clock,
  );
  const { sourceId, plan } = resolveCollectionContext(
    database,
    {
      workspaceId: intent.workspaceId,
      jurisdiction: intent.jurisdiction,
      targetId: intent.targetId,
    },
    clock,
  );

  const runIdempotencyKey = `foundational-intent:${intent.intentId}`;
  const dispatch = new SqliteExecutionLedgerRepository(database, clock).dispatchManual({
    planId: plan.id,
    requestedBy: { actorType: "LOCAL_ADMIN", actorId: executedByActorId },
    idempotencyKey: runIdempotencyKey,
  });
  const runActorId = dispatch.record.run.trigger.requestedBy.actorId;
  if (runActorId !== executedByActorId) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_ACTION_EXECUTION_ACTOR_CONFLICT",
      "The collection run for this intent was already created by a different execution actor",
      { runId: dispatch.record.run.id, runActorId },
    );
  }

  const execution = assembleFoundationalActionExecution({
    executionId: foundationalActionExecutionId(intent.workspaceId, idempotencyKey),
    intentId: intent.intentId,
    workspaceId: intent.workspaceId,
    jurisdiction: intent.jurisdiction,
    targetId: intent.targetId,
    requestedByActorId: intent.requestedByActorId,
    approvedByActorId: intent.approvedByActorId,
    executedByActorId,
    sourceId,
    planId: plan.id,
    runId: dispatch.record.run.id,
    jobIds: dispatch.record.jobs.map((job) => job.id),
    runStatusAtDispatch: dispatch.record.run.status,
    idempotencyKey,
    intentUpdatedAt: intent.updatedAt,
    sourceSnapshotObservedAt: snapshot.observedAt,
    revalidatedAt: snapshot.observedAt,
    dispatchedAt: dispatch.record.run.requestedAt,
  });
  return asExecution(executionRepository.create(execution));
}

export function getFoundationalActionExecutionByIntent(
  database: DatabaseSync,
  intentId: string,
): FoundationalActionExecution | null {
  const record = new SqliteFoundationalActionExecutionRepository(database).getByIntentId(intentId);
  return record ? asExecution(record) : null;
}

export function listFoundationalActionExecutions(
  database: DatabaseSync,
  filters: ListFoundationalActionExecutionFilters,
): FoundationalActionExecution[] {
  const workspaceId = filters.workspaceId.trim();
  if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
  const jurisdiction = filters.jurisdiction?.trim()
    ? normalizeFoundationalJurisdiction(filters.jurisdiction)
    : undefined;
  const executedByActorId = filters.executedByActorId?.trim()
    ? normalizeActor(filters.executedByActorId)
    : undefined;
  const limit = filters.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 100) {
    throw new RegistryValidationError("limit must be an integer between 1 and 100");
  }
  return new SqliteFoundationalActionExecutionRepository(database)
    .list({
      workspaceId,
      jurisdiction,
      targetId: filters.targetId?.trim() || undefined,
      executedByActorId,
      limit,
    })
    .map(asExecution);
}
