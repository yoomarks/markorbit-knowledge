import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SqliteSourceSupplyPromotionReceiptLedger } from "./source-supply-promotion-receipts";

describe("source supply promotion receipt identity", () => {
  it("creates distinct durable receipts for distinct CollectionRuns on the same target", () => {
    const repository = new SqliteSourceSupplyPromotionReceiptLedger(new DatabaseSync(":memory:"));
    const base = {
      workspaceId: "workspace-1",
      jurisdiction: "CN",
      targetId: "cn-target",
      sourceId: "source-1",
      planId: "plan-1",
      operatorActor: "operator:test",
    };

    const first = repository.start({ ...base, collectionRunId: "run-1" }).receipt;
    const second = repository.start({ ...base, collectionRunId: "run-2" }).receipt;

    expect(first.id).not.toBe(second.id);
    expect(first.collectionRunId).toBe("run-1");
    expect(second.collectionRunId).toBe("run-2");
    expect(repository.getByCollectionRunId("run-1")?.id).toBe(first.id);
    expect(repository.getByCollectionRunId("run-2")?.id).toBe(second.id);
  });
});
