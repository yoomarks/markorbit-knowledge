import { describe, expect, it } from "vitest";
import type { CollectionSchedulerPort } from "@markorbit/worker-runtime";

describe("collection scheduler boundary", () => {
  it("defines scheduling without owning collection business state", async () => {
    const scheduler: CollectionSchedulerPort = {
      schedule: async (request) => ({
        collectionRunId: request.collectionPlanId,
      }),
    };

    const result = await scheduler.schedule({
      collectionPlanId: "plan-test",
    });

    expect(result.collectionRunId).toBe("plan-test");
  });
});
