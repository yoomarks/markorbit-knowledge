import { describe, expect, it } from "vitest";
import {
  filterKnowledgeSearchByGeneratedDate,
  readKnowledgeSearchDateRange,
} from "./knowledge-search-date-filter";

describe("Knowledge search generatedAt date filter", () => {
  it("uses inclusive UTC calendar-date boundaries without changing result order", () => {
    const items = [
      { id: "new", generatedAt: "2026-09-06T00:00:00Z" },
      { id: "end", generatedAt: "2026-09-05T23:59:59Z" },
      { id: "middle", generatedAt: "2026-09-03T12:00:00Z" },
      { id: "start", generatedAt: "2026-09-01T00:00:00Z" },
      { id: "old", generatedAt: "2026-08-31T23:59:59Z" },
    ];

    const filtered = filterKnowledgeSearchByGeneratedDate(items, {
      generatedFrom: "2026-09-01",
      generatedTo: "2026-09-05",
    });

    expect(filtered.map((item) => item.id)).toEqual(["end", "middle", "start"]);
  });

  it("validates date-only query state and rejects reversed ranges", () => {
    expect(
      readKnowledgeSearchDateRange(
        new URLSearchParams("generatedFrom=2026-09-01&generatedTo=2026-09-05"),
      ),
    ).toEqual({ generatedFrom: "2026-09-01", generatedTo: "2026-09-05" });
    expect(() =>
      readKnowledgeSearchDateRange(new URLSearchParams("generatedFrom=2026-02-30")),
    ).toThrow("valid UTC calendar date");
    expect(() =>
      readKnowledgeSearchDateRange(
        new URLSearchParams("generatedFrom=2026-09-06&generatedTo=2026-09-05"),
      ),
    ).toThrow("generatedFrom must be on or before generatedTo");
  });
});
