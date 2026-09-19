import { describe, expect, it } from "vitest";
import {
  CNIPA_GAZETTE_V094_SMALL_COMPLETE_SCHEMA,
  CnipaGazetteV094CaptureTransport,
  parseCnipaGazetteV094SmallCompleteCapture,
} from "./cnipa-gazette-v094-capture";

function row(index: number) {
  const id = index.toString(16).toUpperCase().padStart(32, "0");
  return {
    id,
    searchId: id,
    anncIssue: "75",
    anncDate: "1983-08-15",
    anncType: "TMZCSQ",
    anncTypeName: "商标初步审定公告",
    regNo: String(200000 + index),
    pageNo: Math.floor(index / 6) + 1,
    fileId: `FILE-${Math.floor(index / 6)}`,
    imgDir: `/group1/page-${Math.floor(index / 6)}.jpg`,
    anncPageNum: 97,
  };
}

function capture() {
  const records = Array.from({ length: 576 }, (_, index) => row(index));
  return {
    exportedSchema: CNIPA_GAZETTE_V094_SMALL_COMPLETE_SCHEMA,
    tool: "MO CNIPA Network Capture",
    version: "0.9.4",
    kind: "gazette_small_issue_complete",
    exportedAt: "2026-09-19T14:06:48.000Z",
    announcementIssue: "75",
    query: {
      anncIssue: "75",
      anncType: "",
      regNo: "",
      tmName: "",
      intlCls: "",
      registerCnName: "",
      coowner: "",
      agentName: "",
      tmType: "",
      tmDescType: "0",
      startDate: "",
      endDate: "",
      pageIndex: 1,
      pageSize: 100,
    },
    sourceUrl:
      "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
    sourceTotal: 576,
    sourcePages: 6,
    pageSize: 100,
    collectedCount: 576,
    uniqueOfficialRowIds: 576,
    expectedLastPageLength: 76,
    observedLastPageLength: 76,
    completeness: "COMPLETE",
    records,
  };
}

describe("MO CNIPA Network Capture v0.9.4 Gazette small-complete import", () => {
  it("accepts the frozen issue-75 completeness shape", () => {
    expect(parseCnipaGazetteV094SmallCompleteCapture(capture())).toMatchObject({
      version: "0.9.4",
      announcementIssue: "75",
      sourceTotal: 576,
      sourcePages: 6,
      pageSize: 100,
      collectedCount: 576,
      uniqueOfficialRowIds: 576,
      expectedLastPageLength: 76,
      observedLastPageLength: 76,
      completeness: "COMPLETE",
    });
  });

  it("replays the capture offline as five 100-row pages plus one 76-row page", async () => {
    const parsed = parseCnipaGazetteV094SmallCompleteCapture(capture());
    const transport = new CnipaGazetteV094CaptureTransport(parsed);
    const first = await transport.postJson({
      path: "/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
      body: parsed.query,
    });
    const last = await transport.postJson({
      path: "/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
      body: { ...parsed.query, pageIndex: 6 },
    });
    const firstJson = JSON.parse(new TextDecoder().decode(first.rawBody));
    const lastJson = JSON.parse(new TextDecoder().decode(last.rawBody));
    expect(firstJson.data).toMatchObject({
      pageIndex: 1,
      pageSize: 100,
      total: 576,
      pages: 6,
    });
    expect(firstJson.data.list).toHaveLength(100);
    expect(lastJson.data).toMatchObject({
      pageIndex: 6,
      pageSize: 100,
      total: 576,
      pages: 6,
    });
    expect(lastJson.data.list).toHaveLength(76);
    expect(lastJson.data.list[75].id).toBe(row(575).id);
  });

  it("rejects old tool versions, incomplete counters and duplicate official ids", () => {
    expect(() =>
      parseCnipaGazetteV094SmallCompleteCapture({ ...capture(), version: "0.9.3" }),
    ).toThrow(/v0\.9\.4/);
    expect(() =>
      parseCnipaGazetteV094SmallCompleteCapture({ ...capture(), collectedCount: 575 }),
    ).toThrow(/completeness counters/);
    const duplicate = capture();
    duplicate.records[575] = { ...duplicate.records[575], id: duplicate.records[0].id };
    expect(() => parseCnipaGazetteV094SmallCompleteCapture(duplicate)).toThrow(
      /duplicate official id/,
    );
  });

  it("rejects query/source/terminal-page drift", () => {
    expect(() =>
      parseCnipaGazetteV094SmallCompleteCapture({
        ...capture(),
        query: { ...capture().query, anncType: "TMZCSQ" },
      }),
    ).toThrow(/issue \+ ALL/);
    expect(() =>
      parseCnipaGazetteV094SmallCompleteCapture({
        ...capture(),
        sourceUrl: "https://pub.sbj.cnipa.gov.cn/bad",
      }),
    ).toThrow(/canonical CNIPA Gazette LIST endpoint/);
    expect(() =>
      parseCnipaGazetteV094SmallCompleteCapture({
        ...capture(),
        observedLastPageLength: 75,
      }),
    ).toThrow(/last-page length/);
  });
});
