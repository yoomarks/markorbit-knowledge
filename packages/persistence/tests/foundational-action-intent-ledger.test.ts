import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  SqliteFoundationalActionIntentRepository,
  foundationalActionIntentId,
  type FoundationalActionIntentRecord,
} from "../src/foundational-action-intent-ledger";

function intent(
  overrides: Partial<FoundationalActionIntentRecord> = {},
): FoundationalActionIntentRecord {
  const workspaceId = overrides.workspaceId ?? "wsp_test";
  const idempotencyKey = overrides.idempotencyKey ?? "intent-1";
  return {
    protocolVersion: "1.0",
    objectType: "FOUNDATIONAL_ACTION_INTENT",
    intentId: foundationalActionIntentId(workspaceId, idempotencyKey),
    workspaceId,
    jurisdiction: "US",
    targetId: "us-uspto-tmep-current",
    readinessStage: "REGISTER",
    actionCode: "REGISTER_SOURCE",
    operatorInstruction: "Register the curated source.",
    executionPath: "MANUAL_OPERATOR",
    collectionAuthorizationRequired: false,
    automaticExecution: false,
    executionAuthorization: "NONE",
    requestedByActorId: "operator:mile",
    approvalRequired: true,
    approvedByActorId: null,
    canceledByActorId: null,
    status: "PENDING_APPROVAL",
    idempotencyKey,
    readinessProtocolVersion: "1.2",
    queueProtocolVersion: "1.0",
    sourceSnapshotObservedAt: "2026-08-10T00:00:00.000Z",
    createdAt: "2026-08-10T00:00:01.000Z",
    updatedAt: "2026-08-10T00:00:01.000Z",
    replayed: false,
    ...overrides,
  };
}

describe("foundational action intent ledger", () => {
  it("is idempotent, requires semantic identity, and separates approval from execution", () => {
    const database = new DatabaseSync(":memory:");
    let tick = 1;
    const repository = new SqliteFoundationalActionIntentRepository(
      database,
      () => new Date(`2026-08-10T00:00:0${tick++}.000Z`),
    );
    const first = repository.create(intent());
    expect(first.replayed).toBe(false);
    expect(first.status).toBe("PENDING_APPROVAL");
    expect(first.executionAuthorization).toBe("NONE");

    const replay = repository.create(intent());
    expect(replay.intentId).toBe(first.intentId);
    expect(replay.replayed).toBe(true);

    expect(() =>
      repository.create(
        intent({
          targetId: "us-uspto-trademark-fees",
          idempotencyKey: "intent-1",
          intentId: foundationalActionIntentId("wsp_test", "intent-1"),
        }),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "FOUNDATIONAL_ACTION_INTENT_IDEMPOTENCY_CONFLICT" }),
    );

    const approved = repository.approve(first.intentId, "reviewer:alice");
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedByActorId).toBe("reviewer:alice");
    expect(approved.executionAuthorization).toBe("NONE");
    expect(approved.automaticExecution).toBe(false);

    const canceled = repository.cancel(first.intentId, "reviewer:alice");
    expect(canceled.status).toBe("CANCELED");
    expect(canceled.canceledByActorId).toBe("reviewer:alice");
    expect(repository.list({ workspaceId: "wsp_test", status: "CANCELED" })).toHaveLength(1);
  });
});
