import type { SourceCompatibilityReprobeExecution } from "@markorbit/persistence/source-compatibility-reprobe-executions";
import type { FoundationalActionIntent } from "@markorbit/worker-runtime/foundational-action-intent";
import type { FoundationalRemediationQueueSnapshot } from "@markorbit/worker-runtime/foundational-remediation-snapshot";
import { latestIntentForAction } from "./foundational-operator-state";

export type ControlledCompatibilityReprobeAction = {
  targetId: string;
  actionCode: "REPROBE_SOURCE_COMPATIBILITY";
  stage: "HEALTH";
  operatorInstruction: string;
  executionPath: "MANUAL_OPERATOR";
  collectionAuthorizationRequired: false;
  automaticExecution: false;
};

export type CompatibilityReprobePhase =
  | "REQUEST_APPROVAL"
  | "PENDING_APPROVAL"
  | "READY_FOR_WORKER"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED_REAPPROVAL_REQUIRED";

export function listControlledCompatibilityReprobeActions(
  snapshot: FoundationalRemediationQueueSnapshot,
): ControlledCompatibilityReprobeAction[] {
  const actions: ControlledCompatibilityReprobeAction[] = [];
  for (const item of snapshot.remediationQueue.items) {
    if (item.stage !== "HEALTH") continue;
    for (const action of item.actions) {
      if (
        action.code !== "REPROBE_SOURCE_COMPATIBILITY" ||
        action.executionPath !== "MANUAL_OPERATOR" ||
        action.collectionAuthorizationRequired !== false ||
        action.automaticExecution !== false
      ) {
        continue;
      }
      actions.push({
        targetId: item.targetId,
        actionCode: "REPROBE_SOURCE_COMPATIBILITY",
        stage: "HEALTH",
        operatorInstruction: action.operatorInstruction,
        executionPath: "MANUAL_OPERATOR",
        collectionAuthorizationRequired: false,
        automaticExecution: false,
      });
    }
  }
  return actions;
}

export function latestCompatibilityReprobeIntent(
  intents: readonly FoundationalActionIntent[],
  targetId: string,
): FoundationalActionIntent | null {
  return latestIntentForAction(intents, targetId, "REPROBE_SOURCE_COMPATIBILITY");
}

export function compatibilityReprobeExecutionForIntent(
  executions: readonly SourceCompatibilityReprobeExecution[],
  intentId: string,
): SourceCompatibilityReprobeExecution | null {
  return executions.find((execution) => execution.intentId === intentId) ?? null;
}

export function compatibilityReprobePhase(
  intent: FoundationalActionIntent | null,
  execution: SourceCompatibilityReprobeExecution | null,
): CompatibilityReprobePhase {
  if (!intent || intent.status === "CANCELED") return "REQUEST_APPROVAL";
  if (intent.status === "PENDING_APPROVAL") return "PENDING_APPROVAL";
  if (!execution) return "READY_FOR_WORKER";
  if (execution.status === "STARTED") return "RUNNING";
  if (execution.status === "COMPLETED") return "COMPLETED";
  return "FAILED_REAPPROVAL_REQUIRED";
}

export function compatibilityReprobeIntentIdempotencyKey(input: {
  jurisdiction: string;
  targetId: string;
  observedAt: string;
  nonce: string;
}): string {
  const observed = input.observedAt.replace(/[^0-9TZ]/g, "");
  const nonce = input.nonce.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 36) || "manual";
  return `compat-reprobe:${input.jurisdiction}:${input.targetId}:${observed}:${nonce}`.slice(0, 200);
}

export function compatibilityReprobeExecutionIdempotencyKey(intentId: string): string {
  return `compat-reprobe-exec:${intentId}`.slice(0, 200);
}

export function compatibilityReprobeWorkerCommand(input: {
  intentId: string;
  executedByActorId: string;
}): string {
  const idempotencyKey = compatibilityReprobeExecutionIdempotencyKey(input.intentId);
  return [
    "pnpm --filter @markorbit/worker operate:compatibility-reprobe --",
    `--intent-id=${input.intentId}`,
    `--executed-by=${input.executedByActorId}`,
    `--idempotency-key=${idempotencyKey}`,
  ].join(" ");
}
