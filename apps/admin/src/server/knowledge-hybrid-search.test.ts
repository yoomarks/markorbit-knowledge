import { describe, expect, it } from "vitest";
import { composeKnowledgeHybridSearch } from "./knowledge-hybrid-search";

type Item = { id: string; title: string };

function fullText(item: Item, score: number, snippet = item.title) {
  return {
    item,
    evidence: {
      indexMode: "SQLITE_FTS5_BM25" as const,
      score,
      snippet,
      headingPath: ["Section"],
    },
  };
}

describe("composeKnowledgeHybridSearch", () => {
  it("preserves FTS order, deduplicates documents, and appends metadata-only matches deterministically", () => {
    const alpha = { id: "doc-a", title: "Alpha" };
    const beta = { id: "doc-b", title: "Beta" };
    const gamma = { id: "doc-c", title: "Gamma" };

    const result = composeKnowledgeHybridSearch(
      [fullText(beta, 9), fullText(alpha, 8), fullText(beta, 7, "lower ranked duplicate")],
      [gamma, alpha],
    );

    expect(result.map((item) => item.id)).toEqual(["doc-b", "doc-a", "doc-c"]);
    expect(result[0].searchMatch.channels).toEqual(["FULL_TEXT"]);
    expect(result[1].searchMatch.channels).toEqual(["FULL_TEXT", "METADATA"]);
    expect(result[2].searchMatch.channels).toEqual(["METADATA"]);
    expect(result[0].searchMatch.fullText?.score).toBe(9);
    expect(result[0].searchMatch.fullText?.snippet).toBe("Beta");
  });

  it("does not introduce graph-derived ranking or synthetic vector semantics", () => {
    const result = composeKnowledgeHybridSearch(
      [fullText({ id: "doc-z", title: "Zulu" }, 5)],
      [{ id: "doc-a", title: "Alpha" }],
    );

    expect(result.map((item) => item.id)).toEqual(["doc-z", "doc-a"]);
    expect(JSON.stringify(result)).not.toContain("VECTOR");
    expect(JSON.stringify(result)).not.toContain("graphScore");
  });
});
