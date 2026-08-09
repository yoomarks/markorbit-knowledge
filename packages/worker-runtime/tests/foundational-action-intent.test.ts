import { describe, expect, it } from "vitest";
import { assembleFoundationalActionIntent } from "../src/foundational-action-intent";

describe("foundational action intent protocol", () => {
  it("creates a pending intent that carries no execution authorization", () => {
    const intent = assembleFoundationalActionIntent({
      intentId: "fai_0123456789abcdef0123456789abcdef",
      workspaceId: "wsp_test",
      jurisdiction: "US",
      targetId: "us-uspto-tmep-current",
      action: {
        code: "DISPATCH_GOVERNED_COLLECTION",
        stage: "COLLECT",
        gapCodes: ["NO_ACQUISITION_EVIDENCE"],
        operatorInstruction: "Review and explicitly dispatch.",
        executionPath: "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH",
        collectionAuthorizationRequired: true,
        automaticExecution: false,
        endpoint: null,
      },
      requestedByActorId: "operator:mile",
      idempotencyKey: "m23-intent-1",
      readinessProtocolVersion: "1.2",
      queueProtocolVersion: "1.0",
      sourceSnapshotObservedAt: "2026-08-10T00:00:00.000Z",
      createdAt: "2026-08-10T00:00:01.000Z",
    });

    expect(intent.status).toBe("PENDING_APPROVAL");
    expect(intent.approvalRequired).toBe(true);
    expect(intent.automaticExecution).toBe(false);
    expect(intent.executionAuthorization).toBe("NONE");
    expect(intent.collectionAuthorizationRequired).toBe(true);
    expect(intent.approvedByActorId).toBeNull();
    expect(intent.canceledByActorId).toBeNull();
  });
});
