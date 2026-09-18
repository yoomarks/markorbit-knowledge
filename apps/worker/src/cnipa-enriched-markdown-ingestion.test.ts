import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { RawArtifactView } from "@markorbit/persistence/raw-artifacts";
import type { CnipaDetailMarkdownEnrichmentV1 } from "@markorbit/worker-runtime/cnipa-detail-markdown-enrichment";
import {
  ingestCnipaEnrichedMarkdown,
  type CnipaEnrichedMarkdownIngestionRepository,
} from "./cnipa-enriched-markdown-ingestion";

const LIST_ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const DETAIL_ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAW";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function enrichment(
  overrides: Partial<CnipaDetailMarkdownEnrichmentV1> = {},
): CnipaDetailMarkdownEnrichmentV1 {
  const markdownBody =
    "# 异议决定书\n\n商标：MO\n\n## CNIPA DETAIL enrichment\n\n- `/citedMarks/0/regNo`: `\"456\"`\n";
  return {
    schemaVersion: "cnipa-detail-markdown-enrichment-v1",
    sourceAuthority: "CNIPA",
    documentKind: "OPPOSITION_DECISION",
    sourceRecordId: "record-1",
    logicalDocumentUri: "cnipa://judgment/OPPOSITION_DECISION/record-1",
    title: "异议决定书",
    listArtifactId: LIST_ARTIFACT_ID,
    detailArtifactId: DETAIL_ARTIFACT_ID,
    baseMarkdownSha256: "a".repeat(64),
    detailBodySha256: "b".repeat(64),
    enrichedMarkdownSha256: digest(markdownBody),
    materialEvidence: [{ path: "/citedMarks/0/regNo", value: "456" }],
    markdownBody,
    ...overrides,
  };
}

function repositoryFixture() {
  const createSession = vi.fn((input: unknown) => ({
    record: { session: { id: "ing_test" } },
    input,
  }));
  const uploaded: Uint8Array[] = [];
  const uploadContent = vi.fn(
    async (
      _workerId: string,
      _credential: string,
      _leaseId: string,
      _leaseToken: string,
      _sessionId: string,
      stream: AsyncIterable<Uint8Array>,
    ) => {
      for await (const chunk of stream) uploaded.push(chunk);
    },
  );
  const finalize = vi.fn(async () => ({
    artifact: {
      artifact: { id: "art_01ARZ3NDEKTSV4RRFFQ69G5FAX" },
      contentObject: { sha256: digest(enrichment().markdownBody) },
    } as RawArtifactView,
  }));
  const repository = {
    createSession,
    uploadContent,
    finalize,
  } as unknown as CnipaEnrichedMarkdownIngestionRepository;
  return { repository, createSession, uploadContent, finalize, uploaded };
}

const execution = {
  workerId: "wrk_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  credential: "credential",
  leaseId: "lse_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  leaseToken: "lease-token",
};

describe("CNIPA enriched Markdown ingestion", () => {
  it("creates a MARKDOWN RawArtifact with stable logical identity and dual lineage", async () => {
    const fixture = repositoryFixture();
    const seed = enrichment();

    const result = await ingestCnipaEnrichedMarkdown({
      repository: fixture.repository,
      execution,
      enrichment: seed,
    });

    expect(result.sha256).toBe(seed.enrichedMarkdownSha256);
    expect(fixture.createSession).toHaveBeenCalledTimes(1);
    const call = fixture.createSession.mock.calls[0]![0] as {
      descriptor: {
        artifactKind: string;
        mimeType: string;
        sourceUri: string;
        canonicalUri: string;
        parentArtifactIds: string[];
        expectedSha256: string;
      };
      idempotencyKey: string;
    };
    expect(call.descriptor).toMatchObject({
      artifactKind: "MARKDOWN",
      mimeType: "text/markdown",
      sourceUri: seed.logicalDocumentUri,
      canonicalUri: seed.logicalDocumentUri,
      parentArtifactIds: [LIST_ARTIFACT_ID, DETAIL_ARTIFACT_ID],
      expectedSha256: seed.enrichedMarkdownSha256,
    });
    expect(call.idempotencyKey).toMatch(/^cnipa-enriched-md:[a-f0-9]{20}:[a-f0-9]{64}$/);
    expect(new TextDecoder().decode(fixture.uploaded[0])).toBe(seed.markdownBody);
  });

  it("uses the same idempotency key for an identical enrichment replay", async () => {
    const fixture = repositoryFixture();
    const seed = enrichment();

    await ingestCnipaEnrichedMarkdown({
      repository: fixture.repository,
      execution,
      enrichment: seed,
    });
    await ingestCnipaEnrichedMarkdown({
      repository: fixture.repository,
      execution,
      enrichment: seed,
    });

    const keys = fixture.createSession.mock.calls.map(
      (call) => (call[0] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(keys[0]).toBe(keys[1]);
  });

  it("changes idempotency identity when DETAIL evidence changes", async () => {
    const fixture = repositoryFixture();
    const first = enrichment();
    const secondBody =
      "# 异议决定书\n\n商标：MO\n\n## CNIPA DETAIL enrichment\n\n- `/extra`: `true`\n";
    const second = enrichment({
      detailBodySha256: "c".repeat(64),
      markdownBody: secondBody,
      enrichedMarkdownSha256: digest(secondBody),
      materialEvidence: [{ path: "/extra", value: true }],
    });

    await ingestCnipaEnrichedMarkdown({
      repository: fixture.repository,
      execution,
      enrichment: first,
    });
    fixture.finalize.mockResolvedValueOnce({
      artifact: {
        artifact: { id: "art_01ARZ3NDEKTSV4RRFFQ69G5FAY" },
        contentObject: { sha256: second.enrichedMarkdownSha256 },
      } as RawArtifactView,
    });
    await ingestCnipaEnrichedMarkdown({
      repository: fixture.repository,
      execution,
      enrichment: second,
    });

    const keys = fixture.createSession.mock.calls.map(
      (call) => (call[0] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("rejects identical LIST and DETAIL parent identities", async () => {
    const fixture = repositoryFixture();
    await expect(
      ingestCnipaEnrichedMarkdown({
        repository: fixture.repository,
        execution,
        enrichment: enrichment({ detailArtifactId: LIST_ARTIFACT_ID }),
      }),
    ).rejects.toThrow(/distinct LIST and DETAIL parent artifacts/i);
    expect(fixture.createSession).not.toHaveBeenCalled();
  });

  it("rejects Markdown bytes that do not match the frozen D1 digest", async () => {
    const fixture = repositoryFixture();
    await expect(
      ingestCnipaEnrichedMarkdown({
        repository: fixture.repository,
        execution,
        enrichment: enrichment({ enrichedMarkdownSha256: "f".repeat(64) }),
      }),
    ).rejects.toThrow(/bytes do not match seed SHA-256/i);
    expect(fixture.createSession).not.toHaveBeenCalled();
  });
});
