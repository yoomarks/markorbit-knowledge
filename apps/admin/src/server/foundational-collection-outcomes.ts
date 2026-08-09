import { DatabaseSync } from "node:sqlite";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteExecutionLedgerRepository } from "@markorbit/persistence/execution-ledger";
import { SqliteFoundationalActionExecutionRepository } from "@markorbit/persistence/foundational-action-executions";
import {
  FOUNDATIONAL_COLLECTION_OUTCOME_PROTOCOL_VERSION,
  assembleFoundationalCollectionOutcome,
  type FoundationalCollectionOutcome,
} from "@markorbit/worker-runtime/foundational-collection-outcome";
import { normalizeFoundationalJurisdiction } from "@markorbit/worker-runtime/foundational-readiness";
import { buildFoundationalRemediationQueueSnapshot } from "./foundational-remediation-queue";

export type FoundationalCollectionOutcomeFilters = {
  workspaceId: string;
  jurisdiction: string;
  targetId?: string;
  limit?: number;
};

export type FoundationalCollectionOutcomeList = {
  protocolVersion: typeof FOUNDATIONAL_COLLECTION_OUTCOME_PROTOCOL_VERSION;
  objectType: "FOUNDATIONAL_COLLECTION_OUTCOME_LIST";
  workspaceId: string;
  jurisdiction: string;
  observedAt: string;
  automaticRetry: false;
  items: FoundationalCollectionOutcome[];
};

function currentCollectionTargets(
  database: DatabaseSync,
  filters: { workspaceId: string; jurisdiction: string; targetId?: string },
  clock: () => Date,
): { observedAt: string; targetIds: Set<string> } {
  const snapshot = buildFoundationalRemediationQueueSnapshot(
    database,
    {
      workspaceId: filters.workspaceId,
      jurisdiction: filters.jurisdiction,
      targetId: filters.targetId,
    },
    clock,
  );
  const targetIds = new Set<string>();
  for (const item of snapshot.remediationQueue.items) {
    if (item.stage !== "COLLECT") continue;
    if (
      item.actions.some(
        (action) =>
          action.code === "DISPATCH_GOVERNED_COLLECTION" &&
          action.executionPath === "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH" &&
          action.collectionAuthorizationRequired === true &&
          action.automaticExecution === false,
      )
    ) {
      targetIds.add(item.targetId);
    }
  }
  return { observedAt: snapshot.observedAt, targetIds };
}

export function listFoundationalCollectionOutcomes(
  database: DatabaseSync,
  filters: FoundationalCollectionOutcomeFilters,
  clock: () => Date = () => new Date(),
): FoundationalCollectionOutcomeList {
  const workspaceId = filters.workspaceId.trim();
  if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
  const jurisdiction = normalizeFoundationalJurisdiction(filters.jurisdiction);
  const targetId = filters.targetId?.trim() || undefined;
  const limit = filters.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 100) {
    throw new RegistryValidationError("limit must be an integer between 1 and 100");
  }

  const current = currentCollectionTargets(
    database,
    { workspaceId, jurisdiction, targetId },
    clock,
  );
  const executions = new SqliteFoundationalActionExecutionRepository(database).list({
    workspaceId,
    jurisdiction,
    targetId,
    limit,
  });
  const runRepository = new SqliteExecutionLedgerRepository(database, clock);
  const items = executions.map((execution) => {
    const runRecord = runRepository.getById(execution.runId);
    return assembleFoundationalCollectionOutcome({
      executionId: execution.executionId,
      intentId: execution.intentId,
      workspaceId: execution.workspaceId,
      jurisdiction: execution.jurisdiction,
      targetId: execution.targetId,
      runId: execution.runId,
      runStatus: runRecord?.run.status ?? null,
      runUpdatedAt: runRecord?.run.updatedAt ?? null,
      currentCollectionActionRequired: current.targetIds.has(execution.targetId),
      observedAt: current.observedAt,
    });
  });

  return {
    protocolVersion: FOUNDATIONAL_COLLECTION_OUTCOME_PROTOCOL_VERSION,
    objectType: "FOUNDATIONAL_COLLECTION_OUTCOME_LIST",
    workspaceId,
    jurisdiction,
    observedAt: current.observedAt,
    automaticRetry: false,
    items,
  };
}
