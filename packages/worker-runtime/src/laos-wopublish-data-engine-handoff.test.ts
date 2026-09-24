import { describe, expect, it } from "vitest";
import {
  buildLaosDataEngineAdmissionRequest,
  LAOS_ADMISSION_REQUEST_SCHEMA,
  LAOS_GLOBAL_ADMISSION_CONTRACT,
  LAOS_GLOBAL_ADMISSION_PATH,
  LAOS_GLOBAL_MAPPING_VERSION,
} from "./laos-wopublish-data-engine-handoff";
import { LAOS_LIST_URL, LAOS_SOURCE_ID, laosSha256 } from "./laos-wopublish-source-adapter";

const encoder = new TextEncoder();
const digest = (value: string) => laosSha256(encoder.encode(value));
const observedAt = "2026-09-24T12:00:00.000Z";
const raw = encoder.encode("<html>source evidence;jsessionid=[REDACTED]</html>");

describe("WoPublish versioned Knowledge-to-Data-Engine admission intent", () => {
  it("keeps all 50 source IDs in generic nullable fields with no legal-number inference", () => {
    const ids = Array.from({ length: 50 }, (_, index) => "LA" + String(55000 + index));
    const artifact = buildLaosDataEngineAdmissionRequest({
      observation: {
        kind: "PAGE",
        page: 1,
        ids,
        total: 73531,
        firstPageIdsSha256: digest(ids.join("\n")),
        rawSha256: "a".repeat(64),
        redactedBody: raw,
        mime: "text/html",
        observedAt,
        sourceUri: LAOS_LIST_URL,
      },
      evidenceCanonicalUri: "la-dipo://wopublish/trademarks/list/page/1/redacted-response",
      projectionCanonicalUri: "la-dipo://wopublish/trademarks/list/page/1/source-id-projection",
    });
    const request = JSON.parse(new TextDecoder().decode(artifact.content)) as {
      schemaVersion: string;
      method: string;
      path: string;
      status: string;
      payload: Record<string, unknown> & { records: Array<Record<string, unknown>> };
    };
    expect(request.schemaVersion).toBe(LAOS_ADMISSION_REQUEST_SCHEMA);
    expect(request.method).toBe("POST");
    expect(request.path).toBe(LAOS_GLOBAL_ADMISSION_PATH);
    expect(request.status).toBe("PREPARED_NOT_DISPATCHED");
    expect(request.payload).toMatchObject({
      contract_version: LAOS_GLOBAL_ADMISSION_CONTRACT,
      mapping_version: LAOS_GLOBAL_MAPPING_VERSION,
      source_owner: "MARKORBIT_KNOWLEDGE",
      jurisdiction: "LA",
      source_id: LAOS_SOURCE_ID,
      observation_kind: "LIST_PAGE",
      page_index: 1,
      evidence_sha256: laosSha256(raw),
      source_response_sha256: "a".repeat(64),
    });
    expect(request.payload.records).toHaveLength(50);
    expect(new Set(request.payload.records.map((r) => r.source_record_id)).size).toBe(50);
    expect(request.payload.records[0]).toMatchObject({
      source_record_id: "LA55000",
      application_number: null,
      registration_number: null,
      source_status_raw: null,
      normalized_status: null,
      nice_classes: [],
      source_language: "lo",
    });
    expect(artifact.parentCanonicalUris).toEqual([
      "la-dipo://wopublish/trademarks/list/page/1/source-id-projection",
    ]);
    expect(artifact.sourceUri).toBe(LAOS_LIST_URL);
  });
  it("maps a detail with preserved source language and date, but no invented registered status", () => {
    const uri = "https://online.dip.gov.la/wopublish-search/public/detail/trademarks?id=LA55159";
    const artifact = buildLaosDataEngineAdmissionRequest({
      observation: {
        kind: "DETAIL",
        id: "LA55159",
        markText: "GF",
        status: "Filed",
        filingDate: "10.09.2026",
        applicant: "Lao Applicant",
        niceClasses: [30],
        registrationNumber: null,
        logoUrl:
          "https://online.dip.gov.la/wopublish-search/service/trademarks/application/LA55159/logo?noLogo=true",
        rawSha256: "b".repeat(64),
        redactedBody: raw,
        mime: "text/html",
        observedAt,
        sourceUri: uri,
      },
      evidenceCanonicalUri: "la-dipo://wopublish/trademarks/detail/LA55159/redacted-response",
      projectionCanonicalUri: "la-dipo://wopublish/trademarks/detail/LA55159/source-projection",
    });
    const request = JSON.parse(new TextDecoder().decode(artifact.content)) as {
      payload: {
        observation_kind: string;
        page_index: number;
        records: Array<Record<string, unknown>>;
      };
    };
    expect(request.payload.observation_kind).toBe("DETAIL");
    expect(request.payload.page_index).toBe(0);
    expect(request.payload.records).toHaveLength(1);
    expect(request.payload.records[0]).toMatchObject({
      source_record_id: "LA55159",
      application_number: null,
      registration_number: null,
      mark_text: "GF",
      source_status_raw: "Filed",
      normalized_status: null,
      applicant_name: "Lao Applicant",
      nice_classes: [30],
      filing_date: "2026-09-10",
      source_language: "lo",
      source_native_fields: { filing_date_source: "10.09.2026" },
    });
  });
  it("fails closed rather than silently mapping a malformed source date", () => {
    expect(() =>
      buildLaosDataEngineAdmissionRequest({
        observation: {
          kind: "DETAIL",
          id: "LA55159",
          markText: "GF",
          status: "Filed",
          filingDate: "31.02.2026",
          applicant: "Lao Applicant",
          niceClasses: [30],
          registrationNumber: null,
          logoUrl: null,
          rawSha256: "c".repeat(64),
          redactedBody: raw,
          mime: "text/html",
          observedAt,
          sourceUri:
            "https://online.dip.gov.la/wopublish-search/public/detail/trademarks?id=LA55159",
        },
        evidenceCanonicalUri: "la-dipo://wopublish/trademarks/detail/LA55159/redacted-response",
        projectionCanonicalUri: "la-dipo://wopublish/trademarks/detail/LA55159/source-projection",
      }),
    ).toThrow(/calendar date/);
  });
});
