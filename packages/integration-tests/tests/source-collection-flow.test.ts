import { describe, expect, it } from "vitest";
import { CollectionRegistry } from "@markorbit/persistence";
import { SourceCollectionFlow, SourceDiscoveryRunner } from "@markorbit/worker-runtime";

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

  it("connects discovery candidates to collection plans", async () => {
    const discovery = new SourceDiscoveryRunner({
      async discover() {
        return [{ id: "candidate-1" }] as never;
      },
    });

    const flow = new SourceCollectionFlow(discovery, {
      async createPlan(item) {
        return { id: `plan-${item.id}` } as never;
      },
    });

    const result = await flow.run({ id: "batch-1" } as never);

    expect(result.candidates).toHaveLength(1);
    expect(result.plans[0]?.id).toBe("plan-candidate-1");
  });
});
