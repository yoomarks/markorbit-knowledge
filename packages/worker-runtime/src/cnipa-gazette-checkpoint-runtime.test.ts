import { describe, expect, it } from "vitest";
import {
  CNIPA_GAZETTE_DATA_ENGINE_ADMISSION_VERSION,
  CNIPA_GAZETTE_PAGE_SIZE,
  assembleCnipaGazetteAdmissionPackage,
  buildCnipaGazetteCheckpoint,
  planCnipaGazettePageRanges,
  type CnipaGazettePageResult,
} from "./cnipa-gazette-checkpoint-runtime";

function row(id: string, issue = 75) {
  return {
    sourceRowId: id,
    sourceSearchId: id,
    registrationNumber: `R-${id}`,
    announcementIssue: issue,
    announcementTypeCode: "TMZCSQ",
    announcementTypeName: "商标注册申请初步审定公告",
    detailPageNo: 1,
    announcementPageCount: 100,
    detailFileId: "file-1",
    detailAssetPath: "/group/1983/75/page.jpg",
    announcementDetailUrl: "",
  };
}

function page(pageIndex: number, sourceTotal: number, sourcePages: number, count: number) {
  const rows = Array.from({ length: count }, (_, i) => row(`p${pageIndex}-${i}`));
  return {
    pageIndex,
    pageSize: CNIPA_GAZETTE_PAGE_SIZE,
    sourceTotal,
    sourcePages,
    rows,
  } satisfies CnipaGazettePageResult;
}

