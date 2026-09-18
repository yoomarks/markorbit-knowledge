import { describe, expect, it } from "vitest";
import {
  CNIPA_AUTH_ARCHITECTURE_EVIDENCE,
  CNIPA_AUTH_ARCHITECTURE_EVIDENCE_STATUS,
  CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE,
  CNIPA_FRONTEND_STATIC_CONTRACT_STATUS,
} from "./cnipa-frontend-static-contract";
import {
  CNIPA_JUDGMENT_SCHEMA_STATUS,
  buildCnipaCandidateListRequest,
} from "./cnipa-trademark-judgment";

const registrationNumberQuery = {
  mode: "REGISTRATION_NUMBER",
  registrationNumber: "1234567",
} as const;

describe("CNIPA authentication architecture evidence", () => {
  it("records verified client observations without inferring judgment route client ids", () => {
    expect(CNIPA_AUTH_ARCHITECTURE_EVIDENCE_STATUS).toBe("PARTIALLY_VERIFIED");
    expect(CNIPA_AUTH_ARCHITECTURE_EVIDENCE).toMatchObject({
      observedDate: "2026-09-17",
      sharedSsoObservedByOperator: true,
      trademarkQuery: {
        host: "wcjs.sbj.cnipa.gov.cn",
        userInfoPath: "/api/user/getInfo",
        clientId: "trademark_query",
      },
      publicPortalBrandNotice: {
        clientId: "trademark_three_public",
        stateRoute: "portalui-pub-prod/brandNotice",
      },
      judgmentRouteClientAllocation: {
        trademarkRegistration: "UNVERIFIED",
        trademarkObjection: "UNVERIFIED",
        reviewAdjudication: "UNVERIFIED",
      },
      routeNameMayBeUsedAsClientId: false,
    });
    expect(CNIPA_AUTH_ARCHITECTURE_EVIDENCE.doesNotVerify).toContain(
      "JUDGMENT_RAW_HTTP_RESPONSE_ENVELOPE_OR_SCHEMA",
    );
    expect(CNIPA_AUTH_ARCHITECTURE_EVIDENCE.doesNotVerify).toContain(
      "JUDGMENT_DATA_TOTAL_SEMANTICS",
    );
    expect(CNIPA_JUDGMENT_SCHEMA_STATUS).toBe("OPERATOR_SUPPLIED_UNVERIFIED");
  });
});

