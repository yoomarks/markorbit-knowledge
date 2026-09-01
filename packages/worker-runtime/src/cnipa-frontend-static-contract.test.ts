import { describe, expect, it } from "vitest";
import {
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

describe("CNIPA official frontend static request contract", () => {
  it("records the public API base and evidence boundary separately from live schema verification", () => {
    expect(CNIPA_FRONTEND_STATIC_CONTRACT_STATUS).toBe("OFFICIAL_FRONTEND_STATIC_CODE_OBSERVED");
    expect(CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE).toMatchObject({
      observedDate: "2026-09-01",
      evidenceKind: "OPERATOR_RETRIEVED_OFFICIAL_STATIC_APPLICATION_CODE",
      publicApiBasePath: "/toas-pub-prod/pub-prod-api",
    });
    expect(CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.doesNotVerify).toContain(
      "RAW_HTTP_RESPONSE_ENVELOPE_OR_SCHEMA",
    );
    expect(CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.doesNotVerify).toContain(
      "REAL_LIST_TO_DETAIL_IDENTITY",
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
    });
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
});
