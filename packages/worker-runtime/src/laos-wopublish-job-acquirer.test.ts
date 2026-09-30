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
  type LaosIndexPage,
  type LaosObservation,
  type LaosWopublishSourceAdapter,
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
    rateLimitPerMinute?: number;
    respectRobots?: boolean;
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
        policy: {
          rateLimitPerMinute: opts.rateLimitPerMinute ?? 24,
          respectRobots: opts.respectRobots ?? true,
        },
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

function fullIndexPage(pageNumber: number): LaosIndexPage {
  const total = 125;
  const ids = Array.from(
    { length: pageNumber === 3 ? 25 : 50 },
    (_, i) => "LA" + String(60000 + (pageNumber - 1) * 50 + i),
  );
  const firstIds = Array.from({ length: 50 }, (_, i) => "LA" + String(60000 + i));
  const body = encoder.encode(
    pageNumber === 1 ? "<html>list</html>" : "<ajax-response>list</ajax-response>",
  );
  return {
    kind: "PAGE",
    page: pageNumber,
    total,
    ids,
    firstPageIdsSha256: laosSha256(encoder.encode(firstIds.join("\n"))),
    sourceRecordIdsSha256: laosSha256(encoder.encode(ids.join("\n"))),
    rawSha256: laosSha256(body),
    redactedBody: body,
    mime: pageNumber === 1 ? "text/html" : "text/xml",
    observedAt,
    sourceUri: LAOS_LIST_URL,
  };
}

describe("explicitly approved full Lao source index Work", () => {
  it("streams only a manual, frozen, rate-bounded 3-page source Work without DE writes", async () => {
    let sourceCalls = 0;
    const fakeStreamAdapter = {
      requestIntervalMs: 2_500,
      async *streamFullIndex(options: { maxPages: number }) {
        sourceCalls += 1;
        expect(options.maxPages).toBe(3);
        yield fullIndexPage(1);
        yield fullIndexPage(2);
        yield fullIndexPage(3);
        return { sourceTotal: 125, uniqueIds: 125 };
      },
    } as unknown as LaosWopublishSourceAdapter;
    const entry = registry(page);
    const acquirer = new LaosWopublishJobArtifactAcquirer(entry.adapters, {
      fullIndexEnabled: true,
      streamAdapter: fakeStreamAdapter,
    });
    const frozen = context({ mode: "FULL_INDEX_BASELINE", maxPages: 3 });
    expect(acquirer.isStreamingJob(frozen)).toBe(true);
    const batches = [];
    for await (const batch of acquirer.acquireBatches(frozen)) batches.push(batch);
    expect(sourceCalls).toBe(1);
    expect(entry.received()).toBeUndefined();
    expect(batches).toHaveLength(3);
    expect(batches.map((batch) => batch.map((artifact) => artifact.artifactKind))).toEqual([
      ["HTML", "JSON", "JSON", "JSON", "JSON"],
      ["XML", "JSON", "JSON", "JSON", "JSON"],
      ["XML", "JSON", "JSON", "JSON", "JSON"],
    ]);
    expect(new Set(batches.map((batch) => batch[4]?.canonicalUri)).size).toBe(3);
    expect(json(batches[2]![4]!.content)).toMatchObject({
      sourceTotal: 125,
      completedPage: 3,
      committedUniqueCount: 125,
      complete: true,
      nextPage: null,
    });
    expect(batches[2]![4]?.parentCanonicalUris).toEqual([
      batches[2]![2]?.canonicalUri,
      batches[2]![3]?.canonicalUri,
    ]);
    const finalRequest = json(batches[2]![3]!.content);
    const finalPayload = finalRequest.payload as Record<string, unknown>;
    expect(finalPayload).toMatchObject({
      contract_version: "GLOBAL_TRADEMARK_STRUCTURED_ADMISSION_V2",
      observation_kind: "FULL_INDEX_PAGE",
      page_index: 3,
      source_total: 125,
    });
    expect(finalPayload.records).toHaveLength(25);
    expect(batches[2]![2]?.parentCanonicalUris).toEqual([batches[2]![3]?.canonicalUri]);
  });
  it("keeps full source mode OFF by default and forbids the pilot bulk path", async () => {
    const entry = registry(page);
    const frozen = context({ mode: "FULL_INDEX_BASELINE", maxPages: 3 });
    const off = new LaosWopublishJobArtifactAcquirer(entry.adapters);
    expect(off.isStreamingJob(frozen)).toBe(false);
    await expect(off.acquire(frozen)).rejects.toMatchObject({
      code: "LA_FULL_INDEX_STREAMING_REQUIRED",
    });
    const consume = async () => {
      for await (const batch of off.acquireBatches(frozen)) {
        throw new Error("Disabled stream emitted " + batch.length + " artifacts");
      }
    };
    await expect(consume()).rejects.toMatchObject({ code: "LA_JOB_CONFIG_INVALID" });
    expect(entry.received()).toBeUndefined();
  });
  it.each([
    {
      name: "unreviewed CRON plan",
      config: { mode: "FULL_INDEX_BASELINE", maxPages: 3 },
      opts: { schedule: "CRON" },
    },
    {
      name: "forged resume",
      config: { mode: "FULL_INDEX_BASELINE", maxPages: 3, resume: { page: 3 } },
      opts: {},
    },
    { name: "unbounded pages", config: { mode: "FULL_INDEX_BASELINE", maxPages: 2001 }, opts: {} },
    {
      name: "robots disabled",
      config: { mode: "FULL_INDEX_BASELINE", maxPages: 3 },
      opts: { respectRobots: false },
    },
    {
      name: "rate over 24 per minute",
      config: { mode: "FULL_INDEX_BASELINE", maxPages: 3 },
      opts: { rateLimitPerMinute: 25 },
    },
  ])("refuses $name before any source request", async ({ config, opts }) => {
    let sourceCalls = 0;
    const adapter = {
      requestIntervalMs: 2_500,
      async *streamFullIndex() {
        sourceCalls += 1;
        yield fullIndexPage(1);
      },
    } as unknown as LaosWopublishSourceAdapter;
    const acquirer = new LaosWopublishJobArtifactAcquirer(registry(page).adapters, {
      fullIndexEnabled: true,
      streamAdapter: adapter,
    });
    const consume = async () => {
      for await (const batch of acquirer.acquireBatches(context(config, opts))) {
        throw new Error("Rejected plan emitted " + batch.length + " artifacts");
      }
    };
    await expect(consume()).rejects.toMatchObject({ code: "LA_JOB_CONFIG_INVALID" });
    expect(sourceCalls).toBe(0);
  });
  it("refuses source requests faster than the approved plan even when enabled", async () => {
    let sourceCalls = 0;
    const adapter = {
      requestIntervalMs: 2_500,
      async *streamFullIndex() {
        sourceCalls += 1;
        yield fullIndexPage(1);
      },
    } as unknown as LaosWopublishSourceAdapter;
    const acquirer = new LaosWopublishJobArtifactAcquirer(registry(page).adapters, {
      fullIndexEnabled: true,
      streamAdapter: adapter,
    });
    const consume = async () => {
      for await (const batch of acquirer.acquireBatches(
        context({ mode: "FULL_INDEX_BASELINE", maxPages: 3 }, { rateLimitPerMinute: 10 }),
      )) {
        throw new Error("Overspeed stream emitted " + batch.length + " artifacts");
      }
    };
    await expect(consume()).rejects.toMatchObject({ code: "LA_JOB_CONFIG_INVALID" });
    expect(sourceCalls).toBe(0);
  });
});
