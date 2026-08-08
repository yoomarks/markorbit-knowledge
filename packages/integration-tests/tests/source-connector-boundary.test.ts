import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpSourceConnector } from "@markorbit/worker-runtime";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("source connector boundary", () => {
  it("returns discovered artifact candidates without owning artifact state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("fixture", {
          status: 200,
          headers: { "content-type": "text/markdown" },
        }),
      ),
    );

    const connector = new HttpSourceConnector();
    const result = await connector.fetch({
      sourceId: "source-http-test",
      targetUri: "https://example.test/document.md",
    });

    expect(result.sourceId).toBe("source-http-test");
    expect(result.artifactCandidates).toEqual([
      expect.objectContaining({
        uri: "https://example.test/document.md",
        contentType: "text/markdown",
      }),
    ]);
  });
});
