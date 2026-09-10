import type { DatabaseSync } from "node:sqlite";
import type { CollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import {
  applyAdaptiveRecrawlCadenceForCompletedJob,
  type AdaptiveRecrawlApplyResult,
} from "@markorbit/persistence/adaptive-recrawl-cadence";
import type { ExecutionTransitionResult } from "@markorbit/persistence/worker-execution";

type CompletionTransition = Pick<ExecutionTransitionResult, "replayed"> & {
  attempt: Pick<ExecutionTransitionResult["attempt"], "jobId" | "completedAt" | "updatedAt">;
};

type Evaluator = typeof applyAdaptiveRecrawlCadenceForCompletedJob;
type WarnLogger = Pick<Console, "warn">;

export function applyAdaptiveRecrawlAfterCompletion(input: {
  database: DatabaseSync;
  plans: CollectionPlanRepository;
  transition: CompletionTransition;
  evaluator?: Evaluator;
  logger?: WarnLogger;
}): AdaptiveRecrawlApplyResult | null {
  if (input.transition.replayed) return null;
  const evaluator = input.evaluator ?? applyAdaptiveRecrawlCadenceForCompletedJob;
  const observedAt = new Date(
    input.transition.attempt.completedAt ?? input.transition.attempt.updatedAt,
  );
  try {
    return evaluator(input.database, input.plans, input.transition.attempt.jobId, observedAt);
  } catch (error) {
    (input.logger ?? console).warn("Adaptive recrawl cadence evaluation failed", {
      jobId: input.transition.attempt.jobId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
