import { describe, expect, it } from "vitest";
import {
  buildKnowledgeBrowserApiQuery,
  patchKnowledgeBrowserQuery,
  readKnowledgeBrowserState,
} from "./knowledge-browser-model";

describe("Knowledge Browser URL state", () => {
  it("restores filters, pagination and the selected evidence marker from the URL", () => {
    expect(
      readKnowledgeBrowserState(
        new URLSearchParams(
          "q=alpha&sourceId=src-1&jurisdiction=cn&artifactKind=PDF&status=READY&offset=40&selected=doc-9",
        ),
      ),
    ).toEqual({
      q: "alpha",
      sourceId: "src-1",
      jurisdiction: "CN",
      artifactKind: "PDF",
      status: "READY",
      offset: 40,
      selectedId: "doc-9",
    });
  });

  it("resets pagination and selection when a filter changes while preserving workspace state", () => {
    const query = patchKnowledgeBrowserQuery(
      "workspaceId=wsp-a&q=alpha&sourceId=src-1&offset=40&selected=doc-9",
      { status: "BLOCKED" },
    );
    const params = new URLSearchParams(query);

    expect(params.get("workspaceId")).toBe("wsp-a");
    expect(params.get("q")).toBe("alpha");
    expect(params.get("sourceId")).toBe("src-1");
    expect(params.get("status")).toBe("BLOCKED");
    expect(params.get("offset")).toBeNull();
    expect(params.get("selected")).toBeNull();
  });

  it("preserves explicit pagination and sends only corpus filters to the API", () => {
    const query = patchKnowledgeBrowserQuery(
      "workspaceId=wsp-a&q=alpha&selected=doc-9",
      { offset: 20 },
      false,
    );
    const state = readKnowledgeBrowserState(new URLSearchParams(query));
    const api = new URLSearchParams(buildKnowledgeBrowserApiQuery("wsp-a", state));

    expect(api.get("workspaceId")).toBe("wsp-a");
    expect(api.get("q")).toBe("alpha");
    expect(api.get("offset")).toBe("20");
    expect(api.get("limit")).toBe("20");
    expect(api.get("selected")).toBeNull();
  });

  it("can freeze a return context with the selected evidence without changing filters", () => {
    const query = patchKnowledgeBrowserQuery(
      "workspaceId=wsp-a&q=alpha&status=READY&offset=20",
      { selectedId: "doc-9" },
      false,
    );
    const params = new URLSearchParams(query);

    expect(params.get("q")).toBe("alpha");
    expect(params.get("status")).toBe("READY");
    expect(params.get("offset")).toBe("20");
    expect(params.get("selected")).toBe("doc-9");
  });
});
