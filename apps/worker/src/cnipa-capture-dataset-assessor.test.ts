import { describe, expect, it } from "vitest";
import {
  assessCnipaCaptureDataset,
  type CnipaCaptureDatasetKind,
} from "./cnipa-capture-dataset-assessor";

const SPEC = {
  registration_list: {
    idField: "adjuOpenId",
    idStrategy: "adjuOpenId (adjuId fallback)",
    sourceUrl:
      "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/pubnotice/portal/tmscJudgment/queryPageList",
    query: {
      returnDateStart: "2026-07-01",
      returnDateEnd: "2026-07-01",
      pageIndex: 1,
      pageSize: 100,
    },
  },
  opposition_list: {
    idField: "adjuOpenId",
    idStrategy: "adjuOpenId (adjuId fallback)",
    sourceUrl:
      "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/pubnotice/portal/tmyyJudgment/queryPageList",
    query: {
      openFlag: 1,
      returnDateStart: "2026-07-01",
      returnDateEnd: "2026-07-01",
      pageIndex: 1,
      pageSize: 100,
    },
  },
  review_list: {
    idField: "pubId",
    idStrategy: "pubId",
    sourceUrl:
      "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/pubnotice/portal/tmpsJudgment/queryPageList",
    query: {
      openFlag: 1,
      judgeDateStart: "2026-07-01",
      judgeDateEnd: "2026-07-01",
      pageIndex: 1,
      pageSize: 100,
    },
  },
} as const;

function dataset(
  kind: CnipaCaptureDatasetKind,
  hiddenPageLengths: readonly number[],
): Record<string, unknown> {
  const spec = SPEC[kind];
  const count = 100 + hiddenPageLengths.reduce((sum, value) => sum + value, 0);
  return {
    exportedSchema: "mo-cnipa-query-dataset-v2",
    kind,
    query: { ...spec.query },
    sourceUrl: spec.sourceUrl,
    count,
    idStrategy: spec.idStrategy,
    stopReason: `遇到短页 ${hiddenPageLengths.at(-1)}`,
    pages: hiddenPageLengths.map((listLength, index) => ({
      requestedPageIndex: index + 2,
      listLength,
      newUnique: listLength,
      attempts: index === 0 ? 2 : 1,
      recoveredAfterRetry: index === 0,
    })),
    records: Array.from({ length: count }, (_, index) => ({
      [spec.idField]: `${kind}-${index + 1}`,
      fileContent: `decision-${index + 1}`,
    })),
  };
}

describe("CNIPA v0.7 capture dataset assessment", () => {
  it.each([
    ["review_list", [100, 100, 100, 35]],
    ["registration_list", [100, 21]],
    ["opposition_list", [100, 100, 5]],
  ] as const)("marks a clean %s hidden-page dataset ready", (kind, pageLengths) => {
    const result = assessCnipaCaptureDataset(dataset(kind, pageLengths));

    expect(result.recordStats.declaredCount).toBe(100 + pageLengths.reduce((a, b) => a + b, 0));
    expect(result.recordStats.duplicateResolvedIdCount).toBe(0);
    expect(result.recordStats.allRecordsContainFileContent).toBe(true);
    expect(result.pagingStats.baseUniqueCount).toBe(100);
    expect(result.pagingStats.hiddenPagination).toBe("VERIFIED");
    expect(result.pagingStats.naturalTerminalObserved).toBe(true);
    expect(result.pagingStats.recoveredAfterRetryPages).toBe(1);
    expect(result.promotion).toEqual({ runtimeDateRangeReady: true, reasons: [] });
  });

  it("does not promote registration/opposition data that falls back to adjuId", () => {
    const input = dataset("opposition_list", [100, 7]);
    const records = input.records as Record<string, unknown>[];
    delete records[0]?.adjuOpenId;
    if (records[0]) records[0].adjuId = "fallback-id";

    const result = assessCnipaCaptureDataset(input);

    expect(result.recordStats.fallbackAdjuIdCount).toBe(1);
    expect(result.promotion.runtimeDateRangeReady).toBe(false);
    expect(result.promotion.reasons.join(" ")).toMatch(/canonical adjuOpenId|adjuId fallback/);
  });

  it("classifies a short first page as not exercising hidden pagination", () => {
    const input = dataset("registration_list", []);
    input.count = 20;
    input.stopReason = "首页即为短页 20";
    input.records = (input.records as unknown[]).slice(0, 20);

    const result = assessCnipaCaptureDataset(input);

    expect(result.pagingStats.hiddenPagination).toBe("NOT_EXERCISED");
    expect(result.promotion.runtimeDateRangeReady).toBe(false);
  });

  it("fails promotion when resolved source ids repeat", () => {
    const input = dataset("review_list", [35]);
    const records = input.records as Record<string, unknown>[];
    if (records[1]) records[1].pubId = records[0]?.pubId;

    const result = assessCnipaCaptureDataset(input);

    expect(result.recordStats.duplicateResolvedIdCount).toBe(1);
    expect(result.promotion.runtimeDateRangeReady).toBe(false);
  });

  it("rejects structurally impossible hidden-page summaries", () => {
    const input = dataset("review_list", [35]);
    const pages = input.pages as Record<string, unknown>[];
    if (pages[0]) pages[0].newUnique = 36;

    expect(() => assessCnipaCaptureDataset(input)).toThrow(/cannot exceed listLength/);
  });
});
