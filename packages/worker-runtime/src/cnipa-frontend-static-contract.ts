import type { CnipaDocumentKind } from "./cnipa-trademark-judgment";

export const CNIPA_FRONTEND_STATIC_CONTRACT_STATUS =
  "OFFICIAL_FRONTEND_STATIC_CODE_OBSERVED" as const;

export type CnipaFrontendUiPartyRoleIntent =
  "APPLICANT" | "OPPOSER" | "OPPOSED_PARTY" | "RESPONDENT";

export type CnipaFrontendStaticContractSpec = {
  listRequestFields: readonly string[];
  fixedListRequestFields: Readonly<Record<string, number>>;
  detailRowIdField: string;
  frontendUsesRowFieldAsDetailQueryId: true;
  frontendConsumedListFields: readonly string[];
  frontendListItemsAccess: "data.list";
  frontendListTotalAccess: "data.total";
  frontendDetailAccess: "data";
  frontendUiPartyRoleIntentByField: Readonly<Record<string, CnipaFrontendUiPartyRoleIntent>>;
  frontendDateRangeMaxDifferenceDays: 30;
  frontendInitialPageIndex: 1;
  frontendInitialPageSize: 10;
};

export type CnipaFrontendStaticContractEvidence = {
  status: typeof CNIPA_FRONTEND_STATIC_CONTRACT_STATUS;
  observedDate: "2026-09-01";
  evidenceKind: "OPERATOR_RETRIEVED_OFFICIAL_STATIC_APPLICATION_CODE";
  publicApiBasePath: "/toas-pub-prod/pub-prod-api";
  httpClientSuccessReturn: "axiosResponse.data";
  featureResultRepresents: "AXIOS_RESPONSE_DATA_JSON_BODY";
  applicationCodeAccess: "axiosResponse.data.code";
  sharedDetailViewConsumedFields: readonly [
    "title",
    "source",
    "sendNoStr",
    "fileContent",
    "returnDate",
  ];
  byDocumentKind: Readonly<Record<CnipaDocumentKind, CnipaFrontendStaticContractSpec>>;
  doesNotVerify: readonly [
    "RAW_HTTP_RESPONSE_ENVELOPE_OR_SCHEMA",
    "LIVE_SOURCE_FIELD_CONFORMANCE",
    "BUSINESS_SUCCESS_SEMANTICS",
    "REAL_LIST_TO_DETAIL_IDENTITY",
    "PARTY_ROLE_SEMANTICS",
    "NORMALIZED_FIELD_SEMANTICS",
    "BACKEND_PAGINATION_OR_DATE_LIMITS",
    "AUTHENTICATED_403_SEMANTICS",
    "COVERAGE_COMPLETENESS",
  ];
};

/**
 * Evidence extracted from operator-retrieved official CNIPA portal static application code.
 * This freezes frontend request construction and client expectations only. The HTTP wrapper
 * returns Axios `response.data`, so feature-level `data.*` access and consumed field names
 * describe the JSON-body shape the client expects, not authenticated proof that the live
 * service currently conforms to it or that those fields are safe normalized semantics.
 */
export const CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE = {
  status: CNIPA_FRONTEND_STATIC_CONTRACT_STATUS,
  observedDate: "2026-09-01",
  evidenceKind: "OPERATOR_RETRIEVED_OFFICIAL_STATIC_APPLICATION_CODE",
  publicApiBasePath: "/toas-pub-prod/pub-prod-api",
  httpClientSuccessReturn: "axiosResponse.data",
  featureResultRepresents: "AXIOS_RESPONSE_DATA_JSON_BODY",
  applicationCodeAccess: "axiosResponse.data.code",
  sharedDetailViewConsumedFields: ["title", "source", "sendNoStr", "fileContent", "returnDate"],
  byDocumentKind: {
    REGISTRATION_EXAMINATION: {
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
      frontendConsumedListFields: [
        "adjuOpenId",
        "regNo",
        "tmName",
        "applicantCnName",
        "returnDateStr",
      ],
      frontendListItemsAccess: "data.list",
      frontendListTotalAccess: "data.total",
      frontendDetailAccess: "data",
      frontendUiPartyRoleIntentByField: { applicantCnName: "APPLICANT" },
      frontendDateRangeMaxDifferenceDays: 30,
      frontendInitialPageIndex: 1,
      frontendInitialPageSize: 10,
    },
    OPPOSITION_DECISION: {
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
      frontendConsumedListFields: [
        "adjuOpenId",
        "regNo",
        "tmName",
        "objenderCnName",
        "objeperCnName",
        "returnDateStr",
      ],
      frontendListItemsAccess: "data.list",
      frontendListTotalAccess: "data.total",
      frontendDetailAccess: "data",
      frontendUiPartyRoleIntentByField: {
        objenderCnName: "OPPOSER",
        objeperCnName: "OPPOSED_PARTY",
      },
      frontendDateRangeMaxDifferenceDays: 30,
      frontendInitialPageIndex: 1,
      frontendInitialPageSize: 10,
    },
    REVIEW_ADJUDICATION: {
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
      frontendConsumedListFields: [
        "pubId",
        "regNo",
        "tmName",
        "applicantName",
        "respondentName",
        "judgeDate",
      ],
      frontendListItemsAccess: "data.list",
      frontendListTotalAccess: "data.total",
      frontendDetailAccess: "data",
      frontendUiPartyRoleIntentByField: {
        applicantName: "APPLICANT",
        respondentName: "RESPONDENT",
      },
      frontendDateRangeMaxDifferenceDays: 30,
      frontendInitialPageIndex: 1,
      frontendInitialPageSize: 10,
    },
  },
  doesNotVerify: [
    "RAW_HTTP_RESPONSE_ENVELOPE_OR_SCHEMA",
    "LIVE_SOURCE_FIELD_CONFORMANCE",
    "BUSINESS_SUCCESS_SEMANTICS",
    "REAL_LIST_TO_DETAIL_IDENTITY",
    "PARTY_ROLE_SEMANTICS",
    "NORMALIZED_FIELD_SEMANTICS",
    "BACKEND_PAGINATION_OR_DATE_LIMITS",
    "AUTHENTICATED_403_SEMANTICS",
    "COVERAGE_COMPLETENESS",
  ],
} as const satisfies CnipaFrontendStaticContractEvidence;
