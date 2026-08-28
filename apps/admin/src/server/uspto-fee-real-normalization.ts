import type { RetrievalChunk, RetrievalDocument } from "@markorbit/contracts";
import type { OfficialEvidenceTemporalNormalization } from "./official-evidence-retrieval-adapter";

export const USPTO_FEE_SCHEDULE_URI =
  "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule";
export const USPTO_FEE_CHANGES_2025_URI =
  "https://www.uspto.gov/trademarks/fees-payment-information/summary-2025-trademark-fee-changes";

export type UsptoFeeEvidenceRef = Readonly<{
  sourceUri: string;
  documentId: string;
  artifactVersion: number;
  documentContentSha256: string;
  chunkId: string;
  chunkContentSha256: string;
  indexedAt: string;
}>;

export type UsptoFeeRealNormalizationResult =
  | Readonly<{
      status: "RESOLVED";
      currency: "USD";
      amountMinor: number;
      unit: "PER_CLASS";
      normalization: OfficialEvidenceTemporalNormalization;
      numericEvidence: UsptoFeeEvidenceRef;
      temporalEvidence: UsptoFeeEvidenceRef;
    }>
  | Readonly<{
      status: "UNRESOLVED";
      reason:
        | "NUMERIC_LINEAGE_INVALID"
        | "TEMPORAL_LINEAGE_INVALID"
        | "NUMERIC_ROW_NOT_FOUND"
        | "TEMPORAL_RULE_NOT_FOUND"
        | "OPERATION_CONTEXT_NOT_FOUND"
        | "SOURCE_CONFLICT";
    }>;

function exactLineage(document: RetrievalDocument, chunk: RetrievalChunk): boolean {
  return (
    chunk.documentId === document.documentId &&
    chunk.stagingDocumentId === document.stagingDocumentId &&
    chunk.artifactVersion === document.artifactVersion &&
    document.isCurrent
  );
}

function evidenceRef(document: RetrievalDocument, chunk: RetrievalChunk): UsptoFeeEvidenceRef {
  return {
    sourceUri: document.sourceUri,
    documentId: document.documentId,
    artifactVersion: document.artifactVersion,
    documentContentSha256: document.contentSha256,
    chunkId: chunk.chunkId,
    chunkContentSha256: chunk.contentSha256,
    indexedAt: document.indexedAt,
  };
}

function dollarsToMinor(raw: string): number | null {
  const normalized = raw.replaceAll(",", "");
  if (!/^\d+(?:\.\d{2})?$/.test(normalized)) return null;
  const [whole, fraction = "00"] = normalized.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function parseNumericAuthority(text: string): number | null {
  const normalized = text.replace(/\r\n?/g, "\n");
  const row = normalized.match(
    /2\.6\(a\)\(1\)\(iii\)[^\n]{0,180}base application, per class[^\n]{0,120}?\$?\s*([0-9][0-9,]*(?:\.\d{2})?)[^\n]{0,80}?7017/i,
  );
  return row?.[1] ? dollarsToMinor(row[1]) : null;
}

const MONTHS: Readonly<Record<string, number>> = Object.freeze({
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
});

function explicitEffectiveInstant(text: string): string | null {
  const match = text.match(
    /became effective on\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+for fees paid to the USPTO/i,
  );
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const month = MONTHS[match[1].toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month === undefined || !Number.isInteger(day) || day < 1 || day > 31 || year < 2000) {
    return null;
  }
  const instant = new Date(Date.UTC(year, month, day));
  if (
    instant.getUTCFullYear() !== year ||
    instant.getUTCMonth() !== month ||
    instant.getUTCDate() !== day
  ) {
    return null;
  }
  return instant.toISOString();
}

function parseTemporalOperationAmount(text: string): number | null {
  const normalized = text.replace(/\r\n?/g, "\n");
  const row = normalized.match(
    /base application\s*\(sections 1 and 44\),\s*per class[^\n]{0,160}?\$?\s*([0-9][0-9,]*(?:\.\d{2})?)/i,
  );
  return row?.[1] ? dollarsToMinor(row[1]) : null;
}

export function resolveUsptoFeeRealNormalization(input: Readonly<{
  numericDocument: RetrievalDocument;
  numericChunk: RetrievalChunk;
  numericText: string;
  temporalDocument: RetrievalDocument;
  temporalChunk: RetrievalChunk;
  temporalText: string;
}>): UsptoFeeRealNormalizationResult {
  if (
    input.numericDocument.sourceUri !== USPTO_FEE_SCHEDULE_URI ||
    !exactLineage(input.numericDocument, input.numericChunk)
  ) {
    return { status: "UNRESOLVED", reason: "NUMERIC_LINEAGE_INVALID" };
  }
  if (
    input.temporalDocument.sourceUri !== USPTO_FEE_CHANGES_2025_URI ||
    !exactLineage(input.temporalDocument, input.temporalChunk)
  ) {
    return { status: "UNRESOLVED", reason: "TEMPORAL_LINEAGE_INVALID" };
  }

  const amountMinor = parseNumericAuthority(input.numericText);
  if (amountMinor === null) return { status: "UNRESOLVED", reason: "NUMERIC_ROW_NOT_FOUND" };

  const effectiveAt = explicitEffectiveInstant(input.temporalText);
  if (!effectiveAt) return { status: "UNRESOLVED", reason: "TEMPORAL_RULE_NOT_FOUND" };

  const corroboratingAmountMinor = parseTemporalOperationAmount(input.temporalText);
  if (corroboratingAmountMinor === null) {
    return { status: "UNRESOLVED", reason: "OPERATION_CONTEXT_NOT_FOUND" };
  }
  if (corroboratingAmountMinor !== amountMinor) {
    return { status: "UNRESOLVED", reason: "SOURCE_CONFLICT" };
  }

  return {
    status: "RESOLVED",
    currency: "USD",
    amountMinor,
    unit: "PER_CLASS",
    normalization: {
      effectiveAt,
      expiresAt: null,
      conflictStatus: "NONE",
    },
    numericEvidence: evidenceRef(input.numericDocument, input.numericChunk),
    temporalEvidence: evidenceRef(input.temporalDocument, input.temporalChunk),
  };
}
