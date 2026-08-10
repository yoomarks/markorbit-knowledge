import { describe, expect, it } from "vitest";
import type { FoundationalActionExecution } from "@markorbit/worker-runtime/foundational-action-execution";
import type { FoundationalActionIntent } from "@markorbit/worker-runtime/foundational-action-intent";
import type { FoundationalCollectionOutcome } from "@markorbit/worker-runtime/foundational-collection-outcome";
import type { FoundationalRemediationQueueSnapshot } from "@markorbit/worker-runtime/foundational-remediation-snapshot";
import {
  conversionRecoveryStateAllowsOperatorRetry,
  foundationalOperatorPhase,
  latestIntentForAction,
  listControlledCollectionActions,
  listControlledConversionRecoveryActions,
  listControlledVerifiedCanonicalReindexActions,
  operatorExecutionIdempotencyKey,
  operatorIntentIdempotencyKey,
  outcomeForExecution,
} from "./foundational-operator-state";

function intent(
  status: FoundationalActionIntent["status"],
  updatedAt: string,
  intentId = "fai_0123456789abcdef0123456789abcdef",
): FoundationalActionIntent {
  return {
    protocolVersion: "1.0",
    objectType: "FOUNDATIONAL_ACTION_INTENT",
    intentId,
    workspaceId: "wsp_test",
    jurisdiction: "US",
    targetId: "us-uspto-tmep-current",
    readinessStage: "COLLECT",
    actionCode: "DISPATCH_GOVERNED_COLLECTION",
    operatorInstruction: "Dispatch governed collection",
    executionPath: "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH",
    collectionAuthorizationRequired: true,
    automaticExecution: false,
    executionAuthorization: "NONE",
    requestedByActorId: "operator:local-admin",
    approvalRequired: true,
    approvedByActorId: status === "APPROVED" ? "reviewer:local-admin" : null,
    canceledByActorId: status === "CANCELED" ? "operator:local-admin" : null,
    status,
    idempotencyKey: "m25:test",
    readinessProtocolVersion: "1.2",
    queueProtocolVersion: "1.0",
    sourceSnapshotObservedAt: "2026-08-10T00:00:00.000Z",
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt,
    replayed: false,
  };
}

function execution(intentId: string): FoundationalActionExecution {
  return {
    protocolVersion: "1.0",
    objectType: "FOUNDATIONAL_ACTION_EXECUTION",
    executionId: "fae_0123456789abcdef0123456789abcdef",
    intentId,
    workspaceId: "wsp_test",
    jurisdiction: "US",
    targetId: "us-uspto-tmep-current",
    readinessStage: "COLLECT",
    actionCode: "DISPATCH_GOVERNED_COLLECTION",
    executionPath: "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH",
    status: "DISPATCHED",
    requestedByActorId: "operator:local-admin",
    approvedByActorId: "reviewer:local-admin",
    executedByActorId: "operator:local-admin",
    approvalMode: "APPROVED_INTENT_PLUS_EXPLICIT_EXECUTE",
    explicitExecute: true,
    automaticExecution: false,
    collectionAuthorization: "EXPLICIT_SINGLE_TARGET_MANUAL_DISPATCH",
    executionAuthorization: "CONSUMED_BY_DISPATCH",
    sourceId: "src_test",
    planId: "pln_test",
    runId: "run_test",
    jobIds: ["job_test"],
    runStatusAtDispatch: "PENDING",
    idempotencyKey: "m25-exec:test",
    intentUpdatedAt: "2026-08-10T00:01:00.000Z",
    sourceSnapshotObservedAt: "2026-08-10T00:01:00.000Z",
    revalidatedAt: "2026-08-10T00:01:00.000Z",
    dispatchedAt: "2026-08-10T00:01:00.000Z",
    replayed: false,
  };
}

