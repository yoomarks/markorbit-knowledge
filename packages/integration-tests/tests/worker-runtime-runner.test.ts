import { describe, expect, it } from "vitest";
import type { ExecutionExecutor, ExecutionReceipt } from "@markorbit/contracts";
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

    const executor: ExecutionExecutor = {
      executorId: "test-executor",
      version: "1.0.0",
      mode: "FIXTURE",
    };
    const receipt: ExecutionReceipt = {
      executor,
      outputKinds: ["MARKDOWN"],
      itemsObserved: 1,
      bytesPrepared: 10,
      metadataOnly: true,
      summary: "test",
    };

    const result = await runner.run({} as never, {
      executor,
      execute: async () => receipt,
    });

    expect(result.status).toBe("COMPLETED");
    if (result.status === "COMPLETED") {
      expect(result.receipt.summary).toBe("test");
    }
  });
});
