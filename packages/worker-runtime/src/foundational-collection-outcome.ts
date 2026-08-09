import type { CollectionRunStatus } from "@markorbit/contracts";

export const FOUNDATIONAL_COLLECTION_OUTCOME_PROTOCOL_VERSION = "1.0" as const;

export const FOUNDATIONAL_COLLECTION_OUTCOME_STATES = [
  "ACTIVE",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "MISSING_RUN",
] as const;
export type FoundationalCollectionOutcomeState =
  (typeof FOUNDATIONAL_COLLECTION_OUTCOME_STATES)[number];

export const FOUNDATIONAL_COLLECTION_RETRY_DISPOSITIONS = [
  "BLOCKED_ACTIVE_RUN",
  "NO_ACTION_REQUIRED",
  "REQUIRES_NEW_APPROVAL",
  "REVIEW_COMPLETED_COLLECTION",
  "BLOCKED_MISSING_RUN",
] as const;
export type FoundationalCollectionRetryDisposition =
  (typeof FOUNDATIONAL_COLLECTION_RETRY_DISPOSITIONS)[number];

export type FoundationalCollectionOutcome = {
  protocolVersion: typeof FOUNDATIONAL_COLLECTION_OUTCOME_PROTOCOL_VERSION;
  objectType: "FOUNDATIONAL_COLLECTION_OUTCOME";
  executionId: string;
  intentId: string;
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  runId: string;
  runStatus: CollectionRunStatus | null;
  runUpdatedAt: string | null;
  state: FoundationalCollectionOutcomeState;
  currentCollectionActionRequired: boolean;
  retryDisposition: FoundationalCollectionRetryDisposition;
  requiresNewIntent: boolean;
  automaticRetry: false;
  observedAt: string;
};

export function deriveFoundationalCollectionOutcomeState(
  runStatus: CollectionRunStatus | null,
): FoundationalCollectionOutcomeState {
  if (runStatus === null) return "MISSING_RUN";
  if (runStatus === "PENDING" || runStatus === "RUNNING") return "ACTIVE";
  if (runStatus === "COMPLETED") return "COMPLETED";
  if (runStatus === "FAILED") return "FAILED";
  return "CANCELLED";
}

export function deriveFoundationalCollectionRetryDisposition(input: {
  state: FoundationalCollectionOutcomeState;
  currentCollectionActionRequired: boolean;
}): {
  retryDisposition: FoundationalCollectionRetryDisposition;
  requiresNewIntent: boolean;
} {
  if (input.state === "MISSING_RUN") {
    return { retryDisposition: "BLOCKED_MISSING_RUN", requiresNewIntent: false };
  }
  if (input.state === "ACTIVE") {
    return { retryDisposition: "BLOCKED_ACTIVE_RUN", requiresNewIntent: false };
  }
  if (!input.currentCollectionActionRequired) {
    return { retryDisposition: "NO_ACTION_REQUIRED", requiresNewIntent: false };
  }
  if (input.state === "COMPLETED") {
    return { retryDisposition: "REVIEW_COMPLETED_COLLECTION", requiresNewIntent: true };
  }
  return { retryDisposition: "REQUIRES_NEW_APPROVAL", requiresNewIntent: true };
}

export function assembleFoundationalCollectionOutcome(input: {
  executionId: string;
  intentId: string;
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  runId: string;
  runStatus: CollectionRunStatus | null;
  runUpdatedAt: string | null;
  currentCollectionActionRequired: boolean;
  observedAt: string;
}): FoundationalCollectionOutcome {
  const state = deriveFoundationalCollectionOutcomeState(input.runStatus);
  const retry = deriveFoundationalCollectionRetryDisposition({
    state,
    currentCollectionActionRequired: input.currentCollectionActionRequired,
  });
  return {
    protocolVersion: FOUNDATIONAL_COLLECTION_OUTCOME_PROTOCOL_VERSION,
    objectType: "FOUNDATIONAL_COLLECTION_OUTCOME",
    executionId: input.executionId,
    intentId: input.intentId,
    workspaceId: input.workspaceId,
    jurisdiction: input.jurisdiction,
    targetId: input.targetId,
    runId: input.runId,
    runStatus: input.runStatus,
    runUpdatedAt: input.runUpdatedAt,
    state,
    currentCollectionActionRequired: input.currentCollectionActionRequired,
    retryDisposition: retry.retryDisposition,
    requiresNewIntent: retry.requiresNewIntent,
    automaticRetry: false,
    observedAt: input.observedAt,
  };
}
