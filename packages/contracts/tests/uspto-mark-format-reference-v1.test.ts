import { describe, expect, it } from "vitest";
import {
  USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1,
  assessUsptoMarkFormatSourceEvidenceV1,
  type UsptoMarkFormatSourceEvidenceV1,
  type UsptoMarkFormatSourceKey,
} from "../src/uspto-mark-format-reference-v1";

const NOW = new Date("2026-09-06T12:00:00.000Z");

function evidence(
  sourceKey: UsptoMarkFormatSourceKey = "MARK_DRAWINGS",
  overrides: Partial<UsptoMarkFormatSourceEvidenceV1> = {},
): UsptoMarkFormatSourceEvidenceV1 {
  const source = USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.sources.find(
    (candidate) => candidate.sourceKey === sourceKey,
  )!;
  return {
    protocolVersion: "1.0",
    objectType: "USPTO_MARK_FORMAT_SOURCE_EVIDENCE",
    profileId: "uspto-mark-format-reference-v1",
    sourceKey,
    sourceVersion: source.sourceVersion,
    canonicalUri: source.canonicalUri,
    sourceLastUpdatedDate: source.expectedLastUpdatedDate,
    httpLastUpdatedDate: source.expectedLastUpdatedDate,
    workspaceId: "wsp_test",
    sourceId: "src_test",
    documentId: "doc_test",
    rawArtifactId: "art_test",
    artifactVersion: 1,
    documentContentSha256: "a".repeat(64),
    chunks: source.evidenceQueries.map((query, index) => ({
      factId: query.factId,
      queryText: query.queryText,
      chunkId: `rch_test_${index}`,
      chunkContentSha256: "b".repeat(64),
    })),
    capturedAt: "2026-09-05T12:00:00.000Z",
    indexedAt: "2026-09-05T12:05:00.000Z",
    isCurrent: true,
    browserAnchorsMatched: [...source.requiredAnchors],
    httpBodySha256: "c".repeat(64),
    httpAnchorsMatched: [...source.requiredAnchors],
    ...overrides,
  };
}

