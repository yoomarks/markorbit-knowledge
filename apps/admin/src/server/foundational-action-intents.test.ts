import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  approveFoundationalActionIntent,
  cancelFoundationalActionIntent,
  createFoundationalActionIntent,
  listFoundationalActionIntents,
} from "./foundational-action-intents";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";

describe("controlled foundational action intents", () => {
  it("revalidates M20 actions, records idempotent intent state, and never authorizes execution", () => {
    const database = new DatabaseSync(":memory:");
    let tick = 0;
    const clock = () => new Date(`2026-08-10T00:00:${String(tick++).padStart(2, "0")}.000Z`);
    const input = {
      workspaceId,
      jurisdiction: "US",
      targetId: "us-uspto-tmep-current",
      actionCode: "REGISTER_SOURCE",
      requestedByActorId: "operator:mile",
      idempotencyKey: "m23-us-tmep-register",
    };

    const created = createFoundationalActionIntent(database, input, clock);
    expect(created.readinessStage).toBe("REGISTER");
    expect(created.status).toBe("PENDING_APPROVAL");
    expect(created.executionAuthorization).toBe("NONE");
    expect(created.automaticExecution).toBe(false);

    const replay = createFoundationalActionIntent(database, input, clock);
    expect(replay.intentId).toBe(created.intentId);
    expect(replay.replayed).toBe(true);

    expect(() =>
      createFoundationalActionIntent(
        database,
        { ...input, actionCode: "DISPATCH_GOVERNED_COLLECTION", idempotencyKey: "wrong-action" },
        clock,
      ),
    ).toThrowError(expect.objectContaining({ code: "FOUNDATIONAL_ACTION_NOT_CURRENTLY_REQUIRED" }));

    const approved = approveFoundationalActionIntent(
      database,
      created.intentId,
      "reviewer:alice",
      clock,
    );
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedByActorId).toBe("reviewer:alice");
    expect(approved.executionAuthorization).toBe("NONE");

    const listed = listFoundationalActionIntents(database, { workspaceId, jurisdiction: "US" });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.intentId).toBe(created.intentId);

    const canceled = cancelFoundationalActionIntent(
      database,
      created.intentId,
      "reviewer:alice",
      clock,
    );
    expect(canceled.status).toBe("CANCELED");
    expect(canceled.executionAuthorization).toBe("NONE");
  });
});
