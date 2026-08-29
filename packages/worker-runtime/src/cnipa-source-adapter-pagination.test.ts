import { describe, expect, it } from "vitest";
import {
  CnipaSourceAdapter,
  type CnipaAuthenticatedRequest,
  type CnipaAuthenticatedSessionExecutor,
  type CnipaDecodedDetail,
  type CnipaDocumentKind,
  type CnipaJudgmentResponseDecoder,
} from "./cnipa-source-adapter";

function response(request: CnipaAuthenticatedRequest, value: unknown) {
  const query = request.query ? `?${new URLSearchParams(request.query).toString()}` : "";
  return {
    status: 200,
    sourceUri: `https://cnipa.example${request.path}${query}`,
    contentType: "application/json",
    observedAt: "2026-08-29T00:00:00.000Z",
    body: new TextEncoder().encode(JSON.stringify(value)),
    securityState: "OK" as const,
  };
}

describe("CNIPA bounded pagination", () => {
  it("continues only when decoded metadata proves another page exists", async () => {
    const requests: CnipaAuthenticatedRequest[] = [];
    const executor: CnipaAuthenticatedSessionExecutor = {
      async execute(request) {
        requests.push(request);
        return response(request, { ok: true });
      },
    };
    const decoder: CnipaJudgmentResponseDecoder = {
      decodeList(_kind, _value) {
        const page = Number(requests.at(-1)?.jsonBody?.pageIndex ?? 1);
        return page === 1
          ? { sourceRecordIds: ["one"], total: 2, hasMore: true }
          : { sourceRecordIds: ["two"], total: 2, hasMore: false };
      },
      decodeDetail(_documentKind: CnipaDocumentKind, sourceRecordId: string): CnipaDecodedDetail {
        return { sourceRecordId, parties: [] };
      },
    };
    const adapter = new CnipaSourceAdapter(executor, decoder, {
      maxPagesPerLibrary: 3,
      maxDetailRequestsPerRun: 10,
      pageSize: 10,
    });

    const result = await adapter.fetch({
      mode: "REGISTRATION_NUMBER",
      registrationNumber: "12345678",
      documentKinds: ["REGISTRATION_EXAMINATION"],
    });

    expect(
      requests
        .filter((request) => request.surface === "LIST")
        .map((request) => request.jsonBody?.pageIndex),
    ).toEqual([1, 2]);
    expect(result.documents.map((document) => document.sourceRecordId)).toEqual(["one", "two"]);
    expect(result.evidence).toHaveLength(4);
    expect(result.coverageStatus).toBe("UNKNOWN");
  });

  it("stops at the page ceiling and keeps coverage unknown", async () => {
    const requests: CnipaAuthenticatedRequest[] = [];
    const executor: CnipaAuthenticatedSessionExecutor = {
      async execute(request) {
        requests.push(request);
        return response(request, { ok: true });
      },
    };
    const decoder: CnipaJudgmentResponseDecoder = {
      decodeList() {
        const page = Number(requests.at(-1)?.jsonBody?.pageIndex ?? 1);
        return { sourceRecordIds: [`id-${page}`], total: 99, hasMore: true };
      },
      decodeDetail(_kind, sourceRecordId) {
        return { sourceRecordId, parties: [] };
      },
    };
    const adapter = new CnipaSourceAdapter(executor, decoder, {
      maxPagesPerLibrary: 2,
      maxDetailRequestsPerRun: 10,
    });

    const result = await adapter.fetch({
      mode: "REGISTRATION_NUMBER",
      registrationNumber: "12345678",
      documentKinds: ["REGISTRATION_EXAMINATION"],
    });

    expect(requests.filter((request) => request.surface === "LIST")).toHaveLength(2);
    expect(result.coverageReasons.join(" ")).toContain("2-page safety ceiling");
    expect(result.coverageStatus).toBe("UNKNOWN");
  });
});
