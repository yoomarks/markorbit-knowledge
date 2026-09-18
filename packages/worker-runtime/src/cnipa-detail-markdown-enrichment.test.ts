import { describe, expect, it } from "vitest";
import type { CnipaKnowledgeDocumentSeedV1 } from "./cnipa-list-materializer";
import { enrichCnipaMarkdownFromDetail } from "./cnipa-detail-markdown-enrichment";

function seed(
  markdownBody = "# 异议决定书\n\n商标：MO\n注册号：123\n",
): CnipaKnowledgeDocumentSeedV1 {
  return {
    schemaVersion: "cnipa-knowledge-document-seed-v1",
    sourceAuthority: "CNIPA",
    documentKind: "OPPOSITION_DECISION",
    sourceRecordId: "record-1",
    logicalDocumentUri: "cnipa://judgment/OPPOSITION_DECISION/record-1",
    detailCanonicalUri:
      "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/pubnotice/portal/tmyyJudgment/queryInfo?id=record-1",
    title: "异议决定书",
    registrationNumber: "123",
    trademarkName: "MO",
    sourceRowSha256: "a".repeat(64),
    markdownBody,
  };
}

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

describe("CNIPA DETAIL Markdown enrichment", () => {
  it("returns no-op when DETAIL only repeats LIST text", () => {
    const result = enrichCnipaMarkdownFromDetail({
      documentSeed: seed(),
      listArtifactId: "raw-list-1",
      detailArtifactId: "raw-detail-1",
      detailBody: bytes({
        code: 0,
        message: "success",
        data: {
          tmName: "MO",
          regNo: "123",
        },
      }),
    });

    expect(result).toMatchObject({
      material: false,
      reason: "NO_NEW_DETAIL_EVIDENCE",
    });
  });

  it("emits deterministic path/value evidence for detail-only facts", () => {
    const result = enrichCnipaMarkdownFromDetail({
      documentSeed: seed(),
      listArtifactId: "raw-list-1",
      detailArtifactId: "raw-detail-1",
      detailBody: bytes({
        code: 0,
        data: {
          citedMarks: [{ regNo: "456", name: "M-O" }],
          attachmentUrl: "https://example.cn/evidence/1.jpg",
        },
      }),
    });

    expect(result.material).toBe(true);
    if (!result.material) return;
    expect(result.enrichment).toMatchObject({
      logicalDocumentUri: "cnipa://judgment/OPPOSITION_DECISION/record-1",
      listArtifactId: "raw-list-1",
      detailArtifactId: "raw-detail-1",
    });
    expect(result.enrichment.materialEvidence).toEqual([
      { path: "/attachmentUrl", value: "https://example.cn/evidence/1.jpg" },
      { path: "/citedMarks/0/name", value: "M-O" },
      { path: "/citedMarks/0/regNo", value: "456" },
    ]);
    expect(result.enrichment.markdownBody).toContain("## CNIPA DETAIL enrichment");
    expect(result.enrichment.markdownBody).toContain("/citedMarks/0/regNo");
  });

  it("ignores transport envelope fields as material evidence", () => {
    const result = enrichCnipaMarkdownFromDetail({
      documentSeed: seed(),
      listArtifactId: "raw-list-1",
      detailArtifactId: "raw-detail-1",
      detailBody: bytes({
        code: 0,
        message: "ok",
        success: true,
        timestamp: 123456789,
        traceId: "trace-only",
        requestId: "request-only",
        data: {
          tmName: "MO",
        },
      }),
    });

    expect(result.material).toBe(false);
  });

  it("preserves stable evidence ordering regardless of object insertion order", () => {
    const left = enrichCnipaMarkdownFromDetail({
      documentSeed: seed(),
      listArtifactId: "raw-list-1",
      detailArtifactId: "raw-detail-1",
      detailBody: bytes({ code: 0, data: { z: "last", a: "first" } }),
    });
    const right = enrichCnipaMarkdownFromDetail({
      documentSeed: seed(),
      listArtifactId: "raw-list-1",
      detailArtifactId: "raw-detail-1",
      detailBody: bytes({ data: { a: "first", z: "last" }, code: 0 }),
    });

    expect(left.material).toBe(true);
    expect(right.material).toBe(true);
    if (!left.material || !right.material) return;
    expect(left.enrichment.materialEvidence).toEqual(right.enrichment.materialEvidence);
    expect(left.enrichment.markdownBody).toBe(right.enrichment.markdownBody);
  });

  it("changes DETAIL body hash when transport bytes change even if material evidence is the same", () => {
    const left = enrichCnipaMarkdownFromDetail({
      documentSeed: seed(),
      listArtifactId: "raw-list-1",
      detailArtifactId: "raw-detail-1",
      detailBody: bytes({ code: 0, data: { extra: "new" } }),
    });
    const right = enrichCnipaMarkdownFromDetail({
      documentSeed: seed(),
      listArtifactId: "raw-list-1",
      detailArtifactId: "raw-detail-1",
      detailBody: bytes({ message: "different", code: 0, data: { extra: "new" } }),
    });

    expect(left.material).toBe(true);
    expect(right.material).toBe(true);
    if (!left.material || !right.material) return;
    expect(left.enrichment.markdownBody).toBe(right.enrichment.markdownBody);
    expect(left.enrichment.detailBodySha256).not.toBe(right.enrichment.detailBodySha256);
  });

  it("rejects non-JSON DETAIL evidence", () => {
    expect(() =>
      enrichCnipaMarkdownFromDetail({
        documentSeed: seed(),
        listArtifactId: "raw-list-1",
        detailArtifactId: "raw-detail-1",
        detailBody: new TextEncoder().encode("not-json"),
      }),
    ).toThrow(/valid UTF-8 JSON/i);
  });
});
