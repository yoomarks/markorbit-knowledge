import type { RetrievalChunk, RetrievalDocument } from "@markorbit/contracts";
import { evaluateOfficialEvidenceAdmissibility } from "./official-evidence-admissibility";
import {
  buildOfficialEvidenceFromRetrieval,
  type OfficialEvidenceTemporalNormalization,
} from "./official-evidence-retrieval-adapter";
import { USPTO_FEE_EVIDENCE_POLICY } from "./uspto-fee-evidence-policy";

export const USPTO_FEE_TEMPORAL_AUTHORITY_URI =
  "https://www.uspto.gov/trademarks/fees-payment-information/summary-2025-trademark-fee-changes";

export type UsptoFeeEvidenceRefV1 = {
  sourceUri: string;
  sourceId: string;
  documentId: string;
  stagingDocumentId: string;
  readyPackageId: string;
  rawArtifactId: string;
  artifactVersion: number;
  documentContentSha256: string;
  chunkId: string;
  chunkContentSha256: string;
  indexedAt: string;
  indexMode: "SQLITE_FTS5_BM25";
};

export type UsptoFeeNormalizationBundleV1 = {
  schemaVersion: "1.0";
  operation: "US_TRADEMARK_BASE_APPLICATION_SECTION_1_OR_44_PER_CLASS";
  currency: "USD";
  amountMinor: number;
  effectiveAt: string;
  numericEvidence: UsptoFeeEvidenceRefV1;
  temporalEvidence: readonly UsptoFeeEvidenceRefV1[];
  applicabilityEvidence: UsptoFeeEvidenceRefV1;
};

export type ResolveUsptoFeeEvidenceInput = {
  numericDocument: RetrievalDocument;
  numericChunk: RetrievalChunk;
  temporalDocument: RetrievalDocument;
  temporalChunks: readonly RetrievalChunk[];
  applicabilityDocument: RetrievalDocument;
  applicabilityChunk: RetrievalChunk;
  asOf?: string;
};

export type ResolveUsptoFeeEvidenceResult =
  | { status: "RESOLVED"; bundle: UsptoFeeNormalizationBundleV1 }
  | {
      status: "FAIL_CLOSED";
      reason:
        | "SOURCE_IDENTITY_MISMATCH"
        | "LINEAGE_MISMATCH"
        | "NUMERIC_ROW_UNRESOLVED"
        | "TEMPORAL_OPERATION_UNRESOLVED"
        | "TEMPORAL_DATE_UNRESOLVED"
        | "CROSS_SOURCE_AMOUNT_CONFLICT"
        | "ADMISSIBILITY_REJECTED";
    };

const NUMERIC_URI =
  "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule";
const APPLICABILITY_URI = "https://www.uspto.gov/trademarks/trademark-fee-information";

function canonicalText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[\t ]+/g, " ")
    .replace(/\r\n?/g, "\n");
}

