import { describe, expect, it } from "vitest";
import { LocalFileConnector } from "@markorbit/worker-runtime";

describe("local intake boundary", () => {
  it("creates intake results without owning domain state", async () => {
    const connector = new LocalFileConnector();
    const result = await connector.ingest({
      sourceId: "local-file-test",
      fileName: "sample.md",
      content: "# sample knowledge artifact",
    });

    expect(result.sourceId).toBe("local-file-test");
    expect(result).toHaveProperty("artifactCandidates");
  });
});
