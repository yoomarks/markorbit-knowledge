import { describe, expect, it } from "vitest";
import {
  deriveOperatorInbox,
  type OperatorInboxEvidenceItem,
  type OperatorInboxSnapshot,
} from "./operator-inbox-model";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";

function evidence(
  id: string,
  occurredAt: string,
): Omit<OperatorInboxEvidenceItem, "category"> {
  return {
    id,
    objectType: "TEST_EVIDENCE",
    objectId: id,
    title: id,
    reason: `reason:${id}`,
    occurredAt,
    href: `/dashboard?evidence=${id}`,
  };
}

function snapshot(): OperatorInboxSnapshot {
  return {
    workspaceId,
    acquisitionFailures: [
      { ...evidence("run_failed", "2026-09-04T08:00:00.000Z"), category: "ACQUISITION_FAILED" },
    ],
    sourceHealth: [
      {
        ...evidence("source_degraded", "2026-09-04T07:00:00.000Z"),
        category: "SOURCE_STALE_DEGRADED",
      },
    ],
    changeEvidence: [
      { ...evidence("change_created", "2026-09-04T10:00:00.000Z"), changeKind: "CREATED" },
      { ...evidence("change_updated", "2026-09-04T09:00:00.000Z"), changeKind: "UPDATED" },
    ],
    needsReview: [
      { ...evidence("vault_import", "2026-09-04T06:00:00.000Z"), category: "NEEDS_REVIEW" },
    ],
    vaultConflicts: [
      { ...evidence("vault_conflict", "2026-09-04T05:00:00.000Z"), category: "VAULT_CONFLICT" },
    ],
    deliveries: [
      { ...evidence("delivery_ready", "2026-09-04T04:00:00.000Z"), state: "READY" },
      { ...evidence("delivery_review", "2026-09-04T03:00:00.000Z"), state: "NEEDS_REVIEW" },
      { ...evidence("delivery_blocked", "2026-09-04T02:00:00.000Z"), state: "BLOCKED" },
      { ...evidence("delivery_done", "2026-09-04T01:00:00.000Z"), state: "DELIVERED" },
    ],
  };
}

describe("deriveOperatorInbox", () => {
  it("keeps new material and changed material exclusive and partitions delivery states", () => {
    const result = deriveOperatorInbox(snapshot(), "2026-09-04T11:00:00.000Z");
    const counts = Object.fromEntries(
      result.categories.map((category) => [category.category, category.count]),
    );

    expect(counts.NEW_MATERIAL).toBe(1);
    expect(counts.MATERIAL_CHANGE).toBe(1);
    expect(counts.READY_FOR_DELIVERY).toBe(1);
    expect(counts.DELIVERY_BLOCKED).toBe(1);
    expect(counts.NEEDS_REVIEW).toBe(2);
    expect(result.categories.flatMap((category) => category.items).map((item) => item.objectId)).not.toContain(
      "delivery_done",
    );
    expect(result.total).toBe(8);
  });

  it("orders deterministically and reports partial evidence without inventing counts", () => {
    const input = snapshot();
    input.changeEvidence.push({
      ...evidence("change_same_time_b", "2026-09-04T10:00:00.000Z"),
      changeKind: "CREATED",
    });
    input.changeEvidence.push({
      ...evidence("change_same_time_a", "2026-09-04T10:00:00.000Z"),
      changeKind: "CREATED",
    });
    input.unavailableEvidence = ["vault", "runs", "vault"];

    const result = deriveOperatorInbox(input, "2026-09-04T11:00:00.000Z");
    const created = result.categories.find((category) => category.category === "NEW_MATERIAL")!;

    expect(created.items.map((item) => item.id)).toEqual([
      "change_created",
      "change_same_time_a",
      "change_same_time_b",
    ]);
    expect(result.evidenceState).toBe("PARTIAL");
    expect(result.unavailableEvidence).toEqual(["runs", "vault"]);
  });
});