describe("USPTO mark-format governed reference V1", () => {
  it("freezes only the two bounded USPTO pages and excludes moving TMEP current alias", () => {
    expect(USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.sources).toHaveLength(2);
    expect(
      USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.sources.map((source) => source.sourceVersion),
    ).toEqual(["2023-11-30", "2025-01-18"]);
    expect(USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.tmepCorroboration.status).toBe(
      "EXCLUDED_UNTIL_VERSION_IDENTITY_PROVEN",
    );
    expect(JSON.stringify(USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1)).not.toContain("fee-information");
  });

  it("keeps core mark-drawing fact passages aligned with proven transport anchors", () => {
    const source = USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.sources[1];
    const factIds = new Set(["STANDARD_CHARACTER_TEXT_ONLY", "SPECIAL_FORM_STYLIZED_DESIGN_COLOR"]);
    for (const query of source.evidenceQueries.filter((candidate) =>
      factIds.has(candidate.factId),
    )) {
      expect(source.requiredAnchors).toContain(query.passageAnchor);
    }
  });
  it("accepts exact recent browser plus HTTP evidence as CURRENT", () => {
    expect(assessUsptoMarkFormatSourceEvidenceV1(evidence(), NOW)).toEqual({
      protocolVersion: "1.0",
      objectType: "USPTO_MARK_FORMAT_CURRENTNESS_ASSESSMENT",
      sourceKey: "MARK_DRAWINGS",
      state: "CURRENT",
      reasonCodes: [],
    });
  });
  it("fails closed when capture freshness is stale or the retrieval document is not current", () => {
    const stale = assessUsptoMarkFormatSourceEvidenceV1(
      evidence("MARK_DRAWINGS", { capturedAt: "2026-07-01T00:00:00.000Z" }),
      NOW,
    );
    expect(stale.state).toBe("STALE");
    expect(stale.reasonCodes).toContain("CAPTURE_STALE");

    const superseded = assessUsptoMarkFormatSourceEvidenceV1(
      evidence("MARK_DRAWINGS", { isCurrent: false }),
      NOW,
    );
    expect(superseded.state).toBe("STALE");
    expect(superseded.reasonCodes).toContain("RETRIEVAL_DOCUMENT_NOT_CURRENT");
  });

  it("classifies source-version, metadata, URI and transport anchor mismatch as DRIFT", () => {
    const source = USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.sources[1];
    const drift = assessUsptoMarkFormatSourceEvidenceV1(
      evidence("MARK_DRAWINGS", {
        sourceVersion: "2024-01-01",
        canonicalUri: "https://www.uspto.gov/trademarks/basics/other",
        sourceLastUpdatedDate: "2024-01-01",
        httpLastUpdatedDate: "2024-01-01",
        browserAnchorsMatched: source.requiredAnchors.slice(1),
        httpAnchorsMatched: source.requiredAnchors.slice(0, -1),
      }),
      NOW,
    );
    expect(drift.state).toBe("DRIFT");
    expect(drift.reasonCodes).toEqual(
      expect.arrayContaining([
        "SOURCE_VERSION_DRIFT",
        "SOURCE_URI_DRIFT",
        "SOURCE_LAST_UPDATED_DRIFT",
        "HTTP_LAST_UPDATED_DRIFT",
        "BROWSER_ANCHOR_DRIFT",
        "HTTP_ANCHOR_DRIFT",
      ]),
    );
  });
  it("classifies missing or tampered exact lineage as UNVERIFIED", () => {
    const result = assessUsptoMarkFormatSourceEvidenceV1(
      evidence("DRAWINGS_AND_SPECIMENS", {
        rawArtifactId: "",
        documentContentSha256: "not-a-sha",
        chunks: [
          {
            factId: "DRAWING_REQUIRED",
            queryText: "application include depiction trademark drawing",
            chunkId: "",
            chunkContentSha256: "also-bad",
          },
        ],
      }),
      NOW,
    );
    expect(result.state).toBe("UNVERIFIED");
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "LINEAGE_IDENTITY_MISSING",
        "CONTENT_SHA256_INVALID",
        "CHUNK_LINEAGE_INVALID",
      ]),
    );
  });

  it("requires every bounded fact and permits multi-chunk passage lineage", () => {
    const source = USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.sources[1];
    const missing = assessUsptoMarkFormatSourceEvidenceV1(
      evidence("MARK_DRAWINGS", { chunks: evidence("MARK_DRAWINGS").chunks.slice(1) }),
      NOW,
    );
    expect(missing.state).toBe("UNVERIFIED");
    expect(missing.reasonCodes).toContain("FACT_BINDING_MISSING");

    const base = evidence("MARK_DRAWINGS");
    const first = base.chunks[0]!;
    const spanning = assessUsptoMarkFormatSourceEvidenceV1(
      evidence("MARK_DRAWINGS", {
        chunks: [
          ...base.chunks,
          { ...first, chunkId: "rch_test_span", chunkContentSha256: "d".repeat(64) },
        ],
      }),
      NOW,
    );
    expect(spanning.state).toBe("CURRENT");
    expect(spanning.reasonCodes).toEqual([]);

    const duplicate = assessUsptoMarkFormatSourceEvidenceV1(
      evidence("MARK_DRAWINGS", { chunks: [...base.chunks, first] }),
      NOW,
    );
    expect(duplicate.state).toBe("UNVERIFIED");
    expect(duplicate.reasonCodes).toContain("FACT_BINDING_DUPLICATE");
    expect(source.evidenceQueries).toHaveLength(3);
  });

  it("keeps Knowledge on source evidence and out of recommendation/filing authority", () => {
    expect(USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.scope.sourceEvidenceOnly).toBe(true);
    expect(USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.boundary.forbiddenUses).toEqual(
      expect.arrayContaining([
        "LEGAL_CONCLUSION",
        "CUSTOMER_RECOMMENDATION",
        "FILING_AUTHORIZATION",
        "REGISTRABILITY_INFERENCE",
        "OFFICIAL_STATUS_INFERENCE",
      ]),
    );
  });
});
