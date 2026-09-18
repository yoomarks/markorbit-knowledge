import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { RawArtifactView } from "@markorbit/persistence/raw-artifacts";
import type { CnipaKnowledgeDocumentSeedV1 } from "@markorbit/worker-runtime/cnipa-list-materializer";
import {
  coordinateCnipaDetailMarkdownEnrichment,
  type CnipaDetailMarkdownPersistenceSink,
} from "./cnipa-detail-markdown-coordinator";

function seed(): CnipaKnowledgeDocumentSeedV1 {
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
    markdownBody: "# 异议决定书\n\n商标：MO\n注册号：123\n",
  };
}

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function persisted(markdownBody: string) {
  return {
    artifact: {
      artifact: { id: "art_01ARZ3NDEKTSV4RRFFQ69G5FAY" },
      contentObject: {
        sha256: createHash("sha256").update(markdownBody).digest("hex"),
      },
    } as RawArtifactView,
    sha256: createHash("sha256").update(markdownBody).digest("hex"),
  };
}

describe("CNIPA DETAIL Markdown coordinator", () => {
  it("skips persistence when DETAIL adds no material delta", async () => {
    const sink = vi.fn();
    const result = await coordinateCnipaDetailMarkdownEnrichment({
      documentSeed: seed(),
      listRawArtifactId: "raw-list",
      listMarkdownArtifactId: "raw-list-markdown",
      detailRawArtifactId: "raw-detail",
      detailBody: bytes({
        code: 0,
        data: {
          tmName: "MO",
          regNo: "123",
        },
      }),
      sink,
    });

    expect(result.status).toBe("SKIPPED_NO_MATERIAL_DELTA");
    expect(result.persisted).toBeNull();
    expect(sink).not.toHaveBeenCalled();
  });

  it("persists exactly one material enrichment with three-way lineage", async () => {
    const sink = vi.fn(async (enrichment) => persisted(enrichment.markdownBody));
    const result = await coordinateCnipaDetailMarkdownEnrichment({
      documentSeed: seed(),
      listRawArtifactId: "raw-list",
      listMarkdownArtifactId: "raw-list-markdown",
      detailRawArtifactId: "raw-detail",
      detailBody: bytes({
        code: 0,
        data: {
          citedMarks: [{ regNo: "456" }],
        },
      }),
      sink,
    });

    expect(result.status).toBe("CREATED");
    if (result.status !== "CREATED") return;
    expect(result.decision.enrichment).toMatchObject({
      listArtifactId: "raw-list",
      listMarkdownArtifactId: "raw-list-markdown",
      detailArtifactId: "raw-detail",
    });
    expect(sink).toHaveBeenCalledTimes(1);
    expect(result.persisted.sha256).toBe(
      result.decision.enrichment.enrichedMarkdownSha256,
    );
  });

  it("fails closed when material enrichment persistence is uncertain", async () => {
    const sink = vi.fn(async () => {
      throw new Error("markdown persistence uncertain");
    }) as CnipaDetailMarkdownPersistenceSink;

    await expect(
      coordinateCnipaDetailMarkdownEnrichment({
        documentSeed: seed(),
        listRawArtifactId: "raw-list",
        listMarkdownArtifactId: "raw-list-markdown",
        detailRawArtifactId: "raw-detail",
        detailBody: bytes({
          code: 0,
          data: {
            respondent: "Example Respondent",
          },
        }),
        sink,
      }),
    ).rejects.toThrow(/markdown persistence uncertain/i);
    expect(sink).toHaveBeenCalledTimes(1);
  });
});
