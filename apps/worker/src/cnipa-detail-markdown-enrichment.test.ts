import { describe, expect, it, vi } from "vitest";
import { enrichCnipaDetailMarkdown } from "./cnipa-detail-markdown-enrichment";

function evidence(detailValue: unknown) {
  return {
    documentKind: "OPPOSITION_DECISION" as const,
    sourceRecordId: "detail-1",
    detailCanonicalUri:
      "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/pubnotice/portal/tmyyJudgment/queryInfo?id=detail-1",
    listMarkdownArtifactId: "raw_list_markdown",
    listRawArtifactId: "raw_list_json",
    detailRawArtifactId: "raw_detail_json",
    listMarkdownContent: new TextEncoder().encode(
      "# Decision\n\nTrademark ABC\n",
    ),
    detailContent: new TextEncoder().encode(JSON.stringify(detailValue)),
  };
}

describe("CNIPA DETAIL Markdown enrichment coordinator", () => {
  it("skips persistence when DETAIL adds no material delta", async () => {
    const sink = vi.fn();
    const result = await enrichCnipaDetailMarkdown({
      evidence: evidence({
        code: 0,
        data: {
          tmName: "Trademark ABC",
        },
      }),
      sink,
    });

    expect(result.status).toBe("SKIPPED_NO_MATERIAL_DELTA");
    expect(result.persisted).toBeNull();
    expect(sink).not.toHaveBeenCalled();
  });

  it("persists one new immutable Markdown version for material DETAIL facts", async () => {
    const sink = vi.fn(async () => ({
      artifactId: "raw_enriched_markdown",
      sha256: "a".repeat(64),
    }));
    const result = await enrichCnipaDetailMarkdown({
      evidence: evidence({
        code: 0,
        data: {
          tmName: "Trademark ABC",
          respondentName: "Example Respondent",
        },
      }),
      sink,
    });

    expect(result.status).toBe("CREATED");
    expect(result.enrichment?.facts).toEqual([
      { path: "respondentName", value: "Example Respondent" },
    ]);
    expect(result.persisted).toEqual({
      artifactId: "raw_enriched_markdown",
      sha256: "a".repeat(64),
    });
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0]?.[0]).toMatchObject({
      logicalDocumentUri: "cnipa://judgment/OPPOSITION_DECISION/detail-1",
      listMarkdownArtifactId: "raw_list_markdown",
      listRawArtifactId: "raw_list_json",
      detailRawArtifactId: "raw_detail_json",
    });
  });

  it("does not claim success when enriched Markdown persistence fails", async () => {
    await expect(
      enrichCnipaDetailMarkdown({
        evidence: evidence({
          code: 0,
          data: {
            respondentName: "Example Respondent",
          },
        }),
        sink: vi.fn(async () => {
          throw new Error("markdown persistence uncertain");
        }),
      }),
    ).rejects.toThrow(/markdown persistence uncertain/i);
  });
});
