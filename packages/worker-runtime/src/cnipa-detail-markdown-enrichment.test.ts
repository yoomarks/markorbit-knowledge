import { describe, expect, it } from "vitest";
import {
  materializeCnipaDetailMarkdownEnrichment,
  materializeCnipaDetailMarkdownEnrichmentBytes,
} from "./cnipa-detail-markdown-enrichment";

describe("CNIPA DETAIL Markdown enrichment", () => {
  it("returns null when DETAIL adds no material source facts", () => {
    const result = materializeCnipaDetailMarkdownEnrichment({
      documentKind: "OPPOSITION_DECISION",
      sourceRecordId: "same-1",
      listMarkdownBody: "# Decision\n\nTrademark ABC\nRegNo 123456\n",
      detailValue: {
        code: 0,
        message: "ok",
        data: {
          tmName: "Trademark ABC",
          regNo: "123456",
        },
      },
    });

    expect(result).toBeNull();
  });

  it("appends only DETAIL-only facts while preserving field paths", () => {
    const result = materializeCnipaDetailMarkdownEnrichment({
      documentKind: "REVIEW_ADJUDICATION",
      sourceRecordId: "detail-2",
      listMarkdownBody: "# Review\n\nTrademark ABC\n",
      detailValue: {
        code: 0,
        message: "ok",
        data: {
          tmName: "Trademark ABC",
          respondentName: "Example Respondent",
          citedMarks: ["998877", "665544"],
        },
      },
    });

    expect(result).not.toBeNull();
    expect(result?.logicalDocumentUri).toBe("cnipa://judgment/REVIEW_ADJUDICATION/detail-2");
    expect(result?.facts).toEqual([
      { path: "citedMarks[0]", value: "998877" },
      { path: "citedMarks[1]", value: "665544" },
      { path: "respondentName", value: "Example Respondent" },
    ]);
    expect(result?.markdownBody).toContain("## DETAIL enrichment");
    expect(result?.markdownBody).toContain("- `respondentName`: Example Respondent");
    expect(result?.markdownBody).not.toContain("- `tmName`: Trademark ABC");
    expect(result?.markdownBody).not.toContain("- `code`:");
    expect(result?.markdownBody).not.toContain("- `message`:");
  });

  it("preserves DETAIL-only URL and image references as source facts", () => {
    const result = materializeCnipaDetailMarkdownEnrichment({
      documentKind: "REGISTRATION_EXAMINATION",
      sourceRecordId: "detail-3",
      listMarkdownBody: "# Examination\n\nBase content\n",
      detailValue: {
        data: {
          evidence: {
            imageUrl: "https://example.cn/image/1.png",
            sourceUrl: "https://example.cn/doc/1",
          },
        },
      },
    });

    expect(result?.facts).toEqual([
      { path: "evidence.imageUrl", value: "https://example.cn/image/1.png" },
      { path: "evidence.sourceUrl", value: "https://example.cn/doc/1" },
    ]);
  });

  it("renders nested booleans and numbers deterministically", () => {
    const result = materializeCnipaDetailMarkdownEnrichment({
      documentKind: "REGISTRATION_EXAMINATION",
      sourceRecordId: "detail-4",
      listMarkdownBody: "# Examination\n\nBase\n",
      detailValue: {
        data: {
          flags: {
            open: true,
            sequence: 42,
          },
        },
      },
    });

    expect(result?.facts).toEqual([
      { path: "flags.open", value: true },
      { path: "flags.sequence", value: 42 },
    ]);
  });

  it("parses UTF-8 Markdown and JSON bytes", () => {
    const result = materializeCnipaDetailMarkdownEnrichmentBytes({
      documentKind: "OPPOSITION_DECISION",
      sourceRecordId: "bytes-1",
      listMarkdownContent: new TextEncoder().encode("# 决定书\n\n原始内容\n"),
      detailContent: new TextEncoder().encode(
        JSON.stringify({
          code: 0,
          data: {
            additionalText: "新增事实",
          },
        }),
      ),
    });

    expect(result?.facts).toEqual([{ path: "additionalText", value: "新增事实" }]);
    expect(result?.markdownBody).toContain("新增事实");
  });

  it("fails closed when DETAIL arrays exceed the materialization bound", () => {
    expect(() =>
      materializeCnipaDetailMarkdownEnrichment({
        documentKind: "OPPOSITION_DECISION",
        sourceRecordId: "too-many",
        listMarkdownBody: "# Decision\n\nBase\n",
        detailValue: {
          data: {
            items: Array.from({ length: 51 }, (_, index) => index),
          },
        },
      }),
    ).toThrow(/array items exceeds item bound/i);
  });
});
