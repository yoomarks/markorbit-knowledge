import type { FoundationalActionExecution } from "@markorbit/worker-runtime/foundational-action-execution";
import type { FoundationalActionIntent } from "@markorbit/worker-runtime/foundational-action-intent";
import type { FoundationalCollectionOutcome } from "@markorbit/worker-runtime/foundational-collection-outcome";
import type { FoundationalRemediationQueueSnapshot } from "@markorbit/worker-runtime/foundational-remediation-snapshot";

export type ControlledCollectionAction = {
  targetId: string;
  actionCode: "DISPATCH_GOVERNED_COLLECTION";
  stage: "COLLECT";
  operatorInstruction: string;
  executionPath: "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH";
  collectionAuthorizationRequired: true;
  automaticExecution: false;
};

export type FoundationalOperatorPhase =
  | "REQUEST_APPROVAL"
  | "PENDING_APPROVAL"
  | "READY_TO_EXECUTE"
  | "DISPATCHED"
  | "RUN_ACTIVE"
  | "RUN_COMPLETED"
  | "RETRY_APPROVAL_REQUIRED"
  | "REVIEW_COMPLETED_COLLECTION"
  | "EXECUTION_INTEGRITY_BLOCKED";

export function listControlledCollectionActions(
  snapshot: FoundationalRemediationQueueSnapshot,
): ControlledCollectionAction[] {
  const actions: ControlledCollectionAction[] = [];
  for (const item of snapshot.remediationQueue.items) {
    if (item.stage !== "COLLECT") continue;
    for (const action of item.actions) {
      if (
        action.code !== "DISPATCH_GOVERNED_COLLECTION" ||
        action.executionPath !== "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH" ||
        action.collectionAuthorizationRequired !== true ||
        action.automaticExecution !== false
      ) {
        continue;
      }
      actions.push({
        targetId: item.targetId,
        actionCode: action.code,
        stage: "COLLECT",
        operatorInstruction: action.operatorInstruction,
        executionPath: action.executionPath,
        collectionAuthorizationRequired: true,
        automaticExecution: false,
      });
    }
  }
  return actions;
}

export function latestIntentForAction(
  intents: readonly FoundationalActionIntent[],
  targetId: string,
  actionCode: string,
): FoundationalActionIntent | null {
  return (
    intents
      .filter((intent) => intent.targetId === targetId && intent.actionCode === actionCode)
      .sort((left, right) => {
        const byUpdatedAt = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
        if (Number.isFinite(byUpdatedAt) && byUpdatedAt !== 0) return byUpdatedAt;
        return right.intentId.localeCompare(left.intentId);
      })[0] ?? null
  );
}

export function executionForIntent(
  executions: readonly FoundationalActionExecution[],
  intentId: string,
): FoundationalActionExecution | null {
  return executions.find((execution) => execution.intentId === intentId) ?? null;
}

export function outcomeForExecution(
  outcomes: readonly FoundationalCollectionOutcome[],
  executionId: string,
): FoundationalCollectionOutcome | null {
  return outcomes.find((outcome) => outcome.executionId === executionId) ?? null;
}

export function foundationalOperatorPhase(
  intent: FoundationalActionIntent | null,
  execution: FoundationalActionExecution | null,
  outcome: FoundationalCollectionOutcome | null = null,
): FoundationalOperatorPhase {
  if (!intent || intent.status === "CANCELED") return "REQUEST_APPROVAL";
  if (intent.status === "PENDING_APPROVAL") return "PENDING_APPROVAL";
  if (!execution) return "READY_TO_EXECUTE";
  if (!outcome) return "DISPATCHED";
  switch (outcome.retryDisposition) {
    case "BLOCKED_ACTIVE_RUN":
      return "RUN_ACTIVE";
    case "NO_ACTION_REQUIRED":
      return "RUN_COMPLETED";
    case "REQUIRES_NEW_APPROVAL":
      return "RETRY_APPROVAL_REQUIRED";
    case "REVIEW_COMPLETED_COLLECTION":
      return "REVIEW_COMPLETED_COLLECTION";
    case "BLOCKED_MISSING_RUN":
      return "EXECUTION_INTEGRITY_BLOCKED";
  }
}

export function operatorIntentIdempotencyKey(input: {
  jurisdiction: string;
  targetId: string;
  observedAt: string;
  nonce: string;
}): string {
  const observed = input.observedAt.replace(/[^0-9TZ]/g, "");
  const nonce = input.nonce.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 32) || "manual";
  return `m25:${input.jurisdiction}:${input.targetId}:${observed}:${nonce}`.slice(0, 200);
}

export function operatorExecutionIdempotencyKey(intentId: string): string {
  return `m25-exec:${intentId}`.slice(0, 200);
}
