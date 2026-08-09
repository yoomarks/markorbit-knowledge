import { describe, expect, it } from "vitest";
import {
  CANONICAL_MARKDOWN_OBJECT_TYPE,
  CANONICAL_MARKDOWN_VERSION,
  isCanonicalMarkdownMetadataV1,
  type CanonicalMarkdownMetadataV1,
} from "../src/canonical-markdown-v1";

function metadata(): CanonicalMarkdownMetadataV1 {
  return {
    schemaVersion: CANONICAL_MARKDOWN_VERSION,
    objectType: CANONICAL_MARKDOWN_OBJECT_TYPE,
    documentId: "doc-uspto-trademarks",
    workspaceId: "wsp_01H00000000000000000000000",
    sourceId: "src_01H00000000000000000000000",
    sourceName: "USPTO Trademarks",
    sourceCategory: "OFFICIAL_GUIDANCE",
    authorityLevel: "PRIMARY_OFFICIAL",
    jurisdictions: ["US"],
    languages: ["en"],
    rawArtifactId: "art_01H00000000000000000000000",
    logicalDocumentId: "doc-uspto-trademarks",
    artifactVersion: 2,
    artifactKind: "MARKDOWN",
    originalName: "trademarks.md",
    canonicalUri: "https://www.uspto.gov/trademarks",
    sourceUri: "https://www.uspto.gov/trademarks",
    capturedAt: "2026-08-09T00:00:00.000Z",
    publishedAt: null,
    conversionRunId: "cvr_01H00000000000000000000000",
    converterId: "builtin-markdown-staging",
    converterVersion: "1.0.0",
    inputSha256: "a".repeat(64),
  };
}

describe("Canonical Markdown v1", () => {
  it("accepts provenance-only normalized document metadata", () => {
    expect(isCanonicalMarkdownMetadataV1(metadata())).toBe(true);
  });

  it("rejects invalid version, timestamps and digests", () => {
    expect(isCanonicalMarkdownMetadataV1({ ...metadata(), artifactVersion: 0 })).toBe(false);
    expect(isCanonicalMarkdownMetadataV1({ ...metadata(), capturedAt: "not-a-date" })).toBe(false);
    expect(isCanonicalMarkdownMetadataV1({ ...metadata(), inputSha256: "not-a-digest" })).toBe(
      false,
    );
  });
});
