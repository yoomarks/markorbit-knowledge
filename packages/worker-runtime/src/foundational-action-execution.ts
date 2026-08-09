import type { CollectionRunStatus } from "@markorbit/contracts";

export const FOUNDATIONAL_ACTION_EXECUTION_PROTOCOL_VERSION = "1.0" as const;

export type FoundationalActionExecution = {
  protocolVersion: typeof FOUNDATIONAL_ACTION_EXECUTION_PROTOCOL_VERSION;
  objectType: "FOUNDATIONAL_ACTION_EXECUTION";
  executionId: string;
  intentId: string;
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  readinessStage: "COLLECT";
  actionCode: "DISPATCH_GOVERNED_COLLECTION";
  executionPath: "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH";
  status: "DISPATCHED";
  requestedByActorId: string;
  approvedByActorId: string;
  executedByActorId: string;
  approvalMode: "APPROVED_INTENT_PLUS_EXPLICIT_EXECUTE";
  explicitExecute: true;
  automaticExecution: false;
  collectionAuthorization: "EXPLICIT_SINGLE_TARGET_MANUAL_DISPATCH";
  executionAuthorization: "CONSUMED_BY_DISPATCH";
  sourceId: string;
  planId: string;
  runId: string;
  jobIds: string[];
  runStatusAtDispatch: CollectionRunStatus;
  idempotencyKey: string;
  intentUpdatedAt: string;
  sourceSnapshotObservedAt: string;
  revalidatedAt: string;
  dispatchedAt: string;
  replayed: boolean;
};

export type AssembleFoundationalActionExecutionInput = Omit<
  FoundationalActionExecution,
  | "protocolVersion"
  | "objectType"
  | "readinessStage"
  | "actionCode"
  | "executionPath"
  | "status"
  | "approvalMode"
  | "explicitExecute"
  | "automaticExecution"
  | "collectionAuthorization"
  | "executionAuthorization"
  | "replayed"
>;

export function assembleFoundationalActionExecution(
  input: AssembleFoundationalActionExecutionInput,
): FoundationalActionExecution {
  return {
    protocolVersion: FOUNDATIONAL_ACTION_EXECUTION_PROTOCOL_VERSION,
    objectType: "FOUNDATIONAL_ACTION_EXECUTION",
    executionId: input.executionId,
    intentId: input.intentId,
    workspaceId: input.workspaceId,
    jurisdiction: input.jurisdiction,
    targetId: input.targetId,
    readinessStage: "COLLECT",
    actionCode: "DISPATCH_GOVERNED_COLLECTION",
    executionPath: "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH",
    status: "DISPATCHED",
    requestedByActorId: input.requestedByActorId,
    approvedByActorId: input.approvedByActorId,
    executedByActorId: input.executedByActorId,
    approvalMode: "APPROVED_INTENT_PLUS_EXPLICIT_EXECUTE",
    explicitExecute: true,
    automaticExecution: false,
    collectionAuthorization: "EXPLICIT_SINGLE_TARGET_MANUAL_DISPATCH",
    executionAuthorization: "CONSUMED_BY_DISPATCH",
    sourceId: input.sourceId,
    planId: input.planId,
    runId: input.runId,
    jobIds: [...input.jobIds],
    runStatusAtDispatch: input.runStatusAtDispatch,
    idempotencyKey: input.idempotencyKey,
    intentUpdatedAt: input.intentUpdatedAt,
    sourceSnapshotObservedAt: input.sourceSnapshotObservedAt,
    revalidatedAt: input.revalidatedAt,
    dispatchedAt: input.dispatchedAt,
    replayed: false,
  };
}