function lines(text: string): string[] {
  return canonicalText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function sameLineage(document: RetrievalDocument, chunk: RetrievalChunk): boolean {
  return (
    chunk.documentId === document.documentId &&
    chunk.stagingDocumentId === document.stagingDocumentId &&
    chunk.artifactVersion === document.artifactVersion
  );
}

function evidenceRef(document: RetrievalDocument, chunk: RetrievalChunk): UsptoFeeEvidenceRefV1 {
  return {
    sourceUri: document.sourceUri,
    sourceId: document.sourceId,
    documentId: document.documentId,
    stagingDocumentId: document.stagingDocumentId,
    readyPackageId: document.readyPackageId,
    rawArtifactId: document.rawArtifactId,
    artifactVersion: document.artifactVersion,
    documentContentSha256: document.contentSha256,
    chunkId: chunk.chunkId,
    chunkContentSha256: chunk.contentSha256,
    indexedAt: document.indexedAt,
    indexMode: "SQLITE_FTS5_BM25",
  };
}

function operationMatch(text: string): boolean {
  const lower = canonicalText(text).toLowerCase();
  return (
    lower.includes("base application") &&
    lower.includes("per class") &&
    (lower.includes("section 1") || lower.includes("sections 1")) &&
    (lower.includes("section 44") ||
      lower.includes("sections 1 and 44") ||
      lower.includes("1 and 44"))
  );
}

function numericRowMatch(text: string): boolean {
  const lower = canonicalText(text).toLowerCase();
  return (
    lower.includes("base application") &&
    lower.includes("per class") &&
    lower.includes("7017") &&
    lower.includes("2.6(a)(1)(iii)")
  );
}

function amountsOnLine(line: string): number[] {
  const candidates = new Set<number>();
  const patterns = [
    /\$\s*([0-9][0-9,]*(?:\.\d{2})?)/g,
    /(?:^|[|\s])([0-9]{2,5}\.\d{2})(?=[|\s]|$)/g,
  ];
  for (const pattern of patterns) {
    for (const match of line.matchAll(pattern)) {
      const raw = match[1]?.replace(/,/g, "");
      if (!raw) continue;
      const amount = Number(raw);
      if (Number.isFinite(amount) && amount > 0) candidates.add(Math.round(amount * 100));
    }
  }
  return [...candidates];
}

function amountFromSemanticLine(text: string, matcher: (line: string) => boolean): number | null {
  const candidates = new Set<number>();
  for (const line of lines(text).filter(matcher)) {
    for (const amount of amountsOnLine(line)) candidates.add(amount);
  }
  return candidates.size === 1 ? [...candidates][0]! : null;
}

function effectiveDate(text: string): string | null {
  const normalized = canonicalText(text);
  const match = normalized.match(
    /(?:became\s+)?effective(?:\s+on)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(20\d{2})/i,
  );
  if (!match) return null;
  const parsed = Date.parse(`${match[1]} ${match[2]}, ${match[3]} UTC`);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export function resolveUsptoFeeEvidence(
  input: ResolveUsptoFeeEvidenceInput,
): ResolveUsptoFeeEvidenceResult {
  if (
    input.numericDocument.sourceUri !== NUMERIC_URI ||
    input.temporalDocument.sourceUri !== USPTO_FEE_TEMPORAL_AUTHORITY_URI ||
    input.applicabilityDocument.sourceUri !== APPLICABILITY_URI
  ) {
    return { status: "FAIL_CLOSED", reason: "SOURCE_IDENTITY_MISMATCH" };
  }

  if (
    !sameLineage(input.numericDocument, input.numericChunk) ||
    !sameLineage(input.applicabilityDocument, input.applicabilityChunk) ||
    input.temporalChunks.length === 0 ||
    input.temporalChunks.some((chunk) => !sameLineage(input.temporalDocument, chunk))
  ) {
    return { status: "FAIL_CLOSED", reason: "LINEAGE_MISMATCH" };
  }

  const numericAmount = amountFromSemanticLine(input.numericChunk.text, numericRowMatch);
  if (numericAmount === null) {
    return { status: "FAIL_CLOSED", reason: "NUMERIC_ROW_UNRESOLVED" };
  }

  const temporalOperationChunks = input.temporalChunks.filter((chunk) =>
    operationMatch(chunk.text),
  );
  if (temporalOperationChunks.length === 0) {
    return { status: "FAIL_CLOSED", reason: "TEMPORAL_OPERATION_UNRESOLVED" };
  }
  const temporalAmountCandidates = new Set(
    temporalOperationChunks
      .map((chunk) => amountFromSemanticLine(chunk.text, operationMatch))
      .filter((value): value is number => value !== null),
  );
  if (temporalAmountCandidates.size !== 1 || !temporalAmountCandidates.has(numericAmount)) {
    return { status: "FAIL_CLOSED", reason: "CROSS_SOURCE_AMOUNT_CONFLICT" };
  }

  const dateChunks = input.temporalChunks
    .map((chunk) => ({ chunk, date: effectiveDate(chunk.text) }))
    .filter((item): item is { chunk: RetrievalChunk; date: string } => item.date !== null);
  const dates = new Set(dateChunks.map((item) => item.date));
  if (dates.size !== 1) {
    return { status: "FAIL_CLOSED", reason: "TEMPORAL_DATE_UNRESOLVED" };
  }
  const resolvedDate = [...dates][0]!;

  const normalization: OfficialEvidenceTemporalNormalization = {
    effectiveAt: resolvedDate,
    expiresAt: null,
    conflictStatus: "NONE",
  };
  const asOf = input.asOf ?? new Date().toISOString();
  const evidence = [
    buildOfficialEvidenceFromRetrieval({
      role: "NUMERIC_AUTHORITY",
      document: input.numericDocument,
      chunk: input.numericChunk,
      normalization,
      asOf,
    }),
    buildOfficialEvidenceFromRetrieval({
      role: "APPLICABILITY_CONTEXT",
      document: input.applicabilityDocument,
      chunk: input.applicabilityChunk,
      normalization,
      asOf,
    }),
  ];
  if (
    evaluateOfficialEvidenceAdmissibility(USPTO_FEE_EVIDENCE_POLICY, evidence).status !==
    "ADMISSIBLE"
  ) {
    return { status: "FAIL_CLOSED", reason: "ADMISSIBILITY_REJECTED" };
  }

  const temporalEvidenceChunks = new Map<string, RetrievalChunk>();
  for (const chunk of temporalOperationChunks) temporalEvidenceChunks.set(chunk.chunkId, chunk);
  for (const item of dateChunks) temporalEvidenceChunks.set(item.chunk.chunkId, item.chunk);

  return {
    status: "RESOLVED",
    bundle: {
      schemaVersion: "1.0",
      operation: "US_TRADEMARK_BASE_APPLICATION_SECTION_1_OR_44_PER_CLASS",
      currency: "USD",
      amountMinor: numericAmount,
      effectiveAt: resolvedDate,
      numericEvidence: evidenceRef(input.numericDocument, input.numericChunk),
      temporalEvidence: [...temporalEvidenceChunks.values()]
        .sort((left, right) => left.chunkId.localeCompare(right.chunkId))
        .map((chunk) => evidenceRef(input.temporalDocument, chunk)),
      applicabilityEvidence: evidenceRef(input.applicabilityDocument, input.applicabilityChunk),
    },
  };
}
