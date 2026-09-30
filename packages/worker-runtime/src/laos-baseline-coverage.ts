import { createHash } from "node:crypto";

export const LAOS_BASELINE_COVERAGE_SCHEMA = "LA_WOPUBLISH_BASELINE_COVERAGE_V1" as const;
export const LAOS_BASELINE_INDEX_SCHEMA = "LA_WOPUBLISH_BASELINE_INDEX_V1" as const;
export const LAOS_BASELINE_PAGE_SIZE = 50;
export const LAOS_BASELINE_MAX_RECORDS = 100_000;

const LA_ID = /^LA\d{3,10}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

export type LaosBaselineIndexPage = {
  pageIndex: number;
  sourceTotal: number;
  sourceRecordIds: readonly string[];
  sourceRecordIdsSha256: string;
};

export type LaosBaselineFrozenIndex = {
  schemaVersion: typeof LAOS_BASELINE_INDEX_SCHEMA;
  sourceId: "LA_DIPO_WOPUBLISH_TRADEMARKS";
  sourceTotal: number;
  pageSize: typeof LAOS_BASELINE_PAGE_SIZE;
  pageCount: number;
  sourceRecordIds: readonly string[];
  sourceRecordIdsSha256: string;
  pageDigests: readonly string[];
};
export type LaosDetailBatchPlan = {
  batchIndex: number;
  startOffset: number;
  endOffsetExclusive: number;
  sourceRecordIds: readonly string[];
  sourceRecordIdsSha256: string;
};

export type LaosDetailBatchReceipt = {
  batchIndex: number;
  sourceRecordIdsSha256: string;
  acceptedSourceRecordIds: readonly string[];
  gapSourceRecordIds: readonly string[];
  requestCount: number;
  responseBytes: number;
  rateLimitedCount: number;
  completedAt: string;
};

export type LaosBaselineCoverageManifest = {
  schemaVersion: typeof LAOS_BASELINE_COVERAGE_SCHEMA;
  sourceId: "LA_DIPO_WOPUBLISH_TRADEMARKS";
  sourceTotal: number;
  frozenIndexSha256: string;
  plannedBatchCount: number;
  receivedBatchCount: number;
  acceptedDetailCount: number;
  gapCount: number;
  gapSourceRecordIds: readonly string[];
  requestCount: number;
  responseBytes: number;
  rateLimitedCount: number;
  status: "INDEX_ONLY" | "PARTIAL" | "COMPLETE";
  nextBatchIndex: number | null;
  complete: boolean;
};

function digestStrings(values: readonly string[]): string {
  return createHash("sha256").update(values.join("\n"), "utf8").digest("hex");
}

function integer(value: number, label: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(label + " is outside reviewed bounds");
  }
  return value;
}

function validateIds(ids: readonly string[], label: string): void {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !LA_ID.test(id))) {
    throw new TypeError(label + " contains invalid WoPublish source IDs");
  }
}

export function freezeLaosBaselineIndex(
  pages: readonly LaosBaselineIndexPage[],
): LaosBaselineFrozenIndex {
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new TypeError("Lao baseline index requires at least one committed page");
  }
  const total = integer(pages[0]!.sourceTotal, "sourceTotal", 1, LAOS_BASELINE_MAX_RECORDS);
  const requiredPages = Math.ceil(total / LAOS_BASELINE_PAGE_SIZE);
  if (pages.length !== requiredPages) {
    throw new TypeError("Committed index page count does not cover official sourceTotal");
  }

  const allIds: string[] = [];
  const pageDigests: string[] = [];
  const seen = new Set<string>();
  for (let offset = 0; offset < pages.length; offset++) {
    const page = pages[offset]!;
    const pageIndex = offset + 1;
    if (page.pageIndex !== pageIndex || page.sourceTotal !== total) {
      throw new TypeError("Lao baseline page sequence or sourceTotal drifted");
    }
    const expectedCount = Math.min(
      LAOS_BASELINE_PAGE_SIZE,
      total - offset * LAOS_BASELINE_PAGE_SIZE,
    );
    validateIds(page.sourceRecordIds, "sourceRecordIds");
    if (page.sourceRecordIds.length !== expectedCount) {
      throw new TypeError("Lao baseline page record count does not match sourceTotal");
    }
    const actualDigest = digestStrings(page.sourceRecordIds);
    if (!SHA256.test(page.sourceRecordIdsSha256) || page.sourceRecordIdsSha256 !== actualDigest) {
      throw new TypeError("Lao baseline page digest does not match committed IDs");
    }
    for (const id of page.sourceRecordIds) {
      if (seen.has(id)) throw new TypeError("Lao baseline index contains duplicate source IDs");
      seen.add(id);
      allIds.push(id);
    }
    pageDigests.push(actualDigest);
  }
  if (allIds.length !== total) {
    throw new TypeError("Frozen Lao index count does not equal official sourceTotal");
  }
  return Object.freeze({
    schemaVersion: LAOS_BASELINE_INDEX_SCHEMA,
    sourceId: "LA_DIPO_WOPUBLISH_TRADEMARKS",
    sourceTotal: total,
    pageSize: LAOS_BASELINE_PAGE_SIZE,
    pageCount: requiredPages,
    sourceRecordIds: Object.freeze([...allIds]),
    sourceRecordIdsSha256: digestStrings(allIds),
    pageDigests: Object.freeze(pageDigests),
  });
}

