import type { CnipaDocumentKind } from "./cnipa-trademark-judgment";

export const CNIPA_FRONTEND_STATIC_CONTRACT_STATUS =
  "OFFICIAL_FRONTEND_STATIC_CODE_OBSERVED" as const;

export type CnipaFrontendStaticContractSpec = {
  listRequestFields: readonly string[];
  fixedListRequestFields: Readonly<Record<string, number>>;
  detailRowIdField: string;
  frontendListItemsAccess: "data.list";
  frontendListTotalAccess: "data.total";
  frontendDetailAccess: "data";
};

export type CnipaFrontendStaticContractEvidence = {
  status: typeof CNIPA_FRONTEND_STATIC_CONTRACT_STATUS;
  observedDate: "2026-09-01";
  evidenceKind: "OPERATOR_RETRIEVED_OFFICIAL_STATIC_APPLICATION_CODE";
  publicApiBasePath: "/toas-pub-prod/pub-prod-api";
  byDocumentKind: Readonly<Record<CnipaDocumentKind, CnipaFrontendStaticContractSpec>>;
  doesNotVerify: readonly [
    "RAW_HTTP_RESPONSE_ENVELOPE_OR_SCHEMA",
    "BUSINESS_SUCCESS_SEMANTICS",
    "REAL_LIST_TO_DETAIL_IDENTITY",
    "PARTY_ROLE_SEMANTICS",
    "BACKEND_PAGINATION_OR_DATE_LIMITS",
    "AUTHENTICATED_403_SEMANTICS",
    "COVERAGE_COMPLETENESS",
  ];
};

/**
 * Evidence extracted from operator-retrieved official CNIPA portal static application code.
 * This freezes frontend request construction and frontend response-access expectations only.
 * It is deliberately separate from authenticated server-response/schema verification.
 */
export const CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE = {
  status: CNIPA_FRONTEND_STATIC_CONTRACT_STATUS,
  observedDate: "2026-09-01",
  evidenceKind: "OPERATOR_RETRIEVED_OFFICIAL_STATIC_APPLICATION_CODE",
  publicApiBasePath: "/toas-pub-prod/pub-prod-api",
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
      frontendListItemsAccess: "data.list",
      frontendListTotalAccess: "data.total",
      frontendDetailAccess: "data",
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
      frontendListItemsAccess: "data.list",
      frontendListTotalAccess: "data.total",
      frontendDetailAccess: "data",
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
      frontendListItemsAccess: "data.list",
      frontendListTotalAccess: "data.total",
      frontendDetailAccess: "data",
    },
  },
  doesNotVerify: [
    "RAW_HTTP_RESPONSE_ENVELOPE_OR_SCHEMA",
    "BUSINESS_SUCCESS_SEMANTICS",
    "REAL_LIST_TO_DETAIL_IDENTITY",
    "PARTY_ROLE_SEMANTICS",
    "BACKEND_PAGINATION_OR_DATE_LIMITS",
    "AUTHENTICATED_403_SEMANTICS",
    "COVERAGE_COMPLETENESS",
  ],
} as const satisfies CnipaFrontendStaticContractEvidence;
