import type { FoundationalReadinessStage } from "./foundational-readiness";
import type {
  FoundationalRemediationAction,
  FoundationalRemediationActionCode,
  FoundationalRemediationExecutionPath,
} from "./foundational-remediation-queue";

export const FOUNDATIONAL_ACTION_INTENT_PROTOCOL_VERSION = "1.0" as const;

export const FOUNDATIONAL_ACTION_INTENT_STATUSES = [
  "PENDING_APPROVAL",
  "APPROVED",
  "CANCELED",
] as const;

export type FoundationalActionIntentStatus = (typeof FOUNDATIONAL_ACTION_INTENT_STATUSES)[number];

export type FoundationalActionIntent = {
  protocolVersion: typeof FOUNDATIONAL_ACTION_INTENT_PROTOCOL_VERSION;
  objectType: "FOUNDATIONAL_ACTION_INTENT";
  intentId: string;
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  readinessStage: Exclude<FoundationalReadinessStage, "READY">;
  actionCode: FoundationalRemediationActionCode;
  operatorInstruction: string;
  executionPath: FoundationalRemediationExecutionPath;
  collectionAuthorizationRequired: boolean;
  automaticExecution: false;
  executionAuthorization: "NONE";
  requestedByActorId: string;
  approvalRequired: true;
  approvedByActorId: string | null;
  canceledByActorId: string | null;
  status: FoundationalActionIntentStatus;
  idempotencyKey: string;
  readinessProtocolVersion: string;
  queueProtocolVersion: string;
  sourceSnapshotObservedAt: string;
  createdAt: string;
  updatedAt: string;
  replayed: boolean;
};

export type AssembleFoundationalActionIntentInput = {
  intentId: string;
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  action: FoundationalRemediationAction;
  requestedByActorId: string;
  idempotencyKey: string;
  readinessProtocolVersion: string;
  queueProtocolVersion: string;
  sourceSnapshotObservedAt: string;
  createdAt: string;
};

export function assembleFoundationalActionIntent(
  input: AssembleFoundationalActionIntentInput,
): FoundationalActionIntent {
  return {
    protocolVersion: FOUNDATIONAL_ACTION_INTENT_PROTOCOL_VERSION,
    objectType: "FOUNDATIONAL_ACTION_INTENT",
    intentId: input.intentId,
    workspaceId: input.workspaceId,
    jurisdiction: input.jurisdiction,
    targetId: input.targetId,
    readinessStage: input.action.stage,
    actionCode: input.action.code,
    operatorInstruction: input.action.operatorInstruction,
    executionPath: input.action.executionPath,
    collectionAuthorizationRequired: input.action.collectionAuthorizationRequired,
    automaticExecution: false,
    executionAuthorization: "NONE",
    requestedByActorId: input.requestedByActorId,
    approvalRequired: true,
    approvedByActorId: null,
    canceledByActorId: null,
    status: "PENDING_APPROVAL",
    idempotencyKey: input.idempotencyKey,
    readinessProtocolVersion: input.readinessProtocolVersion,
    queueProtocolVersion: input.queueProtocolVersion,
    sourceSnapshotObservedAt: input.sourceSnapshotObservedAt,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    replayed: false,
  };
}
