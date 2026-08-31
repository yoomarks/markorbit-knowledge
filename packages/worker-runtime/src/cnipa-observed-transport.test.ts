import { describe, expect, it } from "vitest";
import {
  CNIPA_CANDIDATE_ENDPOINTS,
  CNIPA_JUDGMENT_SCHEMA_STATUS,
  buildCnipaCandidateDetailRequest,
} from "./cnipa-trademark-judgment";

const PREFIX = "/toas-pub-prod/pub-prod-api/pubnotice/portal";

describe("CNIPA ordinary-Chrome observed transport", () => {
  it("freezes the full API prefix for all three list/detail endpoint pairs", () => {
    expect(CNIPA_CANDIDATE_ENDPOINTS.REGISTRATION_EXAMINATION).toMatchObject({
      listPath: `${PREFIX}/tmscJudgment/queryPageList`,
      detailPath: `${PREFIX}/tmscJudgment/queryInfo`,
    });
    expect(CNIPA_CANDIDATE_ENDPOINTS.OPPOSITION_DECISION).toMatchObject({
      listPath: `${PREFIX}/tmyyJudgment/queryPageList`,
      detailPath: `${PREFIX}/tmyyJudgment/queryInfo`,
    });
    expect(CNIPA_CANDIDATE_ENDPOINTS.REVIEW_ADJUDICATION).toMatchObject({
      listPath: `${PREFIX}/tmpsJudgment/queryPageList`,
      detailPath: `${PREFIX}/tmpsJudgment/queryInfo`,
    });
  });

  it("uses POST detail transport while retaining only the observed id query key", () => {
    expect(buildCnipaCandidateDetailRequest("REGISTRATION_EXAMINATION", "record-1")).toEqual({
      method: "POST",
      path: `${PREFIX}/tmscJudgment/queryInfo`,
      documentKind: "REGISTRATION_EXAMINATION",
      surface: "DETAIL",
      query: { id: "record-1" },
    });
  });

  it("does not promote the unverified response/schema state", () => {
    expect(CNIPA_JUDGMENT_SCHEMA_STATUS).toBe("OPERATOR_SUPPLIED_UNVERIFIED");
  });
});
