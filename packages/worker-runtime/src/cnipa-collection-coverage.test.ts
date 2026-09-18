import { describe, expect, it } from "vitest";
import { buildCnipaDateRangeCoverageManifest } from "./cnipa-collection-coverage";
import type {
  CnipaJudgmentCollection,
  CnipaResponseEvidence,
} from "./cnipa-trademark-judgment";

function listEvidence(page: number, ids: string[]): CnipaResponseEvidence {
  return {
    evidenceKind: "LIST_JSON",
    documentKind: "REGISTRATION_EXAMINATION",
    sourceUri: `https://cnipa.example/list?page=${page}`,
    observedAt: `2026-09-18T00:00:${String(page % 60).padStart(2, "0")}.000Z`,
    mediaType: "application/json;charset=UTF-8",
    sha256: "0".repeat(64),
    content: new TextEncoder().encode(
      JSON.stringify({
        code: 0,
        data: {
          list: ids.map((id) => ({
            adjuOpenId: id,
            adjuTitle: `Decision ${id}`,
            fileContent: `Body ${id}`,
          })),
        },
      }),
    ),
  };
}

function collection(evidence: CnipaResponseEvidence[]): CnipaJudgmentCollection {
  return {
    sourceId: "CNIPA",
    query: {
      mode: "DATE_RANGE",
      fromDate: "2026-07-01",
      toDate: "2026-07-01",
      documentKinds: ["REGISTRATION_EXAMINATION"],
    },
    documents: [],
    evidence,
    coverageStatus: "UNKNOWN",
    coverageReasons: [
      "REGISTRATION_EXAMINATION date-range bulk acquisition preserves complete LIST response bytes as primary evidence; DETAIL fan-out is intentionally skipped",
    ],
    schemaStatus: "PROVISIONAL_UNTIL_AUTHENTICATED_LIVE_VALIDATION",
    schemaRevision: "cnipa-judgment-candidate-v1",
  };
}

function ids(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
}

describe("CNIPA collection coverage manifest", () => {
  it("accepts a natural short terminal page as complete by observed paging", () => {
    const manifest = buildCnipaDateRangeCoverageManifest({
      collection: collection([
        listEvidence(1, ids("p1", 100)),
        listEvidence(2, ids("p2", 35)),
      ]),
      pageSize: 100,
      maxPagesPerLibrary: 50,
    });

    expect(manifest.rawListPageCount).toBe(2);
    expect(manifest.rawListRecordCount).toBe(135);
    expect(manifest.uniqueSourceRecordCount).toBe(135);
    expect(manifest.terminalPageLength).toBe(35);
    expect(manifest.pages).toEqual([
      { pageIndex: 1, recordCount: 100, newUnique: 100 },
      { pageIndex: 2, recordCount: 35, newUnique: 35 },
    ]);
    expect(manifest.stopReason).toBe("NATURAL_SHORT_OR_EMPTY_PAGE");
    expect(manifest.completeByObservedPaging).toBe(true);
    expect(manifest.safetyCeilingReached).toBe(false);
  });

  it("marks a repeated full page as incomplete even when the run itself can complete", () => {
    const first = ids("same", 100);
    const manifest = buildCnipaDateRangeCoverageManifest({
      collection: collection([
        listEvidence(1, first),
        listEvidence(2, first),
      ]),
      pageSize: 100,
      maxPagesPerLibrary: 50,
    });

    expect(manifest.pages[1]).toEqual({
      pageIndex: 2,
      recordCount: 100,
      newUnique: 0,
    });
    expect(manifest.stopReason).toBe("FULL_PAGE_ZERO_NEW_IDS");
    expect(manifest.duplicateFullPageDetected).toBe(true);
    expect(manifest.completeByObservedPaging).toBe(false);
    expect(manifest.safetyCeilingReached).toBe(false);
  });

  it("marks fifty full unique pages as a safety ceiling that requires a smaller replay", () => {
    const evidence = Array.from({ length: 50 }, (_, pageIndex) =>
      listEvidence(pageIndex + 1, ids(`p${pageIndex + 1}`, 100)),
    );
    const manifest = buildCnipaDateRangeCoverageManifest({
      collection: collection(evidence),
      pageSize: 100,
      maxPagesPerLibrary: 50,
    });

    expect(manifest.rawListPageCount).toBe(50);
    expect(manifest.rawListRecordCount).toBe(5000);
    expect(manifest.uniqueSourceRecordCount).toBe(5000);
    expect(manifest.terminalPageLength).toBe(100);
    expect(manifest.stopReason).toBe("SAFETY_CEILING");
    expect(manifest.safetyCeilingReached).toBe(true);
    expect(manifest.completeByObservedPaging).toBe(false);
  });

  it("does not claim completeness when LIST evidence is absent", () => {
    const manifest = buildCnipaDateRangeCoverageManifest({
      collection: collection([]),
      pageSize: 100,
      maxPagesPerLibrary: 50,
    });

    expect(manifest.stopReason).toBe("NO_LIST_EVIDENCE");
    expect(manifest.completeByObservedPaging).toBe(false);
    expect(manifest.terminalPageLength).toBeNull();
  });
});