function outcome(
  executionId: string,
  retryDisposition: FoundationalCollectionOutcome["retryDisposition"],
): FoundationalCollectionOutcome {
  const state: FoundationalCollectionOutcome["state"] =
    retryDisposition === "BLOCKED_ACTIVE_RUN"
      ? "ACTIVE"
      : retryDisposition === "BLOCKED_MISSING_RUN"
        ? "MISSING_RUN"
        : retryDisposition === "REQUIRES_NEW_APPROVAL"
          ? "FAILED"
          : "COMPLETED";
  return {
    protocolVersion: "1.0",
    objectType: "FOUNDATIONAL_COLLECTION_OUTCOME",
    executionId,
    intentId: "fai_0123456789abcdef0123456789abcdef",
    workspaceId: "wsp_test",
    jurisdiction: "US",
    targetId: "us-uspto-tmep-current",
    runId: "run_test",
    runStatus:
      state === "ACTIVE"
        ? "RUNNING"
        : state === "FAILED"
          ? "FAILED"
          : state === "COMPLETED"
            ? "COMPLETED"
            : null,
    runUpdatedAt: "2026-08-10T00:02:00.000Z",
    state,
    currentCollectionActionRequired: retryDisposition !== "NO_ACTION_REQUIRED",
    retryDisposition,
    requiresNewIntent:
      retryDisposition === "REQUIRES_NEW_APPROVAL" ||
      retryDisposition === "REVIEW_COMPLETED_COLLECTION",
    automaticRetry: false,
    observedAt: "2026-08-10T00:03:00.000Z",
  };
}

