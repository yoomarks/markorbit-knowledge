import { describe, expect, it } from "vitest";
import { USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1 } from "@markorbit/contracts";
import {
  attestUsptoMarkFormatSource,
  extractUsptoLastUpdatedDate,
  matchedUsptoMarkFormatAnchors,
  observeUsptoMarkFormatHttp,
  type UsptoMarkFormatAttestationDependencies,
} from "./uspto-mark-format-source-attestation";

const SOURCE = USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.sources[1];
const WORKSPACE_ID = "wsp_test";
const SOURCE_ID = "src_test";
const BODY = `<html><body>${SOURCE.requiredAnchors.join(". ")}. Last updated on: Jan 18, 2025 12:00 AM EST</body></html>`;

function dependencies(
  input: { rawMissing?: boolean } = {},
): UsptoMarkFormatAttestationDependencies {
  const document = {
    protocolVersion: "1.0",
    objectType: "RETRIEVAL_DOCUMENT",
    documentId: "doc_test",
    workspaceId: WORKSPACE_ID,
    sourceId: SOURCE_ID,
    stagingDocumentId: "stg_test",
    readyPackageId: "rpk_test",
    rawArtifactId: "art_test",
    logicalDocumentId: "logical_test",
    artifactVersion: 1,
    title: "Drawing of your trademark",
    targetPath: "sources/uspto/mark-drawings.md",
    canonicalUri: SOURCE.canonicalUri,
    sourceUri: SOURCE.canonicalUri,
    sourceName: "USPTO Mark Format - MARK_DRAWINGS",
    sourceCategory: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    jurisdictions: ["US"],
    languages: ["en-US"],
    capturedAt: "2026-09-05T12:00:00.000Z",
    publishedAt: null,
    contentSha256: "a".repeat(64),
    keywords: [],
    chunkCount: 4,
    indexedAt: "2026-09-05T12:05:00.000Z",
    isCurrent: true,
  } as const;
  const firstAnchor = SOURCE.evidenceQueries[0].passageAnchor;
  const splitAt = firstAnchor.indexOf(" shows ");
  const chunks = [
    {
      protocolVersion: "1.0" as const,
      objectType: "RETRIEVAL_CHUNK" as const,
      chunkId: "rch_first_a",
      documentId: document.documentId,
      stagingDocumentId: document.stagingDocumentId,
      artifactVersion: 1,
      ordinal: 1,
      headingPath: [],
      text: firstAnchor.slice(0, splitAt),
      contentSha256: "b".repeat(64),
    },
    {
      protocolVersion: "1.0" as const,
      objectType: "RETRIEVAL_CHUNK" as const,
      chunkId: "rch_first_b",
      documentId: document.documentId,
      stagingDocumentId: document.stagingDocumentId,
      artifactVersion: 1,
      ordinal: 2,
      headingPath: [],
      text: firstAnchor.slice(splitAt + 1),
      contentSha256: "c".repeat(64),
    },
    {
      protocolVersion: "1.0" as const,
      objectType: "RETRIEVAL_CHUNK" as const,
      chunkId: "rch_second",
      documentId: document.documentId,
      stagingDocumentId: document.stagingDocumentId,
      artifactVersion: 1,
      ordinal: 3,
      headingPath: [],
      text: SOURCE.evidenceQueries[1].passageAnchor,
      contentSha256: "d".repeat(64),
    },
    {
      protocolVersion: "1.0" as const,
      objectType: "RETRIEVAL_CHUNK" as const,
      chunkId: "rch_third",
      documentId: document.documentId,
      stagingDocumentId: document.stagingDocumentId,
      artifactVersion: 1,
      ordinal: 4,
      headingPath: [],
      text: SOURCE.evidenceQueries[2].passageAnchor,
      contentSha256: "e".repeat(64),
    },
  ];

  return {
    sources: {
      getById: () => ({
        schemaVersion: "1.0",
        objectType: "SOURCE_DEFINITION",
        id: SOURCE_ID,
        workspaceId: WORKSPACE_ID,
        name: "USPTO Mark Format - MARK_DRAWINGS",
        slug: "uspto-mark-format-mark-drawings-v1",
        sourceType: "WEB",
        category: "OFFICIAL_AUTHORITY",
        authorityLevel: "PRIMARY_OFFICIAL",
        status: "ACTIVE",
        jurisdictions: ["US"],
        languages: ["en-US"],
        connector: { connectorId: "crawl4ai-web", version: "1.2.0" },
        connectorConfig: {},
        canonicalUri: SOURCE.canonicalUri,
        entrypoints: [{ uri: SOURCE.canonicalUri }],
        tags: [],
        createdAt: "2026-09-05T11:00:00.000Z",
        updatedAt: "2026-09-05T11:00:00.000Z",
        extensions: {
          "x-markorbit-reference-profile": USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.profileId,
          "x-markorbit-source-version": SOURCE.sourceVersion,
          "x-markorbit-source-last-updated": SOURCE.expectedLastUpdatedDate,
        },
      }),
    },
    retrieval: {
      search: (request: { query: string }) => ({
        protocolVersion: "1.0",
        objectType: "RETRIEVAL_SEARCH_RESULT",
        indexMode: "SQLITE_FTS5_BM25",
        query: request.query,
        items: [
          {
            document,
            chunk: chunks[0]!,
            score: 1,
            snippet: chunks[0]!.text,
          },
        ],
        total: 1,
      }),
      listChunks: () => chunks,
    },
    rawArtifacts: {
      getArtifact: () =>
        input.rawMissing
          ? null
          : ({
              artifact: {
                id: "art_test",
                workspaceId: WORKSPACE_ID,
                sourceId: SOURCE_ID,
                version: 1,
                canonicalUri: SOURCE.canonicalUri,
                provenance: { sourceUri: SOURCE.canonicalUri },
              },
            } as never),
    },
    staging: {
      readContent: () => new TextEncoder().encode(BODY),
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      url: SOURCE.canonicalUri,
      text: async () => BODY,
    }),
  } as unknown as UsptoMarkFormatAttestationDependencies;
}

