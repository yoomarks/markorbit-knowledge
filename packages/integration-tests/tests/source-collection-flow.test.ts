import { describe, expect, it } from "vitest";
import { CollectionRegistry } from "@markorbit/persistence";

describe("source collection flow", () => {
  it("creates a collection plan and run for a registered source", () => {
    const registry = new CollectionRegistry();

    const plan = registry.createPlan({
      planId: "plan_test",
      sourceId: "src_test",
      targets: [],
      status: "ACTIVE",
    } as any);

    const updated = registry.addTarget("plan_test", {
      targetId: "target_test",
      uri: "file:///fixture.txt",
    } as any);

    const run = registry.createRun({
      runId: "run_test",
      planId: "plan_test",
      status: "PENDING",
    } as any);

    expect(plan.planId).toBe("plan_test");
    expect(updated.targets).toHaveLength(1);
    expect(run.planId).toBe("plan_test");
  });
});
