import { describe, expect, it } from "vitest";
import type { FoundationalActionExecution } from "@markorbit/worker-runtime/foundational-action-execution";
import type { FoundationalActionIntent } from "@markorbit/worker-runtime/foundational-action-intent";
import type { FoundationalRemediationQueueSnapshot } from "@markorbit/worker-runtime/foundational-remediation-snapshot";
import {
  foundationalOperatorPhase,
  latestIntentForAction,
  listControlledCollectionActions,
  operatorExecutionIdempotencyKey,
  operatorIntentIdempotencyKey,
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

describe("M25 foundational operator state", () => {
  it("exposes only explicitly governed COLLECT actions", () => {
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
