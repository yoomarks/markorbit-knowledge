import { describe, expect, it } from "vitest";
import { CollectionRegistry } from "@markorbit/persistence";

describe("collection artifact boundary", () => {
  it("keeps collection run linked to artifact ingestion handoff", () => {
    const registry = new CollectionRegistry();

    const plan = registry.createPlan({
      planId: "plan_artifact_test",
      targets: [],
      createdAt: "2026-08-08T00:00:00Z",
    });

    const run = registry.createRun({
      runId: "run_artifact_test",
      planId: plan.planId,
      status: "created",
    });

    expect(run.planId).toBe(plan.planId);
    expect(run.status).toBe("created");
  });
});
