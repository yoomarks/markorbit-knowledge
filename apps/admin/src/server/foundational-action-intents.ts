import { DatabaseSync } from "node:sqlite";
import {
  RegistryConflictError,
  RegistryValidationError,
} from "@markorbit/persistence";
import {
  SqliteFoundationalActionIntentRepository,
  foundationalActionIntentId,
} from "@markorbit/persistence/foundational-action-intents";
import {
  assembleFoundationalActionIntent,
  FOUNDATIONAL_ACTION_INTENT_STATUSES,
  type FoundationalActionIntent,
  type FoundationalActionIntentStatus,
} from "@markorbit/worker-runtime/foundational-action-intent";
import { normalizeFoundationalJurisdiction } from "@markorbit/worker-runtime/foundational-readiness";
import { buildFoundationalRemediationQueueSnapshot } from "./foundational-remediation-queue";

const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export type CreateFoundationalActionIntentInput = {
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  actionCode: string;
  requestedByActorId: string;
  idempotencyKey: string;
  topK?: number;
};

export type ListFoundationalActionIntentFilters = {
  workspaceId: string;
  jurisdiction?: string;
  targetId?: string;
  status?: string;
  limit?: number;
};

function normalizeActor(value: string, field: string): string {
  const actor = value.trim();
  if (!ACTOR.test(actor)) throw new RegistryValidationError(`${field} is invalid`);
  return actor;
}

function normalizeKey(value: string): string {
  const key = value.trim();
  if (!KEY.test(key)) throw new RegistryValidationError("idempotencyKey is invalid");
  return key;
}

function asIntent(value: unknown): FoundationalActionIntent {
  return value as FoundationalActionIntent;
}

function currentAction(
  database: DatabaseSync,
  input: { workspaceId: string; jurisdiction: string; targetId: string; actionCode: string; topK?: number },
  clock: () => Date,
) {
  const snapshot = buildFoundationalRemediationQueueSnapshot(
    database,
    {
      workspaceId: input.workspaceId,
      jurisdiction: input.jurisdiction,
      targetId: input.targetId,
      topK: input.topK,
    },
    clock,
  );
  const item = snapshot.remediationQueue.items.find((candidate) => candidate.targetId === input.targetId);
  if (!item) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_ACTION_NOT_CURRENTLY_REQUIRED",
      `Foundational target ${input.targetId} has no current remediation action`,
    );
  }
  const action = item.actions.find((candidate) => candidate.code === input.actionCode);
  if (!action) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_ACTION_NOT_CURRENTLY_REQUIRED",
      `Action ${input.actionCode} is not a current remediation action for ${input.targetId}`,
      { stage: item.stage, availableActionCodes: item.actions.map((candidate) => candidate.code) },
    );
  }
  return { snapshot, item, action };
}

export function createFoundationalActionIntent(
  database: DatabaseSync,
  input: CreateFoundationalActionIntentInput,
  clock: () => Date = () => new Date(),
): FoundationalActionIntent {
  const workspaceId = input.workspaceId.trim();
  const targetId = input.targetId.trim();
  const actionCode = input.actionCode.trim();
  if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
  if (!targetId) throw new RegistryValidationError("targetId is required");
  if (!actionCode) throw new RegistryValidationError("actionCode is required");
  const jurisdiction = normalizeFoundationalJurisdiction(input.jurisdiction);
  const requestedByActorId = normalizeActor(input.requestedByActorId, "requestedByActorId");
  const idempotencyKey = normalizeKey(input.idempotencyKey);
  const { snapshot, action } = currentAction(
    database,
    { workspaceId, jurisdiction, targetId, actionCode, topK: input.topK },
    clock,
  );
  const createdAt = clock().toISOString();
  const intent = assembleFoundationalActionIntent({
    intentId: foundationalActionIntentId(workspaceId, idempotencyKey),
    workspaceId,
    jurisdiction,
    targetId,
    action,
    requestedByActorId,
    idempotencyKey,
    readinessProtocolVersion: snapshot.readiness.protocolVersion,
    queueProtocolVersion: snapshot.remediationQueue.protocolVersion,
    sourceSnapshotObservedAt: snapshot.observedAt,
    createdAt,
  });
  return asIntent(new SqliteFoundationalActionIntentRepository(database, clock).create(intent));
}

export function approveFoundationalActionIntent(
  database: DatabaseSync,
  intentId: string,
  actorIdRaw: string,
  clock: () => Date = () => new Date(),
): FoundationalActionIntent {
  const repository = new SqliteFoundationalActionIntentRepository(database, clock);
  const stored = repository.getById(intentId);
  if (!stored) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_ACTION_INTENT_NOT_FOUND",
      `Foundational action intent ${intentId.trim()} was not found`,
    );
  }
  if (stored.status === "CANCELED") {
    throw new RegistryConflictError(
      "FOUNDATIONAL_ACTION_INTENT_FINALIZED",
      "Canceled foundational action intents cannot be approved",
    );
  }
  const { item, action } = currentAction(
    database,
    {
      workspaceId: stored.workspaceId,
      jurisdiction: stored.jurisdiction,
      targetId: stored.targetId,
      actionCode: stored.actionCode,
    },
    clock,
  );
  if (
    item.stage !== stored.readinessStage ||
    action.executionPath !== stored.executionPath ||
    action.collectionAuthorizationRequired !== stored.collectionAuthorizationRequired
  ) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_ACTION_INTENT_STALE",
      "The foundational readiness/action policy changed after this intent was created; create a new intent from the current queue",
      {
        storedStage: stored.readinessStage,
        currentStage: item.stage,
        actionCode: stored.actionCode,
      },
    );
  }
  const actorId = normalizeActor(actorIdRaw, "actorId");
  return asIntent(repository.approve(stored.intentId, actorId));
}

export function cancelFoundationalActionIntent(
  database: DatabaseSync,
  intentId: string,
  actorIdRaw: string,
  clock: () => Date = () => new Date(),
): FoundationalActionIntent {
  const actorId = normalizeActor(actorIdRaw, "actorId");
  return asIntent(new SqliteFoundationalActionIntentRepository(database, clock).cancel(intentId, actorId));
}

export function listFoundationalActionIntents(
  database: DatabaseSync,
  filters: ListFoundationalActionIntentFilters,
): FoundationalActionIntent[] {
  const workspaceId = filters.workspaceId.trim();
  if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
  const jurisdiction = filters.jurisdiction?.trim()
    ? normalizeFoundationalJurisdiction(filters.jurisdiction)
    : undefined;
  let status: FoundationalActionIntentStatus | undefined;
  if (filters.status?.trim()) {
    const candidate = filters.status.trim() as FoundationalActionIntentStatus;
    if (!FOUNDATIONAL_ACTION_INTENT_STATUSES.includes(candidate)) {
      throw new RegistryValidationError("status is invalid");
    }
    status = candidate;
  }
  const limit = filters.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 100) {
    throw new RegistryValidationError("limit must be an integer between 1 and 100");
  }
  return new SqliteFoundationalActionIntentRepository(database)
    .list({
      workspaceId,
      jurisdiction,
      targetId: filters.targetId?.trim() || undefined,
      status,
      limit,
    })
    .map(asIntent);
}