export function planLaosDetailBatches(
  index: LaosBaselineFrozenIndex,
  batchSize: number,
): readonly LaosDetailBatchPlan[] {
  integer(batchSize, "batchSize", 1, 500);
  if (
    index.schemaVersion !== LAOS_BASELINE_INDEX_SCHEMA ||
    index.sourceRecordIds.length !== index.sourceTotal ||
    digestStrings(index.sourceRecordIds) !== index.sourceRecordIdsSha256
  ) {
    throw new TypeError("Frozen Lao index integrity check failed");
  }
  const batches: LaosDetailBatchPlan[] = [];
  for (let start = 0; start < index.sourceTotal; start += batchSize) {
    const ids = index.sourceRecordIds.slice(start, Math.min(index.sourceTotal, start + batchSize));
    batches.push({
      batchIndex: batches.length + 1,
      startOffset: start,
      endOffsetExclusive: start + ids.length,
      sourceRecordIds: Object.freeze([...ids]),
      sourceRecordIdsSha256: digestStrings(ids),
    });
  }
  return Object.freeze(batches);
}

function isoInstant(value: string): void {
  if (typeof value !== "string" || !value.trim() || Number.isNaN(Date.parse(value))) {
    throw new TypeError("completedAt must be an ISO-8601 instant");
  }
}

export function buildLaosBaselineCoverage(input: {
  index: LaosBaselineFrozenIndex;
  batches: readonly LaosDetailBatchPlan[];
  receipts: readonly LaosDetailBatchReceipt[];
}): LaosBaselineCoverageManifest {
  const { index, batches, receipts } = input;
  if (batches.length === 0 || batches.at(-1)?.endOffsetExclusive !== index.sourceTotal) {
    throw new TypeError("Detail batch plan does not cover frozen index");
  }
  if (receipts.length > batches.length) {
    throw new TypeError("More detail receipts than planned batches");
  }

  const gaps: string[] = [];
  let accepted = 0;
  let requestCount = 0;
  let responseBytes = 0;
  let rateLimitedCount = 0;
  for (let offset = 0; offset < receipts.length; offset++) {
    const receipt = receipts[offset]!;
    const plan = batches[offset]!;
    if (
      receipt.batchIndex !== plan.batchIndex ||
      receipt.sourceRecordIdsSha256 !== plan.sourceRecordIdsSha256
    ) {
      throw new TypeError("Detail receipt does not match deterministic batch plan");
    }
    validateIds(receipt.acceptedSourceRecordIds, "acceptedSourceRecordIds");
    validateIds(receipt.gapSourceRecordIds, "gapSourceRecordIds");
    const allowed = new Set(plan.sourceRecordIds);
    const combined = [...receipt.acceptedSourceRecordIds, ...receipt.gapSourceRecordIds];
    if (
      combined.length !== plan.sourceRecordIds.length ||
      new Set(combined).size !== combined.length ||
      combined.some((id) => !allowed.has(id))
    ) {
      throw new TypeError("Detail receipt must partition its exact planned source IDs");
    }
    integer(receipt.requestCount, "requestCount", 0, 10_000);
    integer(receipt.responseBytes, "responseBytes", 0, Number.MAX_SAFE_INTEGER);
    integer(receipt.rateLimitedCount, "rateLimitedCount", 0, receipt.requestCount);
    isoInstant(receipt.completedAt);
    accepted += receipt.acceptedSourceRecordIds.length;
    gaps.push(...receipt.gapSourceRecordIds);
    requestCount += receipt.requestCount;
    responseBytes += receipt.responseBytes;
    rateLimitedCount += receipt.rateLimitedCount;
  }

  const complete =
    receipts.length === batches.length && gaps.length === 0 && accepted === index.sourceTotal;
  const status = receipts.length === 0 ? "INDEX_ONLY" : complete ? "COMPLETE" : "PARTIAL";
  return Object.freeze({
    schemaVersion: LAOS_BASELINE_COVERAGE_SCHEMA,
    sourceId: "LA_DIPO_WOPUBLISH_TRADEMARKS",
    sourceTotal: index.sourceTotal,
    frozenIndexSha256: index.sourceRecordIdsSha256,
    plannedBatchCount: batches.length,
    receivedBatchCount: receipts.length,
    acceptedDetailCount: accepted,
    gapCount: gaps.length,
    gapSourceRecordIds: Object.freeze([...gaps]),
    requestCount,
    responseBytes,
    rateLimitedCount,
    status,
    nextBatchIndex: receipts.length < batches.length ? receipts.length + 1 : null,
    complete,
  });
}
