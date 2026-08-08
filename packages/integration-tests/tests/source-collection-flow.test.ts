import { describe, expect, it, vi } from "vitest";
import { CollectionRegistry } from "@markorbit/persistence/collection-registry";
import { SourceCollectionFlow, SourceDiscoveryRunner } from "@markorbit/worker-runtime";

describe("source collection flow", () => {
  it("creates a collection plan and run for a registered source", () => {
    const registry = new CollectionRegistry();

    const plan = registry.createPlan({
      planId: "plan_test",
      targets: [],
      createdAt: "2026-08-08T00:00:00Z",
    });

    const updated = registry.addTarget("plan_test", {
      targetId: "target_test",
      sourceId: "src_test",
      locator: "file:///fixture.txt",
    });

    const run = registry.createRun({
      runId: "run_test",
      planId: "plan_test",
      status: "created",
    });

    expect(plan.planId).toBe("plan_test");
    expect(updated.targets).toHaveLength(1);
    expect(run.planId).toBe("plan_test");
  });

  it("returns fresh discovery candidates without planning them before human acceptance", async () => {
    const discovery = new SourceDiscoveryRunner({
      async discover() {
        return [
          {
            candidateId: "candidate-1",
            locator: "https://example.test/trademarks",
            discoveredAt: "2026-08-08T00:00:00Z",
            status: "DISCOVERED" as const,
          },
        ];
      },
    });
    const createPlan = vi.fn();
    const flow = new SourceCollectionFlow(discovery, { createPlan });

    const result = await flow.run({
      batchId: "batch-1",
      seeds: [{ seedId: "seed-1", locator: "https://example.test/" }],
      createdAt: "2026-08-08T00:00:00Z",
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.plans).toEqual([]);
    expect(createPlan).not.toHaveBeenCalled();
  });

  it("allows planning only after a candidate is explicitly accepted", async () => {
    const discovery = new SourceDiscoveryRunner({
      async discover() {
        return [
          {
            candidateId: "candidate-accepted",
            locator: "https://example.test/trademarks",
            discoveredAt: "2026-08-08T00:00:00Z",
            status: "ACCEPTED" as const,
          },
          {
            candidateId: "candidate-rejected",
            locator: "https://example.test/careers",
            discoveredAt: "2026-08-08T00:00:00Z",
            status: "REJECTED" as const,
          },
        ];
      },
    });

    const flow = new SourceCollectionFlow(discovery, {
      async createPlan(item) {
        return {
          planId: `plan-${item.candidateId}`,
          targets: [],
          createdAt: "2026-08-08T00:00:00Z",
        };
      },
    });

    const result = await flow.run({
      batchId: "batch-accepted",
      seeds: [{ seedId: "seed-accepted", locator: "https://example.test/" }],
      createdAt: "2026-08-08T00:00:00Z",
    });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]?.planId).toBe("plan-candidate-accepted");
  });
});
