import { describe, expect, it } from "vitest";
import {
  buildKnowledgeSearchApiQuery,
  knowledgeSearchRange,
  patchKnowledgeSearchQuery,
  readKnowledgeSearchState,
} from "./knowledge-hybrid-search-model";

describe("Knowledge Hybrid Search URL state", () => {
  it("restores query, facets and pagination from the URL", () => {
    const state = readKnowledgeSearchState(
      new URLSearchParams(
        "q=alpha&sourceId=src-1&jurisdiction=cn&status=READY&artifactKind=PDF&generatedFrom=2026-09-01&generatedTo=2026-09-05&offset=25",
      ),
    );

    expect(state).toEqual({
      q: "alpha",
      sourceId: "src-1",
      jurisdiction: "CN",
      status: "READY",
      artifactKind: "PDF",
      generatedFrom: "2026-09-01",
      generatedTo: "2026-09-05",
      offset: 25,
    });
  });

  it("resets pagination when a facet changes and preserves unrelated URL state", () => {
    const query = patchKnowledgeSearchQuery("q=alpha&sourceId=src-1&offset=50&view=search", {
      status: "READY",
    });
    const params = new URLSearchParams(query);

    expect(params.get("q")).toBe("alpha");
    expect(params.get("sourceId")).toBe("src-1");
    expect(params.get("status")).toBe("READY");
    expect(params.get("offset")).toBeNull();
    expect(params.get("view")).toBe("search");
  });

  it("preserves offset for explicit pagination and sends every persisted facet to the API", () => {
    const query = patchKnowledgeSearchQuery("q=alpha&status=READY", { offset: 25 }, false);
    const state = readKnowledgeSearchState(new URLSearchParams(query));
    const api = buildKnowledgeSearchApiQuery("wsp-test", {
      ...state,
      artifactKind: "PDF",
      generatedFrom: "2026-09-01",
      generatedTo: "2026-09-05",
    });
    const params = new URLSearchParams(api ?? "");

    expect(params.get("offset")).toBe("25");
    expect(params.get("limit")).toBe("25");
    expect(params.get("status")).toBe("READY");
    expect(params.get("artifactKind")).toBe("PDF");
    expect(params.get("generatedFrom")).toBe("2026-09-01");
    expect(params.get("generatedTo")).toBe("2026-09-05");
  });

  it("reports the visible exact-result range", () => {
    expect(knowledgeSearchRange(63, 25, 25)).toEqual({ start: 26, end: 50 });
    expect(knowledgeSearchRange(63, 50, 13)).toEqual({ start: 51, end: 63 });
    expect(knowledgeSearchRange(0, 0, 0)).toEqual({ start: 0, end: 0 });
  });
});
