import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { LocalFileConnectorExecutor } from "@markorbit/worker-runtime";

describe("LocalFileConnectorExecutor", () => {
  it("ingests a local file through artifact port", async () => {
    const directory = await mkdtemp(join(tmpdir(), "markorbit-local-file-"));
    const filePath = join(directory, "sample.txt");
    await writeFile(filePath, "MarkOrbit local fixture", "utf8");

    try {
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
              input: { path: filePath },
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
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