describe("CNIPA official frontend static request contract", () => {
  it("records the public API base and evidence boundary separately from live schema verification", () => {
    expect(CNIPA_FRONTEND_STATIC_CONTRACT_STATUS).toBe("OFFICIAL_FRONTEND_STATIC_CODE_OBSERVED");
    expect(CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE).toMatchObject({
      observedDate: "2026-09-01",
      evidenceKind: "OPERATOR_RETRIEVED_OFFICIAL_STATIC_APPLICATION_CODE",
      publicApiBasePath: "/toas-pub-prod/pub-prod-api",
      httpClientSuccessReturn: "axiosResponse.data",
      featureResultRepresents: "AXIOS_RESPONSE_DATA_JSON_BODY",
      applicationCodeAccess: "axiosResponse.data.code",
      sharedDetailViewConsumedFields: ["title", "source", "sendNoStr", "fileContent", "returnDate"],
    });
    expect(CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.doesNotVerify).toContain(
      "RAW_HTTP_RESPONSE_ENVELOPE_OR_SCHEMA",
    );
    expect(CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.doesNotVerify).toContain(
      "LIVE_SOURCE_FIELD_CONFORMANCE",
    );
    expect(CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.doesNotVerify).toContain(
      "REAL_LIST_TO_DETAIL_IDENTITY",
    );
    expect(CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.doesNotVerify).toContain("PARTY_ROLE_SEMANTICS");
    expect(CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.doesNotVerify).toContain(
      "NORMALIZED_FIELD_SEMANTICS",
    );
    expect(CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.doesNotVerify).toContain(
      "BACKEND_PAGINATION_OR_DATE_LIMITS",
    );
    expect(CNIPA_JUDGMENT_SCHEMA_STATUS).toBe("OPERATOR_SUPPLIED_UNVERIFIED");
  });

  it("records the statically observed per-library request fields and row-to-detail id properties", () => {
    expect(
      CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.byDocumentKind.REGISTRATION_EXAMINATION,
    ).toMatchObject({
      listRequestFields: [
        "regNo",
        "tmName",
        "applicantCnName",
        "returnDateStart",
        "returnDateEnd",
        "pageIndex",
        "pageSize",
      ],
      fixedListRequestFields: {},
      detailRowIdField: "adjuOpenId",
      frontendUsesRowFieldAsDetailQueryId: true,
      frontendListItemsAccess: "data.list",
      frontendListTotalAccess: "data.total",
      frontendDetailAccess: "data",
    });
    expect(
      CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.byDocumentKind.OPPOSITION_DECISION,
    ).toMatchObject({
      listRequestFields: [
        "openFlag",
        "regNo",
        "tmName",
        "objenderCnName",
        "objeperCnName",
        "objenderAgentName",
        "objeperAgentName",
        "returnDateStart",
        "returnDateEnd",
        "pageIndex",
        "pageSize",
      ],
      fixedListRequestFields: { openFlag: 1 },
      detailRowIdField: "adjuOpenId",
      frontendUsesRowFieldAsDetailQueryId: true,
    });
    expect(
      CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.byDocumentKind.REVIEW_ADJUDICATION,
    ).toMatchObject({
      listRequestFields: [
        "openFlag",
        "regNo",
        "tmName",
        "applicantName",
        "respondentName",
        "judgeDateStart",
        "judgeDateEnd",
        "pageIndex",
        "pageSize",
      ],
      fixedListRequestFields: { openFlag: 1 },
      detailRowIdField: "pubId",
      frontendUsesRowFieldAsDetailQueryId: true,
    });
  });

  it("records only the list/detail fields consumed by the official frontend", () => {
    expect(
      CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.byDocumentKind.REGISTRATION_EXAMINATION
        .frontendConsumedListFields,
    ).toEqual(["adjuOpenId", "regNo", "tmName", "applicantCnName", "returnDateStr"]);
    expect(
      CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.byDocumentKind.OPPOSITION_DECISION
        .frontendConsumedListFields,
    ).toEqual([
      "adjuOpenId",
      "regNo",
      "tmName",
      "objenderCnName",
      "objeperCnName",
      "returnDateStr",
    ]);
    expect(
      CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.byDocumentKind.REVIEW_ADJUDICATION
        .frontendConsumedListFields,
    ).toEqual(["pubId", "regNo", "tmName", "applicantName", "respondentName", "judgeDate"]);
    expect(CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.sharedDetailViewConsumedFields).toEqual([
      "title",
      "source",
      "sendNoStr",
      "fileContent",
      "returnDate",
    ]);
  });

  it("records UI role intent and UI pagination/date constraints without promoting backend semantics", () => {
    const registration =
      CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.byDocumentKind.REGISTRATION_EXAMINATION;
    const opposition = CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.byDocumentKind.OPPOSITION_DECISION;
    const review = CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.byDocumentKind.REVIEW_ADJUDICATION;

    expect(registration.frontendUiPartyRoleIntentByField).toEqual({
      applicantCnName: "APPLICANT",
    });
    expect(opposition.frontendUiPartyRoleIntentByField).toEqual({
      objenderCnName: "OPPOSER",
      objeperCnName: "OPPOSED_PARTY",
    });
    expect(review.frontendUiPartyRoleIntentByField).toEqual({
      applicantName: "APPLICANT",
      respondentName: "RESPONDENT",
    });

    for (const spec of [registration, opposition, review]) {
      expect(spec.frontendDateRangeMaxDifferenceDays).toBe(30);
      expect(spec.frontendInitialPageIndex).toBe(1);
      expect(spec.frontendInitialPageSize).toBe(10);
    }
  });

  it("applies only the statically observed fixed openFlag behavior to candidate list requests", () => {
    expect(
      buildCnipaCandidateListRequest("REGISTRATION_EXAMINATION", registrationNumberQuery).jsonBody,
    ).toEqual({ pageIndex: 1, pageSize: 10, regNo: "1234567" });
    expect(
      buildCnipaCandidateListRequest("OPPOSITION_DECISION", registrationNumberQuery).jsonBody,
    ).toEqual({ openFlag: 1, pageIndex: 1, pageSize: 10, regNo: "1234567" });
    expect(
      buildCnipaCandidateListRequest("REVIEW_ADJUDICATION", registrationNumberQuery).jsonBody,
    ).toEqual({ openFlag: 1, pageIndex: 1, pageSize: 10, regNo: "1234567" });
  });

  it("keeps unverified party-name construction fail-closed while allowing all verified date shapes", () => {
    expect(() =>
      buildCnipaCandidateListRequest("OPPOSITION_DECISION", {
        mode: "PARTY_NAME",
        partyName: "Synthetic Party",
      }),
    ).toThrow(/request semantics are not authenticated-live-verified/i);

    expect(
      buildCnipaCandidateListRequest("REGISTRATION_EXAMINATION", {
        mode: "DATE_RANGE",
        fromDate: "2026-01-01",
        toDate: "2026-01-30",
      }).jsonBody,
    ).toEqual({
      regNo: "",
      tmName: "",
      applicantCnName: "",
      returnDateStart: "2026-01-01",
      returnDateEnd: "2026-01-30",
      pageIndex: 1,
      pageSize: 100,
    });

    expect(
      buildCnipaCandidateListRequest("OPPOSITION_DECISION", {
        mode: "DATE_RANGE",
        fromDate: "2026-01-01",
        toDate: "2026-01-30",
      }).jsonBody,
    ).toEqual({
      openFlag: 1,
      regNo: "",
      tmName: "",
      objenderCnName: "",
      objeperCnName: "",
      objenderAgentName: "",
      objeperAgentName: "",
      returnDateStart: "2026-01-01",
      returnDateEnd: "2026-01-30",
      pageIndex: 1,
      pageSize: 100,
    });

    expect(
      buildCnipaCandidateListRequest("REVIEW_ADJUDICATION", {
        mode: "DATE_RANGE",
        fromDate: "2026-01-01",
        toDate: "2026-01-30",
      }).jsonBody,
    ).toEqual({
      openFlag: 1,
      regNo: "",
      tmName: "",
      applicantName: "",
      respondentName: "",
      judgeDateStart: "2026-01-01",
      judgeDateEnd: "2026-01-30",
      pageIndex: 1,
      pageSize: 100,
    });
  });
});
