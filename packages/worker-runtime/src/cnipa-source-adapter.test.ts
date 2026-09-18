import { describe, expect, it } from "vitest";
import {
  CnipaSourceAdapter,
  type CnipaAuthenticatedRequest,
  type CnipaAuthenticatedSessionExecutor,
  type CnipaAuthenticatedSessionResponse,
  type CnipaDecodedDetail,
  type CnipaDocumentKind,
  type CnipaJudgmentResponseDecoder,
} from "./cnipa-source-adapter";

function jsonResponse(
  request: CnipaAuthenticatedRequest,
  value: unknown,
  overrides: Partial<CnipaAuthenticatedSessionResponse> = {},
): CnipaAuthenticatedSessionResponse {
  const suffix =
    request.surface === "DETAIL" ? `?id=${encodeURIComponent(request.query?.id ?? "")}` : "";
  return {
    status: 200,
    sourceUri: `https://example.cnipa.invalid${request.path}${suffix}`,
    contentType: "application/json;charset=UTF-8",
    observedAt: "2026-08-29T00:00:00.000Z",
    body: new TextEncoder().encode(JSON.stringify(value)),
    securityState: "OK",
    ...overrides,
  };
}

class FixtureExecutor implements CnipaAuthenticatedSessionExecutor {
  readonly requests: CnipaAuthenticatedRequest[] = [];

  async execute(request: CnipaAuthenticatedRequest): Promise<CnipaAuthenticatedSessionResponse> {
    this.requests.push(request);
    if (request.surface === "LIST") {
      return jsonResponse(request, { synthetic: true, records: [`${request.documentKind}-1`] });
    }
    return jsonResponse(request, { synthetic: true, id: request.query?.id });
  }
}

class FixtureDecoder implements CnipaJudgmentResponseDecoder {
  decodeList(documentKind: CnipaDocumentKind): { sourceRecordIds: string[]; hasMore: false } {
    return { sourceRecordIds: [`${documentKind}-1`], hasMore: false };
  }

  decodeDetail(documentKind: CnipaDocumentKind, sourceRecordId: string): CnipaDecodedDetail {
    const parties: CnipaDecodedDetail["parties"] =
      documentKind === "REGISTRATION_EXAMINATION"
        ? [{ role: "APPLICANT", name: "Synthetic Applicant", sourceField: "applicantCnName" }]
        : documentKind === "OPPOSITION_DECISION"
          ? [
              { role: "UNVERIFIED", name: "Synthetic Party A", sourceField: "objenderCnName" },
              { role: "UNVERIFIED", name: "Synthetic Party B", sourceField: "objeperCnName" },
            ]
          : [
              { role: "APPLICANT", name: "Synthetic Applicant", sourceField: "applicantName" },
              { role: "RESPONDENT", name: "Synthetic Respondent", sourceField: "respondentName" },
            ];
    return {
      sourceRecordId,
      registrationNumber: "12345678",
      trademarkName: "SYNTHETIC MARK",
      documentNumber: `SYNTHETIC-${documentKind}`,
      decisionDate: "2026-01-20",
      contentHtml: "<p>Synthetic fixture only</p>",
      parties,
    };
  }
}