describe("USPTO mark-format source attestation", () => {
  it("extracts Last updated metadata and bounded anchors deterministically", () => {
    expect(extractUsptoLastUpdatedDate(BODY)).toBe("2025-01-18");
    expect(matchedUsptoMarkFormatAnchors(BODY, SOURCE.requiredAnchors)).toEqual([
      ...SOURCE.requiredAnchors,
    ]);
  });
  it("accepts a closed Source -> RawArtifact -> Retrieval lineage with all fact bindings", async () => {
    const evidence = await attestUsptoMarkFormatSource({
      workspaceId: WORKSPACE_ID,
      sourceId: SOURCE_ID,
      sourceKey: "MARK_DRAWINGS",
      dependencies: dependencies(),
      now: new Date("2026-09-06T12:00:00.000Z"),
    });
    expect(evidence.documentId).toBe("doc_test");
    expect(evidence.rawArtifactId).toBe("art_test");
    expect(evidence.sourceVersion).toBe("2025-01-18");
    expect(new Set(evidence.chunks.map((chunk) => chunk.factId))).toEqual(
      new Set(SOURCE.evidenceQueries.map((query) => query.factId)),
    );
    expect(evidence.chunks).toHaveLength(4);
  });

  it("binds one fact across adjacent exact chunks without semantic selection", async () => {
    const evidence = await attestUsptoMarkFormatSource({
      workspaceId: WORKSPACE_ID,
      sourceId: SOURCE_ID,
      sourceKey: "MARK_DRAWINGS",
      dependencies: dependencies(),
      now: new Date("2026-09-06T12:00:00.000Z"),
    });
    const firstFact = evidence.chunks.filter(
      (chunk) => chunk.factId === "STANDARD_CHARACTER_TEXT_ONLY",
    );
    expect(firstFact.map((chunk) => chunk.chunkId)).toEqual(["rch_first_a", "rch_first_b"]);
    expect(firstFact.map((chunk) => chunk.ordinal)).toEqual([1, 2]);
    expect(firstFact.map((chunk) => chunk.chunkContentSha256)).toEqual([
      "b".repeat(64),
      "c".repeat(64),
    ]);
    expect(new Set(evidence.chunks.map((chunk) => chunk.factId))).toEqual(
      new Set(SOURCE.evidenceQueries.map((query) => query.factId)),
    );
  });

  it("binds passages wholly inside one chunk and across more than two adjacent chunks", async () => {
    const single = await attestUsptoMarkFormatSource({
      workspaceId: WORKSPACE_ID,
      sourceId: SOURCE_ID,
      sourceKey: "MARK_DRAWINGS",
      dependencies: dependencies(),
      now: new Date("2026-09-06T12:00:00.000Z"),
    });
    expect(
      single.chunks.filter((chunk) => chunk.factId === "SPECIAL_FORM_STYLIZED_DESIGN_COLOR"),
    ).toEqual([expect.objectContaining({ chunkId: "rch_second", ordinal: 3 })]);

    const spanning = dependencies();
    const original = spanning.retrieval.listChunks("stg_test", WORKSPACE_ID);
    spanning.retrieval.listChunks = () => [
      {
        ...original[0]!,
        chunkId: "rch_span_a",
        ordinal: 1,
        text: "**standard character",
      },
      {
        ...original[1]!,
        chunkId: "rch_span_b",
        ordinal: 2,
        text: "drawing** shows a",
      },
      {
        ...original[1]!,
        chunkId: "rch_span_c",
        ordinal: 3,
        text: "[trademark](https://example.test/mark) in text only",
      },
      { ...original[2]!, ordinal: 4 },
      { ...original[3]!, ordinal: 5 },
    ];
    const evidence = await attestUsptoMarkFormatSource({
      workspaceId: WORKSPACE_ID,
      sourceId: SOURCE_ID,
      sourceKey: "MARK_DRAWINGS",
      dependencies: spanning,
      now: new Date("2026-09-06T12:00:00.000Z"),
    });
    expect(
      evidence.chunks
        .filter((chunk) => chunk.factId === "STANDARD_CHARACTER_TEXT_ONLY")
        .map((chunk) => chunk.chunkId),
    ).toEqual(["rch_span_a", "rch_span_b", "rch_span_c"]);
  });

  it("matches normalized visible text through Markdown emphasis and links", async () => {
    const markdown = dependencies();
    const chunks = markdown.retrieval.listChunks("stg_test", WORKSPACE_ID);
    markdown.retrieval.listChunks = () => [
      {
        ...chunks[0]!,
        chunkId: "rch_markdown",
        ordinal: 1,
        text: "1. A **standard character drawing** shows a [trademark](https://example.test/mark) in text only (without a design).",
      },
      { ...chunks[2]!, ordinal: 2 },
      { ...chunks[3]!, ordinal: 3 },
    ];
    const evidence = await attestUsptoMarkFormatSource({
      workspaceId: WORKSPACE_ID,
      sourceId: SOURCE_ID,
      sourceKey: "MARK_DRAWINGS",
      dependencies: markdown,
      now: new Date("2026-09-06T12:00:00.000Z"),
    });
    expect(
      evidence.chunks.find((chunk) => chunk.factId === "STANDARD_CHARACTER_TEXT_ONLY"),
    ).toEqual(expect.objectContaining({ chunkId: "rch_markdown", ordinal: 1 }));
  });

  it("uses heading metadata only as a deterministic second-stage passage prefix", async () => {
    const heading = dependencies();
    const chunks = heading.retrieval.listChunks("stg_test", WORKSPACE_ID);
    heading.retrieval.listChunks = () => [
      {
        ...chunks[0]!,
        chunkId: "rch_heading_text",
        ordinal: 1,
        headingPath: ["Standard character drawing"],
        text: "shows a **trademark** in text only",
      },
      { ...chunks[2]!, ordinal: 2 },
      { ...chunks[3]!, ordinal: 3 },
    ];
    const evidence = await attestUsptoMarkFormatSource({
      workspaceId: WORKSPACE_ID,
      sourceId: SOURCE_ID,
      sourceKey: "MARK_DRAWINGS",
      dependencies: heading,
      now: new Date("2026-09-06T12:00:00.000Z"),
    });
    expect(
      evidence.chunks.find((chunk) => chunk.factId === "STANDARD_CHARACTER_TEXT_ONLY"),
    ).toEqual(expect.objectContaining({ chunkId: "rch_heading_text", ordinal: 1 }));
  });

  it("fails closed when an exact fact passage is missing or duplicated", async () => {
    const missing = dependencies();
    const original = missing.retrieval.listChunks("stg_test", WORKSPACE_ID);
    missing.retrieval.listChunks = () => original.slice(1);
    await expect(
      attestUsptoMarkFormatSource({
        workspaceId: WORKSPACE_ID,
        sourceId: SOURCE_ID,
        sourceKey: "MARK_DRAWINGS",
        dependencies: missing,
        now: new Date("2026-09-06T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "USPTO_MARK_FORMAT_FACT_EVIDENCE_MISSING" });

    const duplicate = dependencies();
    const chunks = duplicate.retrieval.listChunks("stg_test", WORKSPACE_ID);
    duplicate.retrieval.listChunks = () => [
      ...chunks,
      { ...chunks[2]!, chunkId: "rch_second_duplicate", ordinal: 5 },
    ];
    await expect(
      attestUsptoMarkFormatSource({
        workspaceId: WORKSPACE_ID,
        sourceId: SOURCE_ID,
        sourceKey: "MARK_DRAWINGS",
        dependencies: duplicate,
        now: new Date("2026-09-06T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "USPTO_MARK_FORMAT_FACT_EVIDENCE_AMBIGUOUS" });
  });

  it("does not join non-adjacent chunks or select navigation noise", async () => {
    const nonAdjacent = dependencies();
    const chunks = nonAdjacent.retrieval.listChunks("stg_test", WORKSPACE_ID);
    nonAdjacent.retrieval.listChunks = () => [
      chunks[0]!,
      { ...chunks[1]!, ordinal: 3 },
      { ...chunks[2]!, ordinal: 4 },
      { ...chunks[3]!, ordinal: 5 },
    ];
    await expect(
      attestUsptoMarkFormatSource({
        workspaceId: WORKSPACE_ID,
        sourceId: SOURCE_ID,
        sourceKey: "MARK_DRAWINGS",
        dependencies: nonAdjacent,
        now: new Date("2026-09-06T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "USPTO_MARK_FORMAT_FACT_EVIDENCE_MISSING" });

    const noisy = dependencies();
    const original = noisy.retrieval.listChunks("stg_test", WORKSPACE_ID);
    noisy.retrieval.listChunks = () => [
      {
        ...original[0]!,
        chunkId: "rch_navigation",
        ordinal: 1,
        headingPath: ["Navigation"],
        text: "Standard character information, drawing examples, and text-only help links.",
      },
      ...original.map((chunk) => ({ ...chunk, ordinal: chunk.ordinal + 1 })),
    ];
    const evidence = await attestUsptoMarkFormatSource({
      workspaceId: WORKSPACE_ID,
      sourceId: SOURCE_ID,
      sourceKey: "MARK_DRAWINGS",
      dependencies: noisy,
      now: new Date("2026-09-06T12:00:00.000Z"),
    });
    expect(evidence.chunks.some((chunk) => chunk.chunkId === "rch_navigation")).toBe(false);
  });

  it("fails closed when retrieval chunk identity is duplicated", async () => {
    const duplicate = dependencies();
    const chunks = duplicate.retrieval.listChunks("stg_test", WORKSPACE_ID);
    duplicate.retrieval.listChunks = () => [...chunks, { ...chunks[0]!, ordinal: 5 }];
    await expect(
      attestUsptoMarkFormatSource({
        workspaceId: WORKSPACE_ID,
        sourceId: SOURCE_ID,
        sourceKey: "MARK_DRAWINGS",
        dependencies: duplicate,
        now: new Date("2026-09-06T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "USPTO_MARK_FORMAT_CHUNK_LINEAGE_INVALID" });
  });

  it("fails closed when the exact RawArtifact is missing", async () => {
    await expect(
      attestUsptoMarkFormatSource({
        workspaceId: WORKSPACE_ID,
        sourceId: SOURCE_ID,
        sourceKey: "MARK_DRAWINGS",
        dependencies: dependencies({ rawMissing: true }),
        now: new Date("2026-09-06T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "USPTO_MARK_FORMAT_RAW_ARTIFACT_MISSING" });
  });
  it("fails closed on HTTP transport failure or redirect drift", async () => {
    await expect(
      observeUsptoMarkFormatHttp("MARK_DRAWINGS", async () => {
        throw new Error("network down");
      }),
    ).rejects.toMatchObject({ code: "USPTO_MARK_FORMAT_HTTP_UNAVAILABLE" });

    await expect(
      observeUsptoMarkFormatHttp("MARK_DRAWINGS", async () => ({
        ok: true,
        status: 200,
        url: "https://www.uspto.gov/trademarks/basics/other",
        text: async () => BODY,
      })),
    ).rejects.toMatchObject({ code: "USPTO_MARK_FORMAT_HTTP_URI_DRIFT" });
  });

  it("fails closed when HTTP Last updated metadata is absent", async () => {
    await expect(
      observeUsptoMarkFormatHttp("MARK_DRAWINGS", async () => ({
        ok: true,
        status: 200,
        url: SOURCE.canonicalUri,
        text: async () => `<html>${SOURCE.requiredAnchors.join(" ")}</html>`,
      })),
    ).rejects.toMatchObject({ code: "USPTO_MARK_FORMAT_HTTP_METADATA_MISSING" });
  });
});
