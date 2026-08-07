import { describe, expect, it } from "vitest";
import { CollectionRegistry } from "@markorbit/persistence";

describe("collection artifact boundary", () => {
  it("keeps collection run linked to artifact ingestion handoff", () => {
    const registry = new CollectionRegistry();

    const plan = registry.createPlan({
      planId: "plan_artifact_test",
      sourceId: "src_artifact_test",
      targets: [],
      status: "ACTIVE",
    } as any);

    const run = registry.createRun({
      runId: "run_artifact_test",
      planId: plan.planId,
      status: "PENDING",
    } as any);

    expect(run.planId).toBe(plan.planId);
    expect(run.status).toBe("PENDING");
  });
});
