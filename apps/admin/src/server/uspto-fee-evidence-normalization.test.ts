import { describe, expect, it } from "vitest";
import type { RetrievalChunk, RetrievalDocument } from "@markorbit/contracts";
import {
  resolveUsptoFeeEvidence,
  USPTO_FEE_TEMPORAL_AUTHORITY_URI,
} from "./uspto-fee-evidence-normalization";

const NUMERIC_URI =
  "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule";
const CONTEXT_URI = "https://www.uspto.gov/trademarks/trademark-fee-information";

function document(uri: string, suffix: string): RetrievalDocument {
  return {
    protocolVersion: "1.0",
    objectType: "RETRIEVAL_DOCUMENT",
    documentId: `doc-${suffix}`,
    workspaceId: "workspace-phase2",
    sourceId: `source-${suffix}`,
    stagingDocumentId: `staging-${suffix}`,
    readyPackageId: `ready-${suffix}`,
    rawArtifactId: `artifact-${suffix}`,
    logicalDocumentId: null,
    artifactVersion: 1,
    title: `USPTO ${suffix}`,
    targetPath: `${suffix}.md`,
    canonicalUri: uri,
    sourceUri: uri,
    sourceName: "United States Patent and Trademark Office",
    sourceCategory: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    jurisdictions: ["US"],
    languages: ["en-US"],
    capturedAt: "2026-08-28T00:00:00.000Z",
    publishedAt: null,
    contentSha256: suffix.charCodeAt(0).toString(16).padStart(2, "0").repeat(32),
    keywords: ["trademark", "fee"],
    chunkCount: 2,
    indexedAt: "2026-08-28T00:01:00.000Z",
    isCurrent: true,
  };
}

function chunk(doc: RetrievalDocument, id: string, text: string): RetrievalChunk {
  return {
    protocolVersion: "1.0",
    objectType: "RETRIEVAL_CHUNK",
    chunkId: `chunk-${id}`,
    documentId: doc.documentId,
    stagingDocumentId: doc.stagingDocumentId,
    artifactVersion: doc.artifactVersion,
    ordinal: 0,
    headingPath: ["Trademark fees"],
    text,
    contentSha256: id.charCodeAt(0).toString(16).padStart(2, "0").repeat(32),
  };
}

function fixture() {
  const numericDocument = document(NUMERIC_URI, "numeric");
  const temporalDocument = document(USPTO_FEE_TEMPORAL_AUTHORITY_URI, "temporal");
  const applicabilityDocument = document(CONTEXT_URI, "context");
  return {
    numericDocument,
    numericChunk: chunk(
      numericDocument,
      "numeric",
      "| 2.6(a)(1)(iii) | Base application, per class | $350.00 | 7017 |",
    ),
    temporalDocument,
    temporalChunks: [
      chunk(
        temporalDocument,
        "date",
        "The new trademark fees became effective January 18, 2025 for fees paid to the USPTO.",
      ),
      chunk(
        temporalDocument,
        "operation",
        "For applications based on Sections 1 and 44, the base application fee is $350 per class.",
      ),
    ],
    applicabilityDocument,
    applicabilityChunk: chunk(
      applicabilityDocument,
      "context",
      "Section 1 and Section 44 electronic applications are charged a base application fee per class.",
    ),
    asOf: "2026-08-28T00:02:00.000Z",
  };
}

describe("USPTO fee evidence normalization", () => {
  it("extracts value/date from source text and produces deterministic exact evidence refs", () => {
    const first = resolveUsptoFeeEvidence(fixture());
    const replay = resolveUsptoFeeEvidence(fixture());
    expect(first).toEqual(replay);
    expect(first.status).toBe("RESOLVED");
    if (first.status !== "RESOLVED") return;

    expect(first.bundle.amountMinor).toBe(35000);
    expect(first.bundle.currency).toBe("USD");
    expect(first.bundle.effectiveAt).toBe("2025-01-18T00:00:00.000Z");
    expect(first.bundle.numericEvidence.sourceUri).toBe(NUMERIC_URI);
    expect(first.bundle.temporalEvidence).toHaveLength(2);
    expect(first.bundle.temporalEvidence.every((ref) => ref.indexMode === "SQLITE_FTS5_BM25")).toBe(
      true,
    );
  });

  it("does not resolve when the numeric row is missing or changed", () => {
    const input = fixture();
    input.numericChunk = chunk(
      input.numericDocument,
      "numeric",
      "Base application fee information",
    );
    expect(resolveUsptoFeeEvidence(input)).toEqual({
      status: "FAIL_CLOSED",
      reason: "NUMERIC_ROW_UNRESOLVED",
    });
  });

  it("does not derive effectiveAt from retrieval metadata", () => {
    const input = fixture();
    input.temporalChunks = [
      chunk(
        input.temporalDocument,
        "operation",
        "For applications based on Sections 1 and 44, the base application fee is $350 per class.",
      ),
    ];
    input.temporalDocument.publishedAt = "2025-01-18T00:00:00.000Z";
    input.temporalDocument.capturedAt = "2025-01-18T00:00:00.000Z";
    input.temporalDocument.indexedAt = "2025-01-18T00:00:00.000Z";
    expect(resolveUsptoFeeEvidence(input)).toEqual({
      status: "FAIL_CLOSED",
      reason: "TEMPORAL_DATE_UNRESOLVED",
    });
  });

  it("fails closed when temporal operation value conflicts with numeric authority", () => {
    const input = fixture();
    input.temporalChunks = [
      input.temporalChunks[0]!,
      chunk(
        input.temporalDocument,
        "operation",
        "For applications based on Sections 1 and 44, the base application fee is $400 per class.",
      ),
    ];
    expect(resolveUsptoFeeEvidence(input)).toEqual({
      status: "FAIL_CLOSED",
      reason: "CROSS_SOURCE_AMOUNT_CONFLICT",
    });
  });

  it("fails closed on tampered retrieval lineage", () => {
    const input = fixture();
    input.numericChunk = { ...input.numericChunk, artifactVersion: 2 };
    expect(resolveUsptoFeeEvidence(input)).toEqual({
      status: "FAIL_CLOSED",
      reason: "LINEAGE_MISMATCH",
    });
  });
});
