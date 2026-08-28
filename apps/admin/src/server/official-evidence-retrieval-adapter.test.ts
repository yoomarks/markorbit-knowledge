import { describe, expect, it } from "vitest";
import type { RetrievalChunk, RetrievalDocument } from "@markorbit/contracts";
import { evaluateOfficialEvidenceAdmissibility } from "./official-evidence-admissibility";
import { buildOfficialEvidenceFromRetrieval } from "./official-evidence-retrieval-adapter";
import { USPTO_FEE_EVIDENCE_POLICY } from "./uspto-fee-evidence-policy";

function document(
  sourceUri: string,
  overrides: Partial<RetrievalDocument> = {},
): RetrievalDocument {
  return {
    protocolVersion: "1.0",
    objectType: "RETRIEVAL_DOCUMENT",
    documentId: `doc-${sourceUri.includes("fee-schedule") ? "numeric" : "context"}`,
    workspaceId: "workspace-test",
    sourceId: `source-${sourceUri.includes("fee-schedule") ? "numeric" : "context"}`,
    stagingDocumentId: `staging-${sourceUri.includes("fee-schedule") ? "numeric" : "context"}`,
    readyPackageId: "ready-test",
    rawArtifactId: "artifact-test",
    logicalDocumentId: null,
    artifactVersion: 1,
    title: "USPTO official evidence",
    targetPath: "official.md",
    canonicalUri: sourceUri,
    sourceUri,
    sourceName: "United States Patent and Trademark Office",
    sourceCategory: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    jurisdictions: ["US"],
    languages: ["en-US"],
    capturedAt: "2026-08-28T00:00:00.000Z",
    publishedAt: "2025-01-18T00:00:00.000Z",
    contentSha256: sourceUri.includes("fee-schedule") ? "a".repeat(64) : "b".repeat(64),
    keywords: ["trademark", "fee"],
    chunkCount: 1,
    indexedAt: "2026-08-28T00:01:00.000Z",
    isCurrent: true,
    ...overrides,
  };
}

function chunk(doc: RetrievalDocument, overrides: Partial<RetrievalChunk> = {}): RetrievalChunk {
  return {
    protocolVersion: "1.0",
    objectType: "RETRIEVAL_CHUNK",
    chunkId: `chunk-${doc.documentId}`,
    documentId: doc.documentId,
    stagingDocumentId: doc.stagingDocumentId,
    artifactVersion: doc.artifactVersion,
    ordinal: 1,
    headingPath: ["Fees"],
    text: "official evidence",
    contentSha256: doc.sourceUri.includes("fee-schedule") ? "c".repeat(64) : "d".repeat(64),
    ...overrides,
  };
}

const NUMERIC_URI =
  "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule";
const CONTEXT_URI = "https://www.uspto.gov/trademarks/trademark-fee-information";

describe("official evidence retrieval adapter", () => {
  it("keeps real retrieval evidence fail closed when temporal/conflict normalization is absent", () => {
    const numericDocument = document(NUMERIC_URI);
    const item = buildOfficialEvidenceFromRetrieval({
      role: "NUMERIC_AUTHORITY",
      document: numericDocument,
      chunk: chunk(numericDocument),
      asOf: "2026-08-28T00:02:00.000Z",
    });

    expect(item.effectiveAt).toBeNull();
    expect(item.temporalStatus).toBe("UNRESOLVED");
    expect(item.conflictStatus).toBe("UNRESOLVED");
    expect(item.supersessionStatus).toBe("CURRENT");
    expect(item.indexedAt).toBe(numericDocument.indexedAt);
    expect(item.documentContentSha256).toBe(numericDocument.contentSha256);
  });

  it("does not promote publishedAt to effectiveAt", () => {
    const numericDocument = document(NUMERIC_URI, {
      publishedAt: "2025-01-18T00:00:00.000Z",
    });
    const item = buildOfficialEvidenceFromRetrieval({
      role: "NUMERIC_AUTHORITY",
      document: numericDocument,
      chunk: chunk(numericDocument),
      asOf: "2026-08-28T00:02:00.000Z",
    });

    expect(numericDocument.publishedAt).not.toBeNull();
    expect(item.effectiveAt).toBeNull();
    expect(item.temporalStatus).toBe("UNRESOLVED");
  });

  it("admits the two real retrieval roles only after explicit temporal/conflict normalization", () => {
    const numericDocument = document(NUMERIC_URI);
    const contextDocument = document(CONTEXT_URI);
    const normalization = {
      effectiveAt: "2025-01-18T00:00:00.000Z",
      expiresAt: null,
      conflictStatus: "NONE" as const,
    };
    const evidence = [
      buildOfficialEvidenceFromRetrieval({
        role: "NUMERIC_AUTHORITY",
        document: numericDocument,
        chunk: chunk(numericDocument),
        normalization,
        asOf: "2026-08-28T00:02:00.000Z",
      }),
      buildOfficialEvidenceFromRetrieval({
        role: "APPLICABILITY_CONTEXT",
        document: contextDocument,
        chunk: chunk(contextDocument),
        normalization,
        asOf: "2026-08-28T00:02:00.000Z",
      }),
    ];

    expect(evaluateOfficialEvidenceAdmissibility(USPTO_FEE_EVIDENCE_POLICY, evidence).status).toBe(
      "ADMISSIBLE",
    );
  });

  it("maps a non-current retrieval version to superseded fail-closed evidence", () => {
    const numericDocument = document(NUMERIC_URI, { isCurrent: false });
    const numeric = buildOfficialEvidenceFromRetrieval({
      role: "NUMERIC_AUTHORITY",
      document: numericDocument,
      chunk: chunk(numericDocument),
      normalization: {
        effectiveAt: "2025-01-18T00:00:00.000Z",
        expiresAt: null,
        conflictStatus: "NONE",
      },
      asOf: "2026-08-28T00:02:00.000Z",
    });
    const contextDocument = document(CONTEXT_URI);
    const context = buildOfficialEvidenceFromRetrieval({
      role: "APPLICABILITY_CONTEXT",
      document: contextDocument,
      chunk: chunk(contextDocument),
      normalization: {
        effectiveAt: "2025-01-18T00:00:00.000Z",
        expiresAt: null,
        conflictStatus: "NONE",
      },
      asOf: "2026-08-28T00:02:00.000Z",
    });

    const result = evaluateOfficialEvidenceAdmissibility(USPTO_FEE_EVIDENCE_POLICY, [
      numeric,
      context,
    ]);
    expect(result.status).toBe("FAIL_CLOSED");
    expect(result.reasons).toContain("SUPERSEDED_EVIDENCE");
  });

  it("rejects document/chunk lineage mismatches before packaging evidence", () => {
    const numericDocument = document(NUMERIC_URI);

    expect(() =>
      buildOfficialEvidenceFromRetrieval({
        role: "NUMERIC_AUTHORITY",
        document: numericDocument,
        chunk: chunk(numericDocument, { artifactVersion: 2 }),
      }),
    ).toThrow("Retrieval document/chunk lineage mismatch");
  });
});