describe("CNIPA Gazette checkpoint runtime", () => {
  it("plans bounded contiguous checkpoint ranges", () => {
    expect(planCnipaGazettePageRanges({ sourcePages: 6, pagesPerCheckpoint: 2 })).toEqual([
      { startPage: 1, endPage: 2 },
      { startPage: 3, endPage: 4 },
      { startPage: 5, endPage: 6 },
    ]);
  });

  it("rejects checkpoint sizes above the bounded ceiling", () => {
    expect(() =>
      planCnipaGazettePageRanges({ sourcePages: 1000, pagesPerCheckpoint: 101 }),
    ).toThrow(/pagesPerCheckpoint must be <= 100/);
  });

  it("builds a complete range checkpoint", () => {
    const checkpoint = buildCnipaGazetteCheckpoint({
      announcementIssue: 75,
      range: { startPage: 1, endPage: 2 },
      pages: [page(1, 250, 3, 100), page(2, 250, 3, 100)],
    });

    expect(checkpoint).toMatchObject({
      announcementIssue: 75,
      sourceTotal: 250,
      sourcePages: 3,
      rowCount: 200,
      uniqueOfficialRowIds: 200,
      completeness: "RANGE_COMPLETE",
    });
  });

  it("rejects drift, gaps and short non-terminal pages", () => {
    expect(() =>
      buildCnipaGazetteCheckpoint({
        announcementIssue: 75,
        range: { startPage: 1, endPage: 2 },
        pages: [page(1, 250, 3, 100), page(2, 251, 3, 100)],
      }),
    ).toThrow(/drifted/);

    expect(() =>
      buildCnipaGazetteCheckpoint({
        announcementIssue: 75,
        range: { startPage: 1, endPage: 2 },
        pages: [page(1, 250, 3, 100), page(3, 250, 3, 50)],
      }),
    ).toThrow(/page sequence mismatch/);

    expect(() =>
      buildCnipaGazetteCheckpoint({
        announcementIssue: 75,
        range: { startPage: 1, endPage: 1 },
        pages: [page(1, 250, 3, 99)],
      }),
    ).toThrow(/must contain exactly 100 rows/);
  });

  it("validates terminal page remainder", () => {
    expect(() =>
      buildCnipaGazetteCheckpoint({
        announcementIssue: 75,
        range: { startPage: 3, endPage: 3 },
        pages: [page(3, 250, 3, 49)],
      }),
    ).toThrow(/terminal page length mismatch/);

    expect(
      buildCnipaGazetteCheckpoint({
        announcementIssue: 75,
        range: { startPage: 3, endPage: 3 },
        pages: [page(3, 250, 3, 50)],
      }).rowCount,
    ).toBe(50);
  });

  it("assembles complete checkpoints into the Data Engine admission package", () => {
    const cp1 = buildCnipaGazetteCheckpoint({
      announcementIssue: 75,
      range: { startPage: 1, endPage: 2 },
      pages: [page(1, 250, 3, 100), page(2, 250, 3, 100)],
    });
    const cp2 = buildCnipaGazetteCheckpoint({
      announcementIssue: 75,
      range: { startPage: 3, endPage: 3 },
      pages: [page(3, 250, 3, 50)],
    });

    const result = assembleCnipaGazetteAdmissionPackage({
      announcementIssue: 75,
      announcementDate: "1983-08-15",
      sourceCaptureSchema: "CNIPA_GAZETTE_RUNTIME_CAPTURE_V1",
      sourceDatasetSha256: "a".repeat(64),
      sourceUri:
        "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
      collectedAt: "2026-09-19T06:00:00.000Z",
      checkpoints: [cp1, cp2],
    });

    expect(result).toMatchObject({
      contract_version: CNIPA_GAZETTE_DATA_ENGINE_ADMISSION_VERSION,
      source_authority: "CNIPA",
      completeness: "COMPLETE",
      announcement_issue: 75,
      announcement_date: "1983-08-15",
      record_count: 250,
      page_count: 3,
      page_size: 100,
    });
    expect(result.records).toHaveLength(250);
    expect(result.records[0]).toMatchObject({
      source_row_id: "p1-0",
      registration_number: "R-p1-0",
      announcement_issue: 75,
    });
  });

  it("fails closed on checkpoint coverage gaps or duplicate official ids", () => {
    const cp1 = buildCnipaGazetteCheckpoint({
      announcementIssue: 75,
      range: { startPage: 1, endPage: 1 },
      pages: [page(1, 250, 3, 100)],
    });
    const cp3 = buildCnipaGazetteCheckpoint({
      announcementIssue: 75,
      range: { startPage: 3, endPage: 3 },
      pages: [page(3, 250, 3, 50)],
    });

    expect(() =>
      assembleCnipaGazetteAdmissionPackage({
        announcementIssue: 75,
        announcementDate: "1983-08-15",
        sourceCaptureSchema: "CNIPA_GAZETTE_RUNTIME_CAPTURE_V1",
        sourceDatasetSha256: "a".repeat(64),
        sourceUri: "https://pub.sbj.cnipa.gov.cn",
        collectedAt: "2026-09-19T06:00:00.000Z",
        checkpoints: [cp1, cp3],
      }),
    ).toThrow(/coverage gap\/overlap/);

    const first = page(1, 200, 2, 100);
    const second = page(2, 200, 2, 100);
    second.rows = [first.rows[0]!, ...second.rows.slice(1)];
    const a = buildCnipaGazetteCheckpoint({
      announcementIssue: 75,
      range: { startPage: 1, endPage: 1 },
      pages: [first],
    });
    const b = buildCnipaGazetteCheckpoint({
      announcementIssue: 75,
      range: { startPage: 2, endPage: 2 },
      pages: [second],
    });

    expect(() =>
      assembleCnipaGazetteAdmissionPackage({
        announcementIssue: 75,
        announcementDate: "1983-08-15",
        sourceCaptureSchema: "CNIPA_GAZETTE_RUNTIME_CAPTURE_V1",
        sourceDatasetSha256: "a".repeat(64),
        sourceUri: "https://pub.sbj.cnipa.gov.cn",
        collectedAt: "2026-09-19T06:00:00.000Z",
        checkpoints: [a, b],
      }),
    ).toThrow(/duplicate official row id across checkpoints/);
  });

  it("rejects cross-issue rows and mismatched search ids", () => {
    const badIssue = page(1, 1, 1, 1);
    badIssue.rows = [row("x", 76)];
    expect(() =>
      buildCnipaGazetteCheckpoint({
        announcementIssue: 75,
        range: { startPage: 1, endPage: 1 },
        pages: [badIssue],
      }),
    ).toThrow(/does not match target issue 75/);

    const badSearch = page(1, 1, 1, 1);
    badSearch.rows = [{ ...badSearch.rows[0]!, sourceSearchId: "different" }];
    expect(() =>
      buildCnipaGazetteCheckpoint({
        announcementIssue: 75,
        range: { startPage: 1, endPage: 1 },
        pages: [badSearch],
      }),
    ).toThrow(/must match sourceRowId/);
  });
});
