import { describe, expect, it } from "vitest";
import { buildKnowledgeReaderModel } from "./content-reader-model";

describe("buildKnowledgeReaderModel", () => {
  it("removes canonical frontmatter from the readable body", () => {
    const model = buildKnowledgeReaderModel(
      [
        "---",
        'knowledge_id: \"web:article:guide\"',
        'source_name: \"Official Office\"',
        "---",
        "",
        "# Filing Guide",
        "",
        "Readable body text.",
      ].join("\n"),
    );

    expect(model.frontmatter).toEqual({
      knowledge_id: "web:article:guide",
      source_name: "Official Office",
    });
    expect(model.blocks).toEqual([
      { kind: "heading", level: 1, text: "Filing Guide" },
      { kind: "paragraph", text: "Readable body text." },
    ]);
  });

  it("renders only safe text-oriented block structures", () => {
    const model = buildKnowledgeReaderModel(
      [
        "## Evidence",
        "",
        "- **First** item",
        "- [Second](https://example.test/source)",
        "",
        "> Source-confirmed statement",
        "",
        "---",
        "",
        "Paragraph with `inline value`.",
      ].join("\n"),
    );

    expect(model.blocks).toEqual([
      { kind: "heading", level: 2, text: "Evidence" },
      { kind: "bullet", items: ["First item", "Second (https://example.test/source)"] },
      { kind: "quote", text: "Source-confirmed statement" },
      { kind: "divider" },
      { kind: "paragraph", text: "Paragraph with inline value." },
    ]);
  });

  it("does not treat an unterminated frontmatter marker as metadata", () => {
    const model = buildKnowledgeReaderModel("---\nnot: closed\nbody");
    expect(model.frontmatter).toEqual({});
    expect(model.blocks[0]).toEqual({ kind: "divider" });
  });
});
