import { describe, expect, it } from "vitest";
import {
  buildLaosFullDetailArtifacts,
  LAOS_FULL_DETAIL_PROJECTION_SCHEMA,
} from "./laos-wopublish-full-detail-artifacts";
import {
  GLOBAL_TRADEMARK_FULL_BASELINE_CONTRACT,
  GLOBAL_TRADEMARK_FULL_BASELINE_REQUEST_SCHEMA,
} from "./global-trademark-fact-admission-job-acquirer";
import { laosSha256, type LaosDetail } from "./laos-wopublish-source-adapter";

const encoder = new TextEncoder();
function detail(withLogo = false): LaosDetail {
  const body = encoder.encode("<html>detail;jsessionid=[REDACTED]</html>");
  return {
    kind: "DETAIL",
    id: "LA55159",
    markText: "GF",
    status: "Filed",
    filingDate: "10.09.2026",
    applicant: "Lao Applicant",
    niceClasses: [30],
    registrationNumber: null,
    logoUrl: withLogo
      ? "https://online.dip.gov.la/wopublish-search/service/trademarks/application/LA55159/logo?noLogo=false"
      : null,
    ...(withLogo ? { logoBytes: encoder.encode("logo-bytes"), logoMime: "image/png" } : {}),
    rawSha256: laosSha256(body),
    redactedBody: body,
    mime: "text/html;charset=UTF-8",
    observedAt: "2026-09-29T14:00:00.000Z",
    sourceUri: "https://online.dip.gov.la/wopublish-search/public/detail/trademarks?id=LA55159",
  };
}

describe("Lao V2 full-detail evidence mapper", () => {
  it("reuses the accepted detail mapping but upgrades only the request envelope", () => {
    const artifacts = buildLaosFullDetailArtifacts(detail());
    expect(artifacts).toHaveLength(3);
    const projection = JSON.parse(new TextDecoder().decode(artifacts[1]!.content));
    expect(projection).toMatchObject({
      schemaVersion: LAOS_FULL_DETAIL_PROJECTION_SCHEMA,
      sourceRecordId: "LA55159",
      registrationNumber: null,
      status: "Filed",
      filingDate: "10.09.2026",
      niceClasses: [30],
    });
    const request = JSON.parse(new TextDecoder().decode(artifacts[2]!.content));
    expect(request).toMatchObject({
      schemaVersion: GLOBAL_TRADEMARK_FULL_BASELINE_REQUEST_SCHEMA,
      fullCollectionAuthorized: true,
      payload: {
        contract_version: GLOBAL_TRADEMARK_FULL_BASELINE_CONTRACT,
        observation_kind: "FULL_DETAIL",
        page_index: 0,
      },
    });
    expect(request.payload).not.toHaveProperty("source_total");
    expect(request.payload.records).toHaveLength(1);
    expect(request.payload.records[0]).toMatchObject({
      source_record_id: "LA55159",
      application_number: null,
      registration_number: null,
      source_status_raw: "Filed",
      normalized_status: null,
      filing_date: "2026-09-10",
    });
    expect(artifacts[2]!.parentCanonicalUris).toEqual([
      "la-dipo://wopublish/trademarks/detail/LA55159/source-projection",
    ]);
  });
  it("preserves logo bytes as separate immutable child evidence", () => {
    const artifacts = buildLaosFullDetailArtifacts(detail(true));
    expect(artifacts).toHaveLength(4);
    const logo = artifacts[2]!;
    expect(logo.artifactKind).toBe("IMAGE");
    expect(logo.canonicalUri).toBe("la-dipo://wopublish/trademarks/detail/LA55159/logo");
    expect(logo.parentCanonicalUris).toEqual([
      "la-dipo://wopublish/trademarks/detail/LA55159/redacted-response",
    ]);
    const request = JSON.parse(new TextDecoder().decode(artifacts[3]!.content));
    expect(request.payload.records[0].logo_url).toContain("/LA55159/logo");
  });

  it("rejects source/id mismatch, session-bearing evidence and malformed source dates", () => {
    expect(() =>
      buildLaosFullDetailArtifacts({
        ...detail(),
        sourceUri: "https://online.dip.gov.la/wopublish-search/public/detail/trademarks?id=LA55160",
      }),
    ).toThrow(/official/);
    const secret = encoder.encode("<html>;jsessionid=SECRET</html>");
    expect(() =>
      buildLaosFullDetailArtifacts({
        ...detail(),
        redactedBody: secret,
        rawSha256: laosSha256(secret),
      }),
    ).toThrow(/Session-bearing/);
    expect(() =>
      buildLaosFullDetailArtifacts({
        ...detail(),
        filingDate: "31.02.2026",
      }),
    ).toThrow(/calendar date/);
  });

  it("rejects cross-record logo URLs and inconsistent logo evidence", () => {
    expect(() =>
      buildLaosFullDetailArtifacts({
        ...detail(true),
        logoUrl:
          "https://online.dip.gov.la/wopublish-search/service/trademarks/application/LA55160/logo",
      }),
    ).toThrow(/matching official/);
    expect(() =>
      buildLaosFullDetailArtifacts({
        ...detail(),
        logoMime: "image/png",
      }),
    ).toThrow(/without captured/);
  });
});