describe("M28 foundational operator state", () => {
  it("exposes governed COLLECT, CONVERT and INDEX actions through separate paths", () => {
    const snapshot = {
      remediationQueue: {
        items: [
          {
            targetId: "us-uspto-tmep-current",
            stage: "COLLECT",
            actions: [
              {
                code: "DISPATCH_GOVERNED_COLLECTION",
                operatorInstruction: "Dispatch governed collection",
                executionPath: "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH",
                collectionAuthorizationRequired: true,
                automaticExecution: false,
              },
            ],
          },
          {
            targetId: "us-uspto-tbmp-current",
            stage: "CONVERT",
            actions: [
              {
                code: "RUN_CONVERSION_RECOVERY",
                operatorInstruction: "Review conversion recovery",
                executionPath: "CONVERSION_RECOVERY",
                collectionAuthorizationRequired: false,
                automaticExecution: false,
              },
            ],
          },
          {
            targetId: "us-uspto-tm-manual-current",
            stage: "INDEX",
            actions: [
              {
                code: "REINDEX_VERIFIED_CANONICAL",
                operatorInstruction: "Reindex verified canonical",
                executionPath: "CANONICAL_INDEXING",
                collectionAuthorizationRequired: false,
                automaticExecution: false,
              },
            ],
          },
        ],
      },
    } as unknown as FoundationalRemediationQueueSnapshot;

    expect(listControlledCollectionActions(snapshot)).toEqual([
      expect.objectContaining({
        targetId: "us-uspto-tmep-current",
        stage: "COLLECT",
        actionCode: "DISPATCH_GOVERNED_COLLECTION",
        automaticExecution: false,
      }),
    ]);
    expect(listControlledConversionRecoveryActions(snapshot)).toEqual([
      expect.objectContaining({
        targetId: "us-uspto-tbmp-current",
        stage: "CONVERT",
        actionCode: "RUN_CONVERSION_RECOVERY",
        executionPath: "CONVERSION_RECOVERY",
        automaticExecution: false,
      }),
    ]);
    expect(listControlledVerifiedCanonicalReindexActions(snapshot)).toEqual([
      expect.objectContaining({
        targetId: "us-uspto-tm-manual-current",
        stage: "INDEX",
        actionCode: "REINDEX_VERIFIED_CANONICAL",
        executionPath: "CANONICAL_INDEXING",
        automaticExecution: false,
      }),
    ]);
  });

  it("allows explicit operator retry only for M11 retryable terminal states", () => {
    expect(conversionRecoveryStateAllowsOperatorRetry("WAITING")).toBe(true);
    expect(conversionRecoveryStateAllowsOperatorRetry("DEAD_LETTERED")).toBe(true);
    expect(conversionRecoveryStateAllowsOperatorRetry("RUNNING")).toBe(false);
    expect(conversionRecoveryStateAllowsOperatorRetry("RESOLVED")).toBe(false);
  });

  it("keeps request, approval and execution as separate UI phases", () => {
    const pending = intent("PENDING_APPROVAL", "2026-08-10T00:01:00.000Z");
    const approved = intent("APPROVED", "2026-08-10T00:02:00.000Z");
    const canceled = intent("CANCELED", "2026-08-10T00:03:00.000Z");

    expect(foundationalOperatorPhase(null, null)).toBe("REQUEST_APPROVAL");
    expect(foundationalOperatorPhase(pending, null)).toBe("PENDING_APPROVAL");
    expect(foundationalOperatorPhase(approved, null)).toBe("READY_TO_EXECUTE");
    expect(foundationalOperatorPhase(approved, execution(approved.intentId))).toBe("DISPATCHED");
    expect(foundationalOperatorPhase(canceled, null)).toBe("REQUEST_APPROVAL");
  });

  it("uses live outcome feedback to block active duplicates and require fresh approval after failure", () => {
    const approved = intent("APPROVED", "2026-08-10T00:02:00.000Z");
    const dispatched = execution(approved.intentId);
    const active = outcome(dispatched.executionId, "BLOCKED_ACTIVE_RUN");
    const failed = outcome(dispatched.executionId, "REQUIRES_NEW_APPROVAL");
    const completedNeedsReview = outcome(dispatched.executionId, "REVIEW_COMPLETED_COLLECTION");
    const complete = outcome(dispatched.executionId, "NO_ACTION_REQUIRED");
    const missing = outcome(dispatched.executionId, "BLOCKED_MISSING_RUN");

    expect(foundationalOperatorPhase(approved, dispatched, active)).toBe("RUN_ACTIVE");
    expect(foundationalOperatorPhase(approved, dispatched, failed)).toBe("RETRY_APPROVAL_REQUIRED");
    expect(foundationalOperatorPhase(approved, dispatched, completedNeedsReview)).toBe(
      "REVIEW_COMPLETED_COLLECTION",
    );
    expect(foundationalOperatorPhase(approved, dispatched, complete)).toBe("RUN_COMPLETED");
    expect(foundationalOperatorPhase(approved, dispatched, missing)).toBe(
      "EXECUTION_INTEGRITY_BLOCKED",
    );
    expect(outcomeForExecution([active], dispatched.executionId)?.runStatus).toBe("RUNNING");
  });

  it("uses the newest matching intent and stable execution idempotency", () => {
    const older = intent(
      "PENDING_APPROVAL",
      "2026-08-10T00:01:00.000Z",
      "fai_11111111111111111111111111111111",
    );
    const newer = intent(
      "APPROVED",
      "2026-08-10T00:02:00.000Z",
      "fai_22222222222222222222222222222222",
    );
    expect(
      latestIntentForAction([older, newer], "us-uspto-tmep-current", "DISPATCH_GOVERNED_COLLECTION")
        ?.intentId,
    ).toBe(newer.intentId);
    expect(operatorExecutionIdempotencyKey(newer.intentId)).toBe(`m25-exec:${newer.intentId}`);
    expect(
      operatorIntentIdempotencyKey({
        jurisdiction: "US",
        targetId: "us-uspto-tmep-current",
        observedAt: "2026-08-10T00:00:00.000Z",
        nonce: "abc-123",
      }),
    ).toContain("m25:US:us-uspto-tmep-current:");
  });
});
