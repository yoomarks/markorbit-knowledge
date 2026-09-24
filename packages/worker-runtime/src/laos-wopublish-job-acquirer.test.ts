import { describe, expect, it } from "vitest";
import type { ArtifactBackedExecutionContext } from "./artifact-backed-collection-executor";
import { LAOS_JOB_EXECUTOR, LaosWopublishJobArtifactAcquirer } from "./laos-wopublish-job-acquirer";
import {
  LAOS_CONNECTOR_ID,
  LAOS_CONNECTOR_VERSION,
  LAOS_LIST_URL,
  LAOS_SOURCE_ID,
  LAOS_SOURCE_METADATA,
  laosSha256,
  type LaosObservation,
} from "./laos-wopublish-source-adapter";
import { SourceAdapterRegistry } from "./source-adapter-registry";

const encoder = new TextEncoder();
const sourceIds = Array.from({ length: 50 }, (_, i) => "LA" + (55000 + i));
const prefix = laosSha256(encoder.encode(sourceIds.join("\n")));
const observedAt = "2026-09-24T00:00:00.000Z";
const page = {
  kind: "PAGE" as const,
  page: 1 as const,
  ids: sourceIds,
  total: 73531,
  firstPageIdsSha256: prefix,
  rawSha256: "b".repeat(64),
  redactedBody: encoder.encode(
    '<a href="./detail/trademarks;jsessionid=[REDACTED]?id=LA55000">x</a>',
  ),
  mime: "text/html;charset=UTF-8",
  observedAt,
  sourceUri: LAOS_LIST_URL,
};
const detail = {
  kind: "DETAIL" as const,
  id: "LA55159",
  markText: "GF",
  status: "Filed",
  filingDate: "10.09.2026",
  applicant: "Lao Applicant",
  niceClasses: [30],
  registrationNumber: null,
  logoUrl:
    "https://online.dip.gov.la/wopublish-search/service/trademarks/application/LA55159/logo?noLogo=true",
  logoBytes: encoder.encode("image fixture"),
  logoMime: "image/png",
  rawSha256: "c".repeat(64),
  redactedBody: encoder.encode("<html>detail evidence</html>"),
  mime: "text/html;charset=UTF-8",
  observedAt,
  sourceUri: "https://online.dip.gov.la/wopublish-search/public/detail/trademarks?id=LA55159",
};
function registry(item: LaosObservation) {
  const adapters = new SourceAdapterRegistry();
  let received: unknown;
  adapters.register({
    metadata: LAOS_SOURCE_METADATA,
    collect: async (input) => {
      received = input;
      return { sourceId: LAOS_SOURCE_ID, items: [item] };
    },
  });
  return { adapters, received: () => received };
}
function context(
  config: Record<string, unknown>,
  opts: {
    schedule?: string;
    canonicalUri?: string;
    connectorId?: string;
    sourceType?: string;
    jobType?: string;
    kinds?: string[];
  } = {},
): ArtifactBackedExecutionContext {
  return {
    workerId: "wrk_fixture",
    leaseToken: "fixture",
    lease: { id: "lease_fixture" },
    job: {
      jobType: opts.jobType ?? "WEB_CRAWL",
      connector: {
        connectorId: opts.connectorId ?? LAOS_CONNECTOR_ID,
        version: LAOS_CONNECTOR_VERSION,
      },
      sourceSnapshot: {
        sourceType: opts.sourceType ?? "WEB",
        canonicalUri: opts.canonicalUri ?? LAOS_LIST_URL,
        connector: {
          connectorId: opts.connectorId ?? LAOS_CONNECTOR_ID,
          version: LAOS_CONNECTOR_VERSION,
        },
        connectorConfig: config,
      },
      planSnapshot: {
        schedule: { mode: opts.schedule ?? "MANUAL" },
        output: { artifactKinds: opts.kinds ?? ["HTML", "XML", "JSON", "IMAGE"] },
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}
const json = (bytes: Uint8Array) =>
  JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
describe("Laos WoPublish Knowledge-only governed Worker adapter", () => {
  it("uses the one source registry, authorized executor and existing RawArtifact envelope", async () => {
    const entry = registry(page);
    const acquirer = new LaosWopublishJobArtifactAcquirer(entry.adapters);
    expect(acquirer.executor).toEqual(LAOS_JOB_EXECUTOR);
    const artifacts = await acquirer.acquire(context({ mode: "PILOT_PAGE", page: 1 }));
    expect(artifacts.map((item) => item.artifactKind)).toEqual(["HTML", "JSON", "JSON", "JSON"]);
    expect(artifacts[0]?.canonicalUri).toBe(
      "la-dipo://wopublish/trademarks/list/page/1/redacted-response",
    );
    expect(artifacts[1]?.parentCanonicalUris).toEqual([artifacts[0]?.canonicalUri]);
    const payload = json(artifacts[1]!.content);
    expect(payload.sourceRecordIds).toEqual(sourceIds);
    expect(payload.sourceResponseSha256).toBe("b".repeat(64));
    expect(payload.sourceRecordIdKind).toBe("WOPUBLISH_RECORD_ID_NOT_LEGAL_REGISTRATION_NUMBER");
    const checkpoint = json(artifacts[2]!.content);
    expect(checkpoint).toMatchObject({
      completedPage: 1,
      firstPageIdsSha256: prefix,
      expectedSourceTotal: 73531,
      nextCursor: "2",
      fullCollectionAuthorized: false,
    });
    expect(JSON.stringify(artifacts)).not.toContain("SECRETSESSION");
    expect(json(artifacts[3]!.content)).toMatchObject({
      method: "POST",
      status: "PREPARED_NOT_DISPATCHED",
      payload: { jurisdiction: "LA", observation_kind: "LIST_PAGE", page_index: 1 },
    });
    const requestPayload = json(artifacts[3]!.content).payload as {
      records: Record<string, unknown>[];
    };
    expect(requestPayload.records).toHaveLength(50);
    expect(requestPayload.records[0]).toMatchObject({
      source_record_id: "LA55000",
      application_number: null,
      registration_number: null,
    });
    expect(entry.received()).toMatchObject({
      sourceId: LAOS_SOURCE_ID,
      cursor: "1",
      params: { mode: "PAGE" },
    });
  });
  it("routes page 2 only with an exact first-page checkpoint and no duplicate source IDs", async () => {
    const entry = registry({
      ...page,
      page: 2,
      ids: sourceIds.map((id) => id + "0"),
      mime: "text/xml",
    });
    const result = await new LaosWopublishJobArtifactAcquirer(entry.adapters).acquire(
      context({
        mode: "PILOT_PAGE",
        page: 2,
        expectedFirstPageIdsSha256: prefix,
        expectedSourceTotal: 73531,
      }),
    );
    expect(result.map((item) => item.artifactKind)).toEqual(["XML", "JSON", "JSON", "JSON"]);
    expect(json(result[2]!.content).nextCursor).toBeNull();
    expect(entry.received()).toMatchObject({
      cursor: "2",
      params: { expectedFirstPageIdsSha256: prefix, expectedSourceTotal: "73531" },
    });
  });
  it("renders exact detail source bytes + projection + logo as linked existing artifact types", async () => {
    const artifacts = await new LaosWopublishJobArtifactAcquirer(registry(detail).adapters).acquire(
      context({ mode: "DETAIL_REFRESH", sourceRecordId: "LA55159" }),
    );
    expect(artifacts.map((item) => item.artifactKind)).toEqual(["HTML", "JSON", "IMAGE", "JSON"]);
    expect(artifacts[2]?.parentCanonicalUris).toEqual([artifacts[0]?.canonicalUri]);
    expect(json(artifacts[3]!.content).payload).toMatchObject({
      observation_kind: "DETAIL",
      page_index: 0,
      records: [
        {
          source_record_id: "LA55159",
          mark_text: "GF",
          source_status_raw: "Filed",
          filing_date: "2026-09-10",
          application_number: null,
          registration_number: null,
        },
      ],
    });
    expect(json(artifacts[1]!.content)).toMatchObject({
      sourceRecordId: "LA55159",
      registrationNumber: null,
      niceClasses: [30],
      evidenceStatus: "UNVERIFIED_OFFICIAL_SOURCE_OBSERVATION",
    });
  });
  it.each([
    { name: "full page", config: { mode: "PILOT_PAGE", page: 3 } },
    { name: "missing resume proof", config: { mode: "PILOT_PAGE", page: 2 } },
    { name: "bulk job", config: { mode: "BULK", page: 1 } },
    { name: "multiple details", config: { mode: "DETAIL_REFRESH", sourceRecordIds: ["LA55159"] } },
  ])("rejects $name before source network", async ({ config }) => {
    const entry = registry(page);
    await expect(
      new LaosWopublishJobArtifactAcquirer(entry.adapters).acquire(context(config)),
    ).rejects.toMatchObject({ code: "LA_JOB_CONFIG_INVALID" });
    expect(entry.received()).toBeUndefined();
  });
  it.each([
    { name: "cron schedule", opts: { schedule: "CRON" } },
    {
      name: "cross-service target",
      opts: { canonicalUri: "https://not-the-official-source.example" },
    },
    { name: "wrong connector", opts: { connectorId: "api-worker" } },
    { name: "wrong source type", opts: { sourceType: "API" } },
    { name: "wrong job type", opts: { jobType: "API_COLLECTION" } },
  ])("fails closed for $name", async ({ opts }) => {
    const entry = registry(page);
    await expect(
      new LaosWopublishJobArtifactAcquirer(entry.adapters).acquire(
        context({ mode: "PILOT_PAGE", page: 1 }, opts),
      ),
    ).rejects.toMatchObject({ code: "LA_JOB_CONFIG_INVALID" });
    expect(entry.received()).toBeUndefined();
  });
  it("requires all explicit evidence artifact kinds to be authorized by the CollectionPlan", async () => {
    const entry = registry(page);
    await expect(
      new LaosWopublishJobArtifactAcquirer(entry.adapters).acquire(
        context({ mode: "PILOT_PAGE", page: 1 }, { kinds: ["HTML"] }),
      ),
    ).rejects.toMatchObject({ code: "LA_JOB_CONFIG_INVALID" });
  });
  it("does not register or persist any Data Engine connector, table or external source", () => {
    expect(LAOS_CONNECTOR_ID).toBe("laos-wopublish-trademarks");
    expect(LAOS_SOURCE_METADATA.providerKind).toBe("TRADEMARK_OFFICE");
    expect(LAOS_SOURCE_METADATA.country).toBe("LA");
  });
});
