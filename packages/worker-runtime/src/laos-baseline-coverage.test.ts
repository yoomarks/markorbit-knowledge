import { describe, expect, it } from "vitest";
import {
  buildLaosBaselineCoverage,
  freezeLaosBaselineIndex,
  LAOS_BASELINE_PAGE_SIZE,
  planLaosDetailBatches,
  type LaosBaselineIndexPage,
} from "./laos-baseline-coverage";
import { createHash } from "node:crypto";

const sha = (ids: readonly string[]) =>
  createHash("sha256").update(ids.join("\n"), "utf8").digest("hex");

function pages(total: number): LaosBaselineIndexPage[] {
  const ids = Array.from({ length: total }, (_, i) => "LA" + String(10000 + i));
  const out: LaosBaselineIndexPage[] = [];
  for (let start = 0; start < total; start += LAOS_BASELINE_PAGE_SIZE) {
    const slice = ids.slice(start, start + LAOS_BASELINE_PAGE_SIZE);
    out.push({
      pageIndex: out.length + 1,
      sourceTotal: total,
      sourceRecordIds: slice,
      sourceRecordIdsSha256: sha(slice),
    });
  }
  return out;
}
describe("Lao baseline coverage contract", () => {
  it("freezes exact true IDs and deterministic page digests", () => {
    const index = freezeLaosBaselineIndex(pages(131));
    expect(index.sourceTotal).toBe(131);
    expect(index.pageCount).toBe(3);
    expect(index.sourceRecordIds).toHaveLength(131);
    expect(index.pageDigests).toHaveLength(3);
    expect(index.sourceRecordIdsSha256).toBe(sha(index.sourceRecordIds));
  });

  it("rejects missing pages, drift, duplicate IDs and forged digests", () => {
    expect(() => freezeLaosBaselineIndex(pages(101).slice(0, 2))).toThrow(/page count/);
    const drift = pages(101);
    drift[1] = { ...drift[1]!, sourceTotal: 102 };
    expect(() => freezeLaosBaselineIndex(drift)).toThrow(/drifted/);
    const duplicate = pages(101);
    duplicate[1] = {
      ...duplicate[1]!,
      sourceRecordIds: [
        duplicate[0]!.sourceRecordIds[0]!,
        ...duplicate[1]!.sourceRecordIds.slice(1),
      ],
    };
    duplicate[1] = { ...duplicate[1]!, sourceRecordIdsSha256: sha(duplicate[1]!.sourceRecordIds) };
    expect(() => freezeLaosBaselineIndex(duplicate)).toThrow(/duplicate/);
    const forged = pages(101);
    forged[0] = { ...forged[0]!, sourceRecordIdsSha256: "0".repeat(64) };
    expect(() => freezeLaosBaselineIndex(forged)).toThrow(/digest/);
  });
  it("handles the current ~73.5k scale beyond UInt8 page numbers", () => {
    const index = freezeLaosBaselineIndex(pages(73_531));
    expect(index.pageCount).toBe(1_471);
    expect(index.pageDigests.at(-1)).toBe(sha(index.sourceRecordIds.slice(-31)));
    const batches = planLaosDetailBatches(index, 500);
    expect(batches).toHaveLength(148);
    expect(batches.at(-1)?.sourceRecordIds).toHaveLength(31);
  });

  it("plans bounded deterministic detail batches and rejects oversized batches", () => {
    const index = freezeLaosBaselineIndex(pages(1201));
    const batches = planLaosDetailBatches(index, 500);
    expect(batches.map((b) => b.sourceRecordIds.length)).toEqual([500, 500, 201]);
    expect(batches[0]!.startOffset).toBe(0);
    expect(batches[2]!.endOffsetExclusive).toBe(1201);
    expect(() => planLaosDetailBatches(index, 501)).toThrow(/batchSize/);
  });

  it("keeps incomplete detail work PARTIAL with exact next batch and gaps", () => {
    const index = freezeLaosBaselineIndex(pages(120));
    const batches = planLaosDetailBatches(index, 50);
    const first = batches[0]!;
    const manifest = buildLaosBaselineCoverage({
      index,
      batches,
      receipts: [
        {
          batchIndex: 1,
          sourceRecordIdsSha256: first.sourceRecordIdsSha256,
          acceptedSourceRecordIds: first.sourceRecordIds.slice(0, 49),
          gapSourceRecordIds: first.sourceRecordIds.slice(49),
          requestCount: 50,
          responseBytes: 12345,
          rateLimitedCount: 1,
          completedAt: "2026-09-29T14:00:00Z",
        },
      ],
    });
    expect(manifest.status).toBe("PARTIAL");
    expect(manifest.complete).toBe(false);
    expect(manifest.nextBatchIndex).toBe(2);
    expect(manifest.gapCount).toBe(1);
  });
  it("marks COMPLETE only after every exact batch partitions to zero gaps", () => {
    const index = freezeLaosBaselineIndex(pages(101));
    const batches = planLaosDetailBatches(index, 50);
    const receipts = batches.map((batch) => ({
      batchIndex: batch.batchIndex,
      sourceRecordIdsSha256: batch.sourceRecordIdsSha256,
      acceptedSourceRecordIds: batch.sourceRecordIds,
      gapSourceRecordIds: [],
      requestCount: batch.sourceRecordIds.length,
      responseBytes: batch.sourceRecordIds.length * 1000,
      rateLimitedCount: 0,
      completedAt: "2026-09-29T14:00:00Z",
    }));
    const manifest = buildLaosBaselineCoverage({ index, batches, receipts });
    expect(manifest.status).toBe("COMPLETE");
    expect(manifest.complete).toBe(true);
    expect(manifest.acceptedDetailCount).toBe(101);
    expect(manifest.gapCount).toBe(0);
    expect(manifest.nextBatchIndex).toBeNull();
  });

  it("rejects forged receipts, gaps outside the batch and skipped batch order", () => {
    const index = freezeLaosBaselineIndex(pages(101));
    const batches = planLaosDetailBatches(index, 50);
    const first = batches[0]!;
    expect(() =>
      buildLaosBaselineCoverage({
        index,
        batches,
        receipts: [
          {
            batchIndex: 2,
            sourceRecordIdsSha256: first.sourceRecordIdsSha256,
            acceptedSourceRecordIds: first.sourceRecordIds,
            gapSourceRecordIds: [],
            requestCount: 50,
            responseBytes: 1,
            rateLimitedCount: 0,
            completedAt: "2026-09-29T14:00:00Z",
          },
        ],
      }),
    ).toThrow(/batch plan/);
  });
});
