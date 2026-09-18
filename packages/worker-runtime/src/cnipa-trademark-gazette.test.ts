import { describe, expect, it } from "vitest";
import {
  CNIPA_GAZETTE_CAPTURE_POLICY,
  CNIPA_GAZETTE_ENDPOINTS,
  CNIPA_GAZETTE_FRONTEND_STATIC_EVIDENCE,
  CNIPA_GAZETTE_OPERATOR_PLANNING_BASELINE,
  CNIPA_GAZETTE_SCHEMA_STATUS,
  CNIPA_GAZETTE_SOURCE_FAMILY,
  buildCnipaGazetteFileAddressRequest,
  buildCnipaGazetteIssueAllPageRequest,
  buildCnipaGazetteLatestIssueRequest,
  buildCnipaGazettePageFileRequest,
  buildCnipaGazetteTypeDictionaryRequest,
} from "./cnipa-trademark-gazette";

describe("CNIPA Trademark Gazette contract", () => {
  it("keeps Gazette separate from judgment document kinds", () => {
    expect(CNIPA_GAZETTE_SOURCE_FAMILY).toBe("CNIPA_TRADEMARK_GAZETTE");
    expect(CNIPA_GAZETTE_SCHEMA_STATUS).toBe("OFFICIAL_FRONTEND_STATIC_CODE_OBSERVED");
    expect(CNIPA_GAZETTE_FRONTEND_STATIC_EVIDENCE.detailSemantics).toEqual({
      organization: "ISSUE_TYPE_PAGE",
      perListRowDecisionDocument: false,
      pageNavigationUsesIssueTypeAndPageNumber: true,
      pageArtifactMayBePdfOrImage: true,
    });
  });

  it("freezes official frontend endpoints and the observed Gazette SSO allocation", () => {
    expect(CNIPA_GAZETTE_ENDPOINTS).toEqual({
      latestIssue: "/toas-pub-prod/pub-prod-api/public/web/anncInfo/maxIssue",
      typeDictionary: "/toas-pub-prod/pub-prod-api/public/web/anncInfo/queryTmggTypeDict",
      list: "/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
      pageFile: "/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmggFile",
      fileAddress: "/toas-pub-prod/pub-prod-api/public/web/portal/fileAddr",
    });
    expect(CNIPA_GAZETTE_FRONTEND_STATIC_EVIDENCE.sso).toMatchObject({
      clientId: "trademark_three_public",
      stateRoute: "portalui-pub-prod/brandNotice",
    });
  });

  it("records the official frontend all-type value and 100-row UI page-size option", () => {
    expect(CNIPA_GAZETTE_FRONTEND_STATIC_EVIDENCE.uiAllAnnouncementTypeValue).toBe("");
    expect(CNIPA_GAZETTE_FRONTEND_STATIC_EVIDENCE.frontendPageSizeOptions).toContain(100);
    expect(CNIPA_GAZETTE_FRONTEND_STATIC_EVIDENCE.frontendListFields).toEqual([
      "anncIssue",
      "anncDate",
      "anncTypeName",
      "regNo",
      "registerCnName",
      "tmName",
    ]);
  });

  it("records operator-supplied historical planning bounds without synthesizing old dates", () => {
    expect(CNIPA_GAZETTE_OPERATOR_PLANNING_BASELINE).toMatchObject({
      historicalFloor: {
        announcementIssue: 73,
        announcementDate: "1983-07-15",
      },
      currentKnownUpperBound: {
        announcementIssue: 1999,
        announcementDate: "2026-09-13",
      },
      currentExpectedPublicationDaysOfMonth: [6, 13, 20, 27],
      planningOnly: true,
      synthesizeHistoricalPublicationDates: false,
    });
  });

  it("routes Gazette acquisition through MO CNIPA Network Capture with issue-all paging", () => {
    expect(CNIPA_GAZETTE_CAPTURE_POLICY).toMatchObject({
      captureTool: "MO CNIPA Network Capture",
      captureMechanism: "CHROME_DEBUGGER_CDP",
      primaryHistoricalKey: "ANNOUNCEMENT_ISSUE",
      announcementTypeSelection: "ALL",
      capturedAnnouncementTypeValue: "",
      pageSize: 100,
      reuseCapturedSuccessfulListPostBody: true,
      mutateOnlyPagingFieldsDuringSweep: true,
      expectedExportSchema: "mo-cnipa-gazette-dataset-v1",
      detailAcquisitionMode: "CANDIDATE_ONLY",
    });
  });

  it("builds page-100 Gazette requests by reusing a successful captured issue/all POST body", () => {
    const capturedListBody = {
      anncIssue: "1999",
      anncType: "",
      regNo: "",
      tmName: "",
      intlCls: "",
      registerCnName: "",
      coowner: "",
      agentName: "",
      tmType: "",
      tmDescType: "1",
      startDate: "",
      endDate: "",
      pageIndex: 1,
      pageSize: 10,
    };

    expect(buildCnipaGazetteIssueAllPageRequest({ capturedListBody, pageIndex: 3 })).toEqual({
      method: "POST",
      path: CNIPA_GAZETTE_ENDPOINTS.list,
      surface: "LIST",
      jsonBody: {
        ...capturedListBody,
        pageIndex: 3,
        pageSize: 100,
      },
    });
  });

  it("fails closed if the captured base request is not an issue/all query", () => {
    expect(() =>
      buildCnipaGazetteIssueAllPageRequest({
        capturedListBody: { anncIssue: "1999", anncType: "01" },
        pageIndex: 1,
      }),
    ).toThrow(/ALL value/i);

    expect(() =>
      buildCnipaGazetteIssueAllPageRequest({
        capturedListBody: { anncIssue: "", anncType: "" },
        pageIndex: 1,
      }),
    ).toThrow(/anncIssue/i);
  });

  it("keeps page-file lookup separate from default detail acquisition", () => {
    expect(
      buildCnipaGazettePageFileRequest({
        announcementIssue: "1999",
        announcementType: "01",
        pageNumber: 42,
      }),
    ).toEqual({
      method: "POST",
      path: CNIPA_GAZETTE_ENDPOINTS.pageFile,
      surface: "PAGE_FILE",
      jsonBody: {
        pageSize: 1,
        pageIndex: 1,
        pageNo: 42,
        anncIssue: "1999",
        anncType: "01",
      },
    });
  });

  it("keeps metadata request builders narrow and source-explicit", () => {
    expect(buildCnipaGazetteLatestIssueRequest()).toEqual({
      method: "GET",
      path: CNIPA_GAZETTE_ENDPOINTS.latestIssue,
      surface: "LATEST_ISSUE",
    });
    expect(buildCnipaGazetteTypeDictionaryRequest()).toEqual({
      method: "POST",
      path: CNIPA_GAZETTE_ENDPOINTS.typeDictionary,
      surface: "TYPE_DICTIONARY",
    });
    expect(buildCnipaGazetteFileAddressRequest()).toEqual({
      method: "GET",
      path: CNIPA_GAZETTE_ENDPOINTS.fileAddress,
      surface: "FILE_ADDRESS",
    });
  });
});
