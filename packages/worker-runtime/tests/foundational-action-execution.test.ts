import { describe, expect, it } from "vitest";
import { assembleFoundationalActionExecution } from "../src/foundational-action-execution";

describe("foundational action execution protocol", () => {
  it("assembles only the explicit governed collection dispatch shape", () => {
    const execution = assembleFoundationalActionExecution({
      executionId: "fae_0123456789abcdef0123456789abcdef",
      intentId: "fai_0123456789abcdef0123456789abcdef",
      workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      jurisdiction: "US",
      targetId: "us-uspto-trademarks-root",
      requestedByActorId: "operator:mile",
      approvedByActorId: "reviewer:alice",
      executedByActorId: "operator:mile",
      sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      planId: "pln_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      runId: "run_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      jobIds: ["job_01ARZ3NDEKTSV4RRFFQ69G5FAV"],
      runStatusAtDispatch: "PENDING",
      idempotencyKey: "m24-us-root-dispatch",
      intentUpdatedAt: "2026-08-10T00:00:02.000Z",
      sourceSnapshotObservedAt: "2026-08-10T00:00:03.000Z",
      revalidatedAt: "2026-08-10T00:00:03.000Z",
      dispatchedAt: "2026-08-10T00:00:04.000Z",
    });

    expect(execution.readinessStage).toBe("COLLECT");
    expect(execution.actionCode).toBe("DISPATCH_GOVERNED_COLLECTION");
    expect(execution.approvalMode).toBe("APPROVED_INTENT_PLUS_EXPLICIT_EXECUTE");
    expect(execution.collectionAuthorization).toBe("EXPLICIT_SINGLE_TARGET_MANUAL_DISPATCH");
    expect(execution.executionAuthorization).toBe("CONSUMED_BY_DISPATCH");
    expect(execution.automaticExecution).toBe(false);
    expect(execution.explicitExecute).toBe(true);
    expect(execution.replayed).toBe(false);
  });
});