describe("CnipaSourceAdapter", () => {
  it("queries all three candidate libraries for a registration number and preserves exact evidence", async () => {
    const executor = new FixtureExecutor();
    const adapter = new CnipaSourceAdapter(executor, new FixtureDecoder());

    const result = await adapter.fetch({
      mode: "REGISTRATION_NUMBER",
      registrationNumber: "12345678",
    });

    expect(executor.requests.filter((request) => request.surface === "LIST")).toHaveLength(3);
    expect(executor.requests.filter((request) => request.surface === "DETAIL")).toHaveLength(3);
    expect(executor.requests[0]).toMatchObject({
      method: "POST",
      surface: "LIST",
      jsonBody: { pageIndex: 1, pageSize: 10, regNo: "12345678" },
    });
    expect(result.documents.map((item) => item.identity)).toEqual([
      "REGISTRATION_EXAMINATION:REGISTRATION_EXAMINATION-1",
      "OPPOSITION_DECISION:OPPOSITION_DECISION-1",
      "REVIEW_ADJUDICATION:REVIEW_ADJUDICATION-1",
    ]);
    expect(result.evidence).toHaveLength(6);
    expect(result.evidence.every((item) => item.content.byteLength > 0)).toBe(true);
    expect(result.coverageStatus).toBe("UNKNOWN");
    expect(result.schemaStatus).toBe("OPERATOR_SUPPLIED_UNVERIFIED");
    expect(result.documents.every((item) => item.identityStatus.includes("PROVISIONAL"))).toBe(
      true,
    );
  });

  it("keeps party-name acquisition fail-closed", async () => {
    const executor = new FixtureExecutor();
    const adapter = new CnipaSourceAdapter(executor, new FixtureDecoder());

    await expect(
      adapter.fetch({ mode: "PARTY_NAME", partyName: "Synthetic Party" }),
    ).rejects.toMatchObject({
      code: "CNIPA_SCHEMA_UNVERIFIED",
      retryable: false,
    });
    expect(executor.requests).toHaveLength(0);
  });

  it("emits the authenticated-live-verified registration date request fields", async () => {
    const requests: CnipaAuthenticatedRequest[] = [];
    const executor: CnipaAuthenticatedSessionExecutor = {
      async execute(request) {
        requests.push(request);
        return jsonResponse(request, { ok: true });
      },
    };
    const decoder = new FixtureDecoder();
    decoder.decodeList = () => ({ sourceRecordIds: [], total: 100, hasMore: false });
    const adapter = new CnipaSourceAdapter(executor, decoder, { pageSize: 100 });

    const result = await adapter.fetch({
      mode: "DATE_RANGE",
      fromDate: "2026-07-01",
      toDate: "2026-07-02",
      documentKinds: ["REGISTRATION_EXAMINATION"],
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: "POST",
      documentKind: "REGISTRATION_EXAMINATION",
      surface: "LIST",
      jsonBody: {
        regNo: "",
        tmName: "",
        applicantCnName: "",
        returnDateStart: "2026-07-01",
        returnDateEnd: "2026-07-02",
        pageIndex: 1,
        pageSize: 100,
      },
    });
    expect(result.documents).toHaveLength(0);
    expect(result.evidence).toHaveLength(1);
  });

  it("emits the authenticated-live-verified opposition date request fields", async () => {
    const requests: CnipaAuthenticatedRequest[] = [];
    const executor: CnipaAuthenticatedSessionExecutor = {
      async execute(request) {
        requests.push(request);
        return jsonResponse(request, { ok: true });
      },
    };
    const decoder = new FixtureDecoder();
    decoder.decodeList = () => ({ sourceRecordIds: [], total: 100, hasMore: false });
    const adapter = new CnipaSourceAdapter(executor, decoder, { pageSize: 100 });

    const result = await adapter.fetch({
      mode: "DATE_RANGE",
      fromDate: "2026-07-01",
      toDate: "2026-07-09",
      documentKinds: ["OPPOSITION_DECISION"],
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: "POST",
      documentKind: "OPPOSITION_DECISION",
      surface: "LIST",
      jsonBody: {
        openFlag: 1,
        regNo: "",
        tmName: "",
        objenderCnName: "",
        objeperCnName: "",
        objenderAgentName: "",
        objeperAgentName: "",
        returnDateStart: "2026-07-01",
        returnDateEnd: "2026-07-09",
        pageIndex: 1,
        pageSize: 100,
      },
    });
    expect(result.documents).toHaveLength(0);
    expect(result.evidence).toHaveLength(1);
  });

  it("emits the authenticated-live-verified review date request fields", async () => {
    const requests: CnipaAuthenticatedRequest[] = [];
    const executor: CnipaAuthenticatedSessionExecutor = {
      async execute(request) {
        requests.push(request);
        return jsonResponse(request, { ok: true });
      },
    };
    const decoder = new FixtureDecoder();
    decoder.decodeList = () => ({ sourceRecordIds: [], total: 100, hasMore: false });
    const adapter = new CnipaSourceAdapter(executor, decoder, { pageSize: 100 });

    const result = await adapter.fetch({
      mode: "DATE_RANGE",
      fromDate: "2026-07-01",
      toDate: "2026-07-01",
      documentKinds: ["REVIEW_ADJUDICATION"],
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: "POST",
      documentKind: "REVIEW_ADJUDICATION",
      surface: "LIST",
      jsonBody: {
        openFlag: 1,
        regNo: "",
        tmName: "",
        applicantName: "",
        respondentName: "",
        judgeDateStart: "2026-07-01",
        judgeDateEnd: "2026-07-01",
        pageIndex: 1,
        pageSize: 100,
      },
    });
    expect(result.documents).toHaveLength(0);
    expect(result.evidence).toHaveLength(1);
  });

  it("stops immediately for an expired authenticated session", async () => {
    const executor: CnipaAuthenticatedSessionExecutor = {
      async execute(request) {
        return jsonResponse(request, {}, { status: 401, securityState: "REAUTH_REQUIRED" });
      },
    };
    const adapter = new CnipaSourceAdapter(executor, new FixtureDecoder());

    await expect(
      adapter.fetch({ mode: "REGISTRATION_NUMBER", registrationNumber: "12345678" }),
    ).rejects.toMatchObject({ code: "CNIPA_REAUTH_REQUIRED", retryable: false });
  });

  it("retries only observed transient CNIPA business responses with bounded backoff", async () => {
    let calls = 0;
    const delays: number[] = [];
    const executor: CnipaAuthenticatedSessionExecutor = {
      async execute(request) {
        calls += 1;
        if (calls === 1) {
          return jsonResponse(request, { code: -102, msg: "divide:Rule not found!" });
        }
        if (calls === 2) {
          return jsonResponse(request, {
            code: "-107",
            msg: "divide:Can not find selector, please check your configuration!",
          });
        }
        return jsonResponse(request, { code: 0, data: { list: [], total: 0 } });
      },
    };
    const decoder = new FixtureDecoder();
    decoder.decodeList = () => ({ sourceRecordIds: [], total: 0, hasMore: false });
    const adapter = new CnipaSourceAdapter(executor, decoder, {
      pageSize: 100,
      maxTransientBusinessAttempts: 3,
      transientBusinessRetryBaseDelayMs: 10,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    });

    const result = await adapter.fetch({
      mode: "DATE_RANGE",
      fromDate: "2026-07-01",
      toDate: "2026-07-01",
      documentKinds: ["REVIEW_ADJUDICATION"],
    });

    expect(calls).toBe(3);
    expect(delays).toEqual([10, 20]);
    expect(result.evidence).toHaveLength(1);
    expect(result.documents).toHaveLength(0);
  });

  it("fails retryably after the bounded transient-business retry budget is exhausted", async () => {
    let calls = 0;
    const delays: number[] = [];
    const executor: CnipaAuthenticatedSessionExecutor = {
      async execute(request) {
        calls += 1;
        return jsonResponse(request, { code: -102, msg: "divide:Rule not found!" });
      },
    };
    const adapter = new CnipaSourceAdapter(executor, new FixtureDecoder(), {
      pageSize: 100,
      maxTransientBusinessAttempts: 3,
      transientBusinessRetryBaseDelayMs: 5,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    });

    await expect(
      adapter.fetch({
        mode: "DATE_RANGE",
        fromDate: "2026-07-01",
        toDate: "2026-07-01",
        documentKinds: ["REVIEW_ADJUDICATION"],
      }),
    ).rejects.toMatchObject({
      code: "CNIPA_SOURCE_TEMPORARY_FAILURE",
      retryable: true,
    });
    expect(calls).toBe(3);
    expect(delays).toEqual([5, 10]);
  });

  it("does not automatically replay an ambiguous browser/session execution failure", async () => {
    let calls = 0;
    const executor: CnipaAuthenticatedSessionExecutor = {
      async execute() {
        calls += 1;
        throw new Error("browser transport became unavailable");
      },
    };
    const adapter = new CnipaSourceAdapter(executor, new FixtureDecoder());

    await expect(
      adapter.fetch({ mode: "REGISTRATION_NUMBER", registrationNumber: "12345678" }),
    ).rejects.toMatchObject({ code: "CNIPA_DELIVERY_UNKNOWN", retryable: false });
    expect(calls).toBe(1);
  });

  it("rejects detail identity drift as a schema change", async () => {
    const decoder = new FixtureDecoder();
    decoder.decodeDetail = () => ({ sourceRecordId: "different-id", parties: [] });
    const adapter = new CnipaSourceAdapter(new FixtureExecutor(), decoder);

    await expect(
      adapter.fetch({
        mode: "REGISTRATION_NUMBER",
        registrationNumber: "12345678",
        documentKinds: ["REGISTRATION_EXAMINATION"],
      }),
    ).rejects.toMatchObject({ code: "CNIPA_SCHEMA_CHANGED", retryable: false });
  });

  it("bounds detail requests before a large candidate page can fan out", async () => {
    const executor = new FixtureExecutor();
    const decoder = new FixtureDecoder();
    decoder.decodeList = () => ({ sourceRecordIds: ["1", "2", "3"], hasMore: false });
    const adapter = new CnipaSourceAdapter(executor, decoder, { maxDetailRequestsPerRun: 2 });

    await expect(
      adapter.fetch({
        mode: "REGISTRATION_NUMBER",
        registrationNumber: "12345678",
        documentKinds: ["REGISTRATION_EXAMINATION"],
      }),
    ).rejects.toMatchObject({
      code: "CNIPA_DETAIL_LIMIT_EXCEEDED",
      retryable: false,
    });
    expect(executor.requests.filter((request) => request.surface === "DETAIL")).toHaveLength(2);
  });
});
