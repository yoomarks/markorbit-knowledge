import { describe, expect, it } from "vitest";
import type { ArtifactUploadDescriptor } from "@markorbit/contracts";
import {
  ingestCnipaEnrichedMarkdown,
  type CnipaEnrichedMarkdownIngestionRepository,
} from "./cnipa-detail-markdown-ingestion";

function fakeRepository(captured: { descriptor?: ArtifactUploadDescriptor; key?: string }) {
  return {
    createSession(input: { descriptor: ArtifactUploadDescriptor; idempotencyKey: string }) {
      captured.descriptor = input.descriptor;
      captured.key = input.idempotencyKey;
      return { record: { session: { id: "session-1" } } };
    },
    async uploadContent() {},
    async finalize() {
      const sha = captured.descriptor?.expectedSha256 ?? "";
      return {
        artifact: {
          artifact: { id: "raw_markdown_enriched" },
          contentObject: { sha256: sha },
        },
      };
    },
  } as unknown as CnipaEnrichedMarkdownIngestionRepository;
}

describe("CNIPA enriched Markdown ingestion", () => {
  it("keeps the logical canonical URI and binds all three immutable parents", async () => {
    const captured: { descriptor?: ArtifactUploadDescriptor; key?: string } = {};
    const markdown = new TextEncoder().encode(
      "# Decision\n\nBase\n\n## DETAIL enrichment\n\n- respondent: Example\n",
    );

    const result = await ingestCnipaEnrichedMarkdown({
      repository: fakeRepository(captured),
      execution: {
        workerId: "worker-1",
        credential: "credential",
        leaseId: "lease-1",
        leaseToken: "token",
      },
      enrichment: {
        documentKind: "OPPOSITION_DECISION",
        sourceRecordId: "detail-1",
        detailCanonicalUri:
          "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/pubnotice/portal/tmyyJudgment/queryInfo?id=detail-1",
        logicalDocumentUri: "cnipa://judgment/OPPOSITION_DECISION/detail-1",
        listMarkdownArtifactId: "raw_list_markdown",
        listRawArtifactId: "raw_list_json",
        detailRawArtifactId: "raw_detail_json",
        markdownContent: markdown,
      },
    });

    expect(result.artifact.artifact.id).toBe("raw_markdown_enriched");
    expect(captured.descriptor).toMatchObject({
      artifactKind: "MARKDOWN",
      canonicalUri: "cnipa://judgment/OPPOSITION_DECISION/detail-1",
      parentArtifactIds: [
        "raw_list_markdown",
        "raw_list_json",
        "raw_detail_json",
      ],
    });
    expect(captured.descriptor?.sourceUri).toContain(
      "markorbit+cnipa://detail-enrichment/",
    );
    expect(captured.key).toContain("cnipa-detail-markdown:");
    expect(captured.key).toContain(result.sha256);
  });

  it("rejects cross-identity logical or DETAIL URIs", async () => {
    const captured: { descriptor?: ArtifactUploadDescriptor; key?: string } = {};
    const base = {
      documentKind: "REVIEW_ADJUDICATION" as const,
      sourceRecordId: "review-1",
      detailCanonicalUri:
        "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/pubnotice/portal/tmpsJudgment/queryInfo?id=review-1",
      logicalDocumentUri: "cnipa://judgment/REVIEW_ADJUDICATION/review-1",
      listMarkdownArtifactId: "raw_list_markdown",
      listRawArtifactId: "raw_list_json",
      detailRawArtifactId: "raw_detail_json",
      markdownContent: new TextEncoder().encode("# Review\n"),
    };

    await expect(
      ingestCnipaEnrichedMarkdown({
        repository: fakeRepository(captured),
        execution: {
          workerId: "worker-1",
          credential: "credential",
          leaseId: "lease-1",
          leaseToken: "token",
        },
        enrichment: {
          ...base,
          logicalDocumentUri: "cnipa://judgment/OPPOSITION_DECISION/review-1",
        },
      }),
    ).rejects.toThrow(/logical document URI/i);
  });

  it("rejects duplicate parent artifact identities", async () => {
    const captured: { descriptor?: ArtifactUploadDescriptor; key?: string } = {};
    await expect(
      ingestCnipaEnrichedMarkdown({
        repository: fakeRepository(captured),
        execution: {
          workerId: "worker-1",
          credential: "credential",
          leaseId: "lease-1",
          leaseToken: "token",
        },
        enrichment: {
          documentKind: "REGISTRATION_EXAMINATION",
          sourceRecordId: "exam-1",
          detailCanonicalUri:
            "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/pubnotice/portal/tmscJudgment/queryInfo?id=exam-1",
          logicalDocumentUri: "cnipa://judgment/REGISTRATION_EXAMINATION/exam-1",
          listMarkdownArtifactId: "same-parent",
          listRawArtifactId: "same-parent",
          detailRawArtifactId: "raw_detail_json",
          markdownContent: new TextEncoder().encode("# Examination\n"),
        },
      }),
    ).rejects.toThrow(/parents must be distinct/i);
  });
});
