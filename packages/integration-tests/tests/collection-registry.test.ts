import { describe, expect, it } from "vitest";
import { CollectionRegistry } from "@markorbit/persistence/collection-plans";

describe("CollectionRegistry", () => {
  it("creates plans, targets and runs", () => {
    const registry = new CollectionRegistry();

    registry.createPlan({
      planId: "plan_test",
      targets: [],
      createdAt: "2026-08-07T00:00:00.000Z",
    });

    const updated = registry.addTarget("plan_test", {
      targetId: "target_test",
      sourceId: "src_test",
      locator: "file:///fixture.txt",
    });

    const run = registry.createRun({
      runId: "run_test",
      planId: "plan_test",
      status: "completed",
    });

    expect(updated.targets).toHaveLength(1);
    expect(registry.getPlan("plan_test")).toEqual(updated);
    expect(registry.getRun("run_test")).toEqual(run);
  });
});
