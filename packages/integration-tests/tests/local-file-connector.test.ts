import { describe, expect, it, vi } from "vitest";
import { LocalFileConnectorExecutor } from "@markorbit/worker-runtime";

describe("LocalFileConnectorExecutor", () => {
  it("ingests a local file through artifact port", async () => {
    const ingest = vi.fn().mockResolvedValue({
      receiptId: "receipt-1",
      artifactId: "artifact-1",
      status: "FINALIZED",
    });

    const executor = new LocalFileConnectorExecutor({ ingest });

    const result = await executor.execute(
      {
        workerId: "worker-1",
        job: {
          id: "job-1",
          sourceId: "source-1",
          planSnapshot: {
            input: { path: "fixtures/sample.txt" },
            output: { artifactKinds: ["DOCUMENT"] },
          },
        } as never,
        lease: { id: "lease-1" } as never,
      },
      {
        start: vi.fn(),
        uploading: vi.fn(),
        verifying: vi.fn(),
        complete: vi.fn(),
        fail: vi.fn(),
      },
    );

    expect(ingest).toHaveBeenCalled();
    expect(result?.metadataOnly).toBe(false);
  });
});
