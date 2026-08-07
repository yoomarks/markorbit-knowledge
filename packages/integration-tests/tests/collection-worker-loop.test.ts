import { describe, expect, it } from "vitest";

import { CollectionWorkerLoop } from "@markorbit/worker-runtime";

describe("collection worker loop", () => {
  it("consumes queued collection jobs", async () => {
    const executed: string[] = [];

    const consumer = {
      async consume() {
        return { id: "job-1" };
      },
    };

    const runner = {
      async run(job: { id: string }) {
        executed.push(job.id);
      },
    };

    const loop = new CollectionWorkerLoop(consumer as never, runner as never);
    await loop.runOnce();

    expect(executed).toEqual(["job-1"]);
  });
});
