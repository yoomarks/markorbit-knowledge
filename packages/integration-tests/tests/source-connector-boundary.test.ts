import { describe, expect, it } from "vitest";
import { HttpSourceConnector } from "@markorbit/worker-runtime";

describe("source connector boundary", () => {
  it("returns discovered artifact candidates without owning artifact state", async () => {
    const connector = new HttpSourceConnector();
    const result = await connector.fetch({
      sourceId: "source-http-test",
      targetUri: "https://example.com/document.md",
    });

    expect(result.sourceId).toBe("source-http-test");
    expect(result.artifactCandidates).toBeDefined();
  });
});
