import { describe, expect, it } from "vitest";
import {
  CNIPA_GAZETTE_CAPTURE_DATASET_SCHEMA,
  assessCnipaGazetteCaptureDataset,
  parseCnipaGazetteCaptureDataset,
} from "./cnipa-gazette-capture-dataset";

function row(index: number) {
  const id = String(2_097_870_000_000_000_000n + BigInt(index));
  return {
    id,
    searchId: id,
    anncIssue: "1999",
    anncDate: "2026-09-13",
    anncType: index % 2 === 0 ? "TMZCSQ" : "TMXZSQ",
    anncTypeName: index % 2 === 0 ? "商标初步审定公告" : "注册商标续展公告",
    regNo: String(90000000 + index),
    registerCnName: `申请人${index}`,
    tmName: `商标${index}`,
    intlCls: String((index % 45) + 1),
    pageNo: index + 1,
    fileId: String(2_097_880_000_000_000_000n + BigInt(index)),
    imgDir: `/group3/M00/test/page-${index + 1}.pdf`,
    anncPageNum: 100,
  };
}

function dataset() {
  const records = [row(0), row(1)];
  return {
    exportedSchema: CNIPA_GAZETTE_CAPTURE_DATASET_SCHEMA,
    tool: "MO CNIPA Network Capture",
    version: "0.9.0",
    kind: "gazette_issue",
    exportedAt: "2026-09-19T00:00:00.000Z",
    completedAt: "2026-09-19T00:00:01.000Z",
    announcementIssue: "1999",
    announcementDatesObserved: ["2026-09-13"],
    query: {
      anncIssue: "1999",
      anncType: "",
      pageIndex: 1,
      pageSize: 100,
    },
    sourceUrl:
      "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
    count: records.length,
    records,
    pages: [
      {
        requestedPageIndex: 1,
        requestedPageSize: 100,
        attempts: 0,
        httpStatus: 200,
        code: 0,
        responseTotal: 2,
        listLength: 2,
        newUnique: 2,
        overlapWithSeenBeforePage: 0,
        pageSignatureSha256: "a".repeat(64),
      },
    ],
    stopReason: "SHORT_PAGE_2",
    rowIdentityStrategy: "official-id-with-canonical-row-sha256-integrity",
  };
}

describe("CNIPA Gazette capture dataset", () => {
  it("parses the dedicated Network Capture Gazette schema", () => {
    expect(parseCnipaGazetteCaptureDataset(dataset())).toMatchObject({
      exportedSchema: "mo-cnipa-gazette-dataset-v1",
      tool: "MO CNIPA Network Capture",
      kind: "gazette_issue",
      announcementIssue: "1999",
      count: 2,
    });
  });

  it("accepts a complete issue/all/page-100 capture for issue and entry projection", () => {
    expect(assessCnipaGazetteCaptureDataset(dataset())).toMatchObject({
      announcementIssue: "1999",
      sourceUrlMatches: true,
      queryIsIssueAllPage100: true,
      countMatchesRecords: true,
      pagesContiguousFromOne: true,
      allPagesRequestedAt100: true,
      allRowsMatchAnnouncementIssue: true,
      officialRowIdsPresentAndUnique: true,
      searchIdsMatchOfficialRowIds: true,
      requiredFieldsMissingFromAnyRow: [],
      detailLocatorFieldsMissingFromAnyRow: [],
      terminalObserved: true,
      readyForIssueCatalogProjection: true,
      readyForAnnouncementEntryProjection: true,
      readyForDetailCandidateProjection: true,
      reasons: [],
    });
  });

  it("keeps detail candidate projection closed when page locator material is missing", () => {
    const input = dataset();
    input.records = input.records.map((item) => {
      const copy = { ...item } as Record<string, unknown>;
      delete copy.pageNo;
      return copy;
    }) as ReturnType<typeof row>[];

    const assessment = assessCnipaGazetteCaptureDataset(input);
    expect(assessment.readyForIssueCatalogProjection).toBe(true);
    expect(assessment.readyForAnnouncementEntryProjection).toBe(true);
    expect(assessment.readyForDetailCandidateProjection).toBe(false);
    expect(assessment.detailLocatorFieldsMissingFromAnyRow).toEqual(["pageNo"]);
  });

  it("fails projection readiness when official row identity is duplicated or searchId drifts", () => {
    const input = dataset();
    input.records[1] = { ...input.records[1], id: input.records[0].id, searchId: "different" };

    const assessment = assessCnipaGazetteCaptureDataset(input);
    expect(assessment.officialRowIdsPresentAndUnique).toBe(false);
    expect(assessment.searchIdsMatchOfficialRowIds).toBe(false);
    expect(assessment.readyForAnnouncementEntryProjection).toBe(false);
  });

  it("fails projection readiness for the wrong issue, type filter, pagination or record count", () => {
    const input = dataset();
    input.query.anncType = "01";
    input.query.pageSize = 10;
    input.count = 3;
    input.records[0] = { ...input.records[0], anncIssue: "1998" };

    const assessment = assessCnipaGazetteCaptureDataset(input);
    expect(assessment.readyForIssueCatalogProjection).toBe(false);
    expect(assessment.readyForAnnouncementEntryProjection).toBe(false);
    expect(assessment.queryIsIssueAllPage100).toBe(false);
    expect(assessment.countMatchesRecords).toBe(false);
    expect(assessment.allRowsMatchAnnouncementIssue).toBe(false);
  });

  it("requires a recognized natural/repeat terminal instead of treating arbitrary failure as complete", () => {
    const input = dataset();
    input.stopReason = "PAGE_2_DELIVERY_OR_JSON_FAILURE";

    const assessment = assessCnipaGazetteCaptureDataset(input);
    expect(assessment.terminalObserved).toBe(false);
    expect(assessment.readyForIssueCatalogProjection).toBe(false);
    expect(assessment.reasons).toContain("capture did not stop on a recognized terminal condition");
  });

  it("rejects malformed dataset identity and page-size claims", () => {
    expect(() =>
      parseCnipaGazetteCaptureDataset({
        ...dataset(),
        tool: "Other Tool",
      }),
    ).toThrow(/MO CNIPA Network Capture/i);

    expect(() =>
      parseCnipaGazetteCaptureDataset({
        ...dataset(),
        pages: [{ ...dataset().pages[0], requestedPageSize: 10 }],
      }),
    ).toThrow(/requestedPageSize must equal 100/i);
  });
});
