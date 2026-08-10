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

export type ControlledConversionRecoveryAction = {
  targetId: string;
  actionCode: "RUN_CONVERSION_RECOVERY";
  stage: "CONVERT";
  operatorInstruction: string;
  executionPath: "CONVERSION_RECOVERY";
  collectionAuthorizationRequired: false;
  automaticExecution: false;
};

export type ControlledVerifiedCanonicalReindexAction = {
  targetId: string;
  actionCode: "REINDEX_VERIFIED_CANONICAL";
  stage: "INDEX";
  operatorInstruction: string;
  executionPath: "CANONICAL_INDEXING";
  collectionAuthorizationRequired: false;
  automaticExecution: false;
};

export type ControlledQualityRemediationAction = {
  targetId: string;
  actionCode: "OPEN_RETRIEVAL_REMEDIATION_PLAN";
  stage: "QUALITY";
  operatorInstruction: string;
  executionPath: "M16_PLANNER_THEN_M17_EXPLICIT_OPERATOR";
  collectionAuthorizationRequired: false;
  automaticExecution: false;
};

export type ControlledRelevanceAuditAction = {
  targetId: string;
  actionCode:
    | "REVIEW_RELEVANCE_AUDIT_COVERAGE"
    | "REVIEW_RELEVANCE_PROBE_CONFIG"
    | "REVIEW_SOURCE_FILTERED_RETRIEVAL"
    | "REVIEW_GLOBAL_RETRIEVAL_RANKING"
    | "REVIEW_RELEVANCE_AUDIT";
  stage: "RELEVANCE";
  operatorInstruction: string;
  executionPath: "M18_RELEVANCE_AUDIT";
  collectionAuthorizationRequired: false;
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

export function listControlledConversionRecoveryActions(
  snapshot: FoundationalRemediationQueueSnapshot,
): ControlledConversionRecoveryAction[] {
  const actions: ControlledConversionRecoveryAction[] = [];
  for (const item of snapshot.remediationQueue.items) {
    if (item.stage !== "CONVERT") continue;
    for (const action of item.actions) {
      if (
        action.code !== "RUN_CONVERSION_RECOVERY" ||
        action.executionPath !== "CONVERSION_RECOVERY" ||
        action.collectionAuthorizationRequired !== false ||
        action.automaticExecution !== false
      ) {
        continue;
      }
      actions.push({
        targetId: item.targetId,
        actionCode: action.code,
        stage: "CONVERT",
        operatorInstruction: action.operatorInstruction,
        executionPath: action.executionPath,
        collectionAuthorizationRequired: false,
        automaticExecution: false,
      });
    }
  }
  return actions;
}

export function listControlledVerifiedCanonicalReindexActions(
  snapshot: FoundationalRemediationQueueSnapshot,
): ControlledVerifiedCanonicalReindexAction[] {
  const actions: ControlledVerifiedCanonicalReindexAction[] = [];
  for (const item of snapshot.remediationQueue.items) {
    if (item.stage !== "INDEX") continue;
    for (const action of item.actions) {
      if (
        action.code !== "REINDEX_VERIFIED_CANONICAL" ||
        action.executionPath !== "CANONICAL_INDEXING" ||
        action.collectionAuthorizationRequired !== false ||
        action.automaticExecution !== false
      ) {
        continue;
      }
      actions.push({
        targetId: item.targetId,
        actionCode: action.code,
        stage: "INDEX",
        operatorInstruction: action.operatorInstruction,
        executionPath: action.executionPath,
        collectionAuthorizationRequired: false,
        automaticExecution: false,
      });
    }
  }
  return actions;
}

export function listControlledQualityRemediationActions(
  snapshot: FoundationalRemediationQueueSnapshot,
): ControlledQualityRemediationAction[] {
  const actions: ControlledQualityRemediationAction[] = [];
  for (const item of snapshot.remediationQueue.items) {
    if (item.stage !== "QUALITY") continue;
    for (const action of item.actions) {
      if (
        action.code !== "OPEN_RETRIEVAL_REMEDIATION_PLAN" ||
        action.executionPath !== "M16_PLANNER_THEN_M17_EXPLICIT_OPERATOR" ||
        action.collectionAuthorizationRequired !== false ||
        action.automaticExecution !== false
      ) {
        continue;
      }
      actions.push({
        targetId: item.targetId,
        actionCode: action.code,
        stage: "QUALITY",
        operatorInstruction: action.operatorInstruction,
        executionPath: action.executionPath,
        collectionAuthorizationRequired: false,
        automaticExecution: false,
      });
    }
  }
  return actions;
}

const RELEVANCE_ACTION_CODES = new Set<ControlledRelevanceAuditAction["actionCode"]>([
  "REVIEW_RELEVANCE_AUDIT_COVERAGE",
  "REVIEW_RELEVANCE_PROBE_CONFIG",
  "REVIEW_SOURCE_FILTERED_RETRIEVAL",
  "REVIEW_GLOBAL_RETRIEVAL_RANKING",
  "REVIEW_RELEVANCE_AUDIT",
]);

export function listControlledRelevanceAuditActions(
  snapshot: FoundationalRemediationQueueSnapshot,
): ControlledRelevanceAuditAction[] {
  const actions: ControlledRelevanceAuditAction[] = [];
  for (const item of snapshot.remediationQueue.items) {
    if (item.stage !== "RELEVANCE") continue;
    for (const action of item.actions) {
      if (
        !RELEVANCE_ACTION_CODES.has(action.code as ControlledRelevanceAuditAction["actionCode"]) ||
        action.executionPath !== "M18_RELEVANCE_AUDIT" ||
        action.collectionAuthorizationRequired !== false ||
        action.automaticExecution !== false
      ) {
        continue;
      }
      actions.push({
        targetId: item.targetId,
        actionCode: action.code as ControlledRelevanceAuditAction["actionCode"],
        stage: "RELEVANCE",
        operatorInstruction: action.operatorInstruction,
        executionPath: "M18_RELEVANCE_AUDIT",
        collectionAuthorizationRequired: false,
        automaticExecution: false,
      });
    }
  }
  return actions;
}

export function conversionRecoveryStateAllowsOperatorRetry(state: string): boolean {
  return state === "WAITING" || state === "DEAD_LETTERED";
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
