import { describe, expect, it } from "vitest";
import {
  buildKnowledgeBrowserApiQuery,
  patchKnowledgeBrowserQuery,
  readKnowledgeBrowserState,
} from "./knowledge-browser-model";

describe("Knowledge Browser URL state", () => {
  it("restores filters and pagination from the URL", () => {
    expect(
      readKnowledgeBrowserState(
        new URLSearchParams(
          "q=alpha&sourceId=src-1&jurisdiction=cn&artifactKind=PDF&status=READY&offset=40",
        ),
      ),
    ).toEqual({
      q: "alpha",
      sourceId: "src-1",
      jurisdiction: "CN",
      artifactKind: "PDF",
      status: "READY",
      offset: 40,
    });
  });

  it("resets pagination when a filter changes and preserves workspace state", () => {
    const query = patchKnowledgeBrowserQuery(
      "workspaceId=wsp-a&q=alpha&sourceId=src-1&offset=40",
      { status: "BLOCKED" },
    );
    const params = new URLSearchParams(query);

    expect(params.get("workspaceId")).toBe("wsp-a");
    expect(params.get("q")).toBe("alpha");
    expect(params.get("sourceId")).toBe("src-1");
    expect(params.get("status")).toBe("BLOCKED");
    expect(params.get("offset")).toBeNull();
  });

  it("preserves explicit pagination and sends the complete state to the API", () => {
    const query = patchKnowledgeBrowserQuery("workspaceId=wsp-a&q=alpha", { offset: 20 }, false);
    const state = readKnowledgeBrowserState(new URLSearchParams(query));
    const api = new URLSearchParams(buildKnowledgeBrowserApiQuery("wsp-a", state));

    expect(api.get("workspaceId")).toBe("wsp-a");
    expect(api.get("q")).toBe("alpha");
    expect(api.get("offset")).toBe("20");
    expect(api.get("limit")).toBe("20");
  });
});
