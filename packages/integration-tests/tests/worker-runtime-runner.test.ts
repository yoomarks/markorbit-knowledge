import { describe, expect, it } from "vitest";
import { WorkerRuntimeRunner } from "@markorbit/worker-runtime";

describe("worker runtime runner", () => {
  it("returns completed result when executor returns a receipt", async () => {
    const runner = new WorkerRuntimeRunner({
      start: async () => {},
      uploading: async () => {},
      verifying: async () => {},
      complete: async () => {},
      fail: async () => {},
    });

    const receipt = {
      executor: {
        executorId: "test-executor",
        version: "1.0.0",
        mode: "FIXTURE",
      },
      outputKinds: ["MARKDOWN"],
      itemsObserved: 1,
      bytesPrepared: 10,
      metadataOnly: true,
      summary: "test",
    };

    const result = await runner.run({} as never, {
      executor: receipt.executor,
      execute: async () => receipt,
    });

    expect(result.status).toBe("COMPLETED");
    if (result.status === "COMPLETED") {
      expect(result.receipt.summary).toBe("test");
    }
  });
});
