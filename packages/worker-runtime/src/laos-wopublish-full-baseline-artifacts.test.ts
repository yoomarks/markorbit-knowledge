import { describe, expect, it } from "vitest";
import { buildLaosFullIndexPageArtifacts } from "./laos-wopublish-full-baseline-artifacts";
import { LAOS_LIST_URL, laosSha256, type LaosIndexPage } from "./laos-wopublish-source-adapter";
import {
  GLOBAL_TRADEMARK_FULL_BASELINE_CONTRACT,
  GLOBAL_TRADEMARK_FULL_BASELINE_REQUEST_SCHEMA,
} from "./global-trademark-fact-admission-job-acquirer";

const encoder = new TextEncoder();
const decode = (bytes: Uint8Array) =>
  JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
const digest = (ids: readonly string[]) => laosSha256(encoder.encode(ids.join("\n")));
function page(index: number, total = 73531): LaosIndexPage {
  const count = Math.min(50, total - (index - 1) * 50);
  const ids = Array.from({ length: count }, (_, i) => "LA" + String(500000 + (index - 1) * 50 + i));
  const body = encoder.encode(
    index === 1 ? "<html>Wicket list</html>" : "<ajax-response>Wicket list</ajax-response>",
  );
  const firstIds = Array.from({ length: 50 }, (_, i) => "LA" + String(500000 + i));
  return {
    kind: "PAGE",
    page: index,
    total,
    ids,
    firstPageIdsSha256: digest(firstIds),
    sourceRecordIdsSha256: digest(ids),
    rawSha256: "a".repeat(64),
    redactedBody: body,
    mime: index === 1 ? "text/html;charset=UTF-8" : "text/xml;charset=UTF-8",
    observedAt: "2026-09-29T00:00:00.000Z",
    sourceUri: LAOS_LIST_URL,
  };
}

describe("full index source page → Knowledge durable V2 admission intent", () => {
  it("produces page 1471 last 31 true source IDs with typed immutable lineage", () => {
    const artifacts = buildLaosFullIndexPageArtifacts(page(1471));
    expect(artifacts).toHaveLength(4);
    expect(artifacts.map((item) => item.artifactKind)).toEqual(["XML", "JSON", "JSON", "JSON"]);
    expect(artifacts[0]?.canonicalUri).toBe(
      "la-dipo://wopublish/trademarks/list/page/1471/redacted-response",
    );
    const projection = decode(artifacts[1]!.content);
    const checkpoint = decode(artifacts[2]!.content);
    const request = decode(artifacts[3]!.content);
    const payload = request.payload as Record<string, unknown>;
    const records = payload.records as Array<Record<string, unknown>>;
    expect(projection.sourceTotal).toBe(73531);
    expect(projection.sourceRecordIds).toHaveLength(31);
    expect(checkpoint).toMatchObject({
      completedPage: 1471,
      sourceTotal: 73531,
      nextPage: null,
      fullBaselineCompleted: false,
    });
    expect(request).toMatchObject({
      schemaVersion: GLOBAL_TRADEMARK_FULL_BASELINE_REQUEST_SCHEMA,
      method: "POST",
      status: "PREPARED_NOT_DISPATCHED",
      fullCollectionAuthorized: true,
    });
    expect(payload).toMatchObject({
      contract_version: GLOBAL_TRADEMARK_FULL_BASELINE_CONTRACT,
      observation_kind: "FULL_INDEX_PAGE",
      page_index: 1471,
      source_total: 73531,
      evidence_sha256: laosSha256(artifacts[0]!.content),
    });
    expect(records).toHaveLength(31);
    expect(records[0]?.source_record_id).toBe("LA573500");
    expect(
      records.every(
        (r) =>
          r.application_number === null &&
          r.registration_number === null &&
          r.normalized_status === null,
      ),
    ).toBe(true);
    expect(artifacts[1]?.parentCanonicalUris).toEqual([artifacts[0]?.canonicalUri]);
    expect(artifacts[2]?.parentCanonicalUris).toEqual([artifacts[1]?.canonicalUri]);
    expect(artifacts[3]?.parentCanonicalUris).toEqual([artifacts[1]?.canonicalUri]);
  });
  it("retains exact first-page ID digest and a resume page index without leaking Wicket cookies", () => {
    const first = buildLaosFullIndexPageArtifacts(page(1));
    const projection = decode(first[1]!.content);
    const checkpoint = decode(first[2]!.content);
    expect(first[0]?.artifactKind).toBe("HTML");
    expect(projection.sourceRecordIdsSha256).toBe(projection.firstPageIdsSha256);
    expect(checkpoint).toMatchObject({
      completedPage: 1,
      nextPage: 2,
      fullBaselineCompleted: false,
      lastSourceRecordId: "LA500049",
    });
    expect(new TextDecoder().decode(first[2]!.content)).not.toMatch(/jsessionid|psusr|cookie/iu);
  });

  it("refuses corrupt count, overlapping IDs, arbitrary URL, secret bytes, and digest drift", () => {
    const original = page(1471);
    const cases: LaosIndexPage[] = [
      { ...original, ids: original.ids.slice(0, -1) },
      { ...original, ids: original.ids.map((id, index) => (index === 1 ? original.ids[0]! : id)) },
      { ...original, sourceUri: "https://example.test/offline?0" },
      {
        ...original,
        redactedBody: encoder.encode("<ajax-response>;jsessionid=unsafe</ajax-response>"),
      },
      { ...original, sourceRecordIdsSha256: "0".repeat(64) },
      { ...original, page: 2001 },
      { ...original, total: 100001 },
      { ...original, mime: "text/html" },
    ];
    for (const invalid of cases) {
      expect(() => buildLaosFullIndexPageArtifacts(invalid)).toThrowError();
    }
  });
});
