import {
  materializeCnipaListPageBytes,
} from "./cnipa-list-materializer";
import type {
  CnipaDocumentKind,
  CnipaJudgmentCollection,
  CnipaResponseEvidence,
} from "./cnipa-trademark-judgment";

export const CNIPA_COLLECTION_COVERAGE_VERSION =
  "cnipa-collection-coverage-v1" as const;

export type CnipaCollectionCoverageStopReason =
  | "NATURAL_SHORT_OR_EMPTY_PAGE"
  | "FULL_PAGE_ZERO_NEW_IDS"
  | "SAFETY_CEILING"
  | "NO_LIST_EVIDENCE"
  | "UNCLASSIFIED_FULL_PAGE_STOP";

export type CnipaCollectionCoveragePageV1 = {
  pageIndex: number;
  recordCount: number;
  newUnique: number;
};

export type CnipaCollectionCoverageManifestV1 = {
  schemaVersion: typeof CNIPA_COLLECTION_COVERAGE_VERSION;
  sourceAuthority: "CNIPA";
  documentKind: CnipaDocumentKind;
  query: CnipaJudgmentCollection["query"];
  observedAt?: string;
  pageSize: number;
  maxPagesPerLibrary: number;
  rawListPageCount: number;
  rawListRecordCount: number;
  uniqueSourceRecordCount: number;
  terminalPageLength: number | null;
  pages: readonly CnipaCollectionCoveragePageV1[];
  stopReason: CnipaCollectionCoverageStopReason;
  safetyCeilingReached: boolean;
  duplicateFullPageDetected: boolean;
  completeByObservedPaging: boolean;
  coverageStatus: CnipaJudgmentCollection["coverageStatus"];
  coverageReasons: readonly string[];
};

function listEvidenceFor(
  collection: CnipaJudgmentCollection,
  documentKind: CnipaDocumentKind,
): CnipaResponseEvidence[] {
  return collection.evidence.filter(
    (evidence) =>
      evidence.documentKind === documentKind &&
      evidence.evidenceKind === "LIST_JSON",
  );
}

export function buildCnipaDateRangeCoverageManifest(input: {
  collection: CnipaJudgmentCollection;
  pageSize: number;
  maxPagesPerLibrary: number;
}): CnipaCollectionCoverageManifestV1 {
  const { collection, pageSize, maxPagesPerLibrary } = input;
  if (
    collection.query.mode !== "DATE_RANGE" ||
    collection.query.documentKinds?.length !== 1
  ) {
    throw new Error(
      "CNIPA collection coverage manifest requires one DATE_RANGE document kind",
    );
  }

  const documentKind = collection.query.documentKinds[0]!;
  const listEvidence = listEvidenceFor(collection, documentKind);
  const seen = new Set<string>();
  const pages: CnipaCollectionCoveragePageV1[] = [];
  let rawListRecordCount = 0;
  let duplicateFullPageDetected = false;

  listEvidence.forEach((evidence, index) => {
    const materialized = materializeCnipaListPageBytes(
      documentKind,
      evidence.content,
    );
    const before = seen.size;
    for (const record of materialized.records) {
      seen.add(record.sourceRecordId);
    }
    const newUnique = seen.size - before;
    rawListRecordCount += materialized.recordCount;
    pages.push({
      pageIndex: index + 1,
      recordCount: materialized.recordCount,
      newUnique,
    });
    if (materialized.recordCount === pageSize && newUnique === 0) {
      duplicateFullPageDetected = true;
    }
  });

  const terminalPageLength =
    pages.length > 0 ? pages[pages.length - 1]!.recordCount : null;
  const safetyCeilingReached =
    pages.length === maxPagesPerLibrary &&
    terminalPageLength === pageSize &&
    !duplicateFullPageDetected;

  let stopReason: CnipaCollectionCoverageStopReason;
  if (pages.length === 0) {
    stopReason = "NO_LIST_EVIDENCE";
  } else if (duplicateFullPageDetected) {
    stopReason = "FULL_PAGE_ZERO_NEW_IDS";
  } else if (safetyCeilingReached) {
    stopReason = "SAFETY_CEILING";
  } else if (terminalPageLength !== null && terminalPageLength < pageSize) {
    stopReason = "NATURAL_SHORT_OR_EMPTY_PAGE";
  } else {
    stopReason = "UNCLASSIFIED_FULL_PAGE_STOP";
  }

  return {
    schemaVersion: CNIPA_COLLECTION_COVERAGE_VERSION,
    sourceAuthority: "CNIPA",
    documentKind,
    query: collection.query,
    ...(listEvidence.at(-1)?.observedAt
      ? { observedAt: listEvidence.at(-1)!.observedAt }
      : {}),
    pageSize,
    maxPagesPerLibrary,
    rawListPageCount: pages.length,
    rawListRecordCount,
    uniqueSourceRecordCount: seen.size,
    terminalPageLength,
    pages,
    stopReason,
    safetyCeilingReached,
    duplicateFullPageDetected,
    completeByObservedPaging:
      stopReason === "NATURAL_SHORT_OR_EMPTY_PAGE",
    coverageStatus: collection.coverageStatus,
    coverageReasons: [...collection.coverageReasons],
  };
}
