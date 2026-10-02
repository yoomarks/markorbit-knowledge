import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  AcquiredCollectionArtifact,
  ArtifactBackedExecutionContext,
} from "./artifact-backed-collection-executor";
import { FactAdmissionHttpError, type FactAdmissionClient } from "./fact-admission-http-client";
import {
  GLOBAL_TRADEMARK_ADMISSION_CONTRACT,
  GLOBAL_TRADEMARK_FULL_BASELINE_CONTRACT,
  GLOBAL_TRADEMARK_FULL_BASELINE_REQUEST_SCHEMA,
  GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_ID,
  GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
  GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_SOURCE,
  GlobalTrademarkFactAdmissionJobAcquirer,
  globalTrademarkFactAdmissionJobRuntimeDescriptor,
} from "./global-trademark-fact-admission-job-acquirer";

const ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ARTIFACT_ID_2 = "art_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const encoder = new TextEncoder();
function requestArtifact(): AcquiredCollectionArtifact {
  return {
    artifactKind: "JSON",
    mimeType: "application/json",
    originalName: "request.json",
    sourceUri: "https://online.dip.gov.la/wopublish-search/public/trademarks?0",
    canonicalUri: "la-dipo://wopublish/trademarks/list/page/1/fact-admission-request",
    content: encoder.encode(
      JSON.stringify({
        schemaVersion: "GLOBAL_TRADEMARK_FACT_ADMISSION_REQUEST_V1",
        method: "POST",
        path: "/api/admin/v2/fact-admissions/global/observations",
        status: "PREPARED_NOT_DISPATCHED",
        fullCollectionAuthorized: false,
        evidenceCanonicalUri: "la-dipo://wopublish/trademarks/list/page/1/redacted-response",
        payload: {
          contract_version: GLOBAL_TRADEMARK_ADMISSION_CONTRACT,
          mapping_version: "GLOBAL_TRADEMARK_NORMALIZED_V1",
          source_owner: "MARKORBIT_KNOWLEDGE",
          jurisdiction: "LA",
          source_id: "LA_DIPO_WOPUBLISH_TRADEMARKS",
          observation_kind: "LIST_PAGE",
          page_index: 1,
          source_uri: "https://online.dip.gov.la/wopublish-search/public/trademarks?0",
          evidence_canonical_uri: "la-dipo://wopublish/trademarks/list/page/1/redacted-response",
          evidence_sha256: "a".repeat(64),
          source_response_sha256: "b".repeat(64),
          observed_at: "2026-09-24T12:00:00.000Z",
          records: [{ source_record_id: "LA55159" }],
        },
      }),
    ),
  };
}
function ref(artifact: AcquiredCollectionArtifact, artifactId = ARTIFACT_ID) {
  return {
    artifactId,
    canonicalUri: artifact.canonicalUri!,
    sha256: createHash("sha256").update(artifact.content).digest("hex"),
    sizeBytes: artifact.content.byteLength,
  };
}
function context(reference: ReturnType<typeof ref>): ArtifactBackedExecutionContext {
  const connector = {
    connectorId: GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_ID,
    version: GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
  };
  return {
    workerId: "wrk_fixture",
    leaseToken: "lease-token",
    lease: { id: "lse_fixture" },
    job: {
      connector,
      sourceSnapshot: {
        sourceType: "DATABASE",
        connector,
        connectorConfig: {
          intent: "PUBLISH_DURABLE_REQUEST",
          requestArtifactRef: reference,
        },
        canonicalUri: GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_SOURCE,
      },
      planSnapshot: { output: { artifactKinds: ["JSON"] } },
    },
  } as unknown as ArtifactBackedExecutionContext;
}
class FakeClient implements FactAdmissionClient {
  readonly calls: Array<{ path: string; payload: object }> = [];
  constructor(private readonly response: Record<string, unknown> | Error) {}
  async post<TPayload extends object>(path: string, payload: TPayload) {
    this.calls.push({ path, payload });
    if (this.response instanceof Error) throw this.response;
    return this.response;
  }
}
const receipt = {
  contract_version: GLOBAL_TRADEMARK_ADMISSION_CONTRACT,
  outcome: "BOUNDED_OBSERVATIONS_ADMITTED",
  jurisdiction: "LA",
  source_id: "LA_DIPO_WOPUBLISH_TRADEMARKS",
  observation_kind: "LIST_PAGE",
  page_index: 1,
  source_response_sha256: "b".repeat(64),
  evidence_sha256: "a".repeat(64),
  storage_placement: "hot_global",
  current_state_verified: false,
  record_count: 1,
  inserted_count: 1,
  replayed: false,
};

describe("GlobalTrademarkFactAdmissionJobAcquirer", () => {
  it("publishes only verified durable Knowledge bytes and persists the hot_global receipt lineage", async () => {
    const request = requestArtifact();
    const reads: string[] = [];
    const client = new FakeClient(receipt);
    const artifacts = await new GlobalTrademarkFactAdmissionJobAcquirer({
      reader: {
        async read(id) {
          reads.push(id);
          return request;
        },
      },
      client,
      clock: () => "2026-09-24T12:01:00.000Z",
    }).acquire(context(ref(request)));

    expect(reads).toEqual([ARTIFACT_ID]);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.path).toBe("/api/admin/v2/fact-admissions/global/observations");
    expect(client.calls[0]?.payload).toMatchObject({
      contract_version: GLOBAL_TRADEMARK_ADMISSION_CONTRACT,
      source_owner: "MARKORBIT_KNOWLEDGE",
      jurisdiction: "LA",
    });
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.parentArtifactIds).toEqual([ARTIFACT_ID]);
    const body = JSON.parse(new TextDecoder().decode(artifacts[0]!.content));
    expect(body.receipt).toEqual(receipt);
    expect(body.requestArtifactId).toBe(ARTIFACT_ID);
  });

  it("fails before Data Engine access when durable bytes differ from the frozen reference", async () => {
    const request = requestArtifact();
    const altered = { ...request, content: encoder.encode("{}") };
    const client = new FakeClient(receipt);
    await expect(
      new GlobalTrademarkFactAdmissionJobAcquirer({
        reader: { read: async () => altered },
        client,
      }).acquire(context(ref(request))),
    ).rejects.toMatchObject({
      code: "GLOBAL_TRADEMARK_DURABLE_REQUEST_MISMATCH",
      retryable: false,
    });
    expect(client.calls).toEqual([]);
  });

  it("rejects endpoint injection and invalid Data Engine currentness receipts", async () => {
    const request = requestArtifact();
    const parsed = JSON.parse(new TextDecoder().decode(request.content));
    parsed.path = "/api/admin/v2/fact-admissions/cn/trademark-gazette/chunks";
    const injected = { ...request, content: encoder.encode(JSON.stringify(parsed)) };
    const client = new FakeClient(receipt);
    await expect(
      new GlobalTrademarkFactAdmissionJobAcquirer({
        reader: { read: async () => injected },
        client,
      }).acquire(context(ref(injected))),
    ).rejects.toMatchObject({
      code: "GLOBAL_TRADEMARK_PUBLISH_JOB_CONFIG_INVALID",
    });
    const badClient = new FakeClient({ ...receipt, current_state_verified: true });
    await expect(
      new GlobalTrademarkFactAdmissionJobAcquirer({
        reader: { read: async () => request },
        client: badClient,
      }).acquire(context(ref(request))),
    ).rejects.toMatchObject({
      code: "GLOBAL_TRADEMARK_ADMISSION_RECEIPT_INVALID",
    });
  });

  it("preserves retryability from authenticated Data Engine admission", async () => {
    const request = requestArtifact();
    const client = new FakeClient(
      new FactAdmissionHttpError(503, "GLOBAL_TRADEMARK_HOT_GLOBAL_UNAVAILABLE", "not ready", true),
    );
    await expect(
      new GlobalTrademarkFactAdmissionJobAcquirer({
        reader: { read: async () => request },
        client,
      }).acquire(context(ref(request))),
    ).rejects.toMatchObject({
      code: "GLOBAL_TRADEMARK_HOT_GLOBAL_UNAVAILABLE",
      retryable: true,
    });
  });

  it("does not claim source-network or current-state authority", () => {
    expect(globalTrademarkFactAdmissionJobRuntimeDescriptor()).toMatchObject({
      sourceType: "DATABASE",
      inputMustBeDurableRawArtifact: true,
      sourceNetworkAccessRequired: false,
      factAdmissionOnly: true,
      hotGlobalReceiptRequired: true,
      currentStateAuthority: false,
    });
  });
});

function fullIndexRequest(): AcquiredCollectionArtifact {
  const pilot = requestArtifact();
  const parsed = JSON.parse(new TextDecoder().decode(pilot.content));
  parsed.schemaVersion = GLOBAL_TRADEMARK_FULL_BASELINE_REQUEST_SCHEMA;
  parsed.fullCollectionAuthorized = true;
  parsed.payload.contract_version = GLOBAL_TRADEMARK_FULL_BASELINE_CONTRACT;
  parsed.payload.observation_kind = "FULL_INDEX_PAGE";
  parsed.payload.source_total = 73531;
  parsed.payload.records = Array.from({ length: 50 }, (_, index) => ({
    source_record_id: "LA" + String(55100 + index),
    application_number: null,
    registration_number: null,
    normalized_status: null,
  }));
  return { ...pilot, content: encoder.encode(JSON.stringify(parsed)) };
}
function manualContext(reference: ReturnType<typeof ref>): ArtifactBackedExecutionContext {
  const original = context(reference);
  return {
    ...original,
    job: {
      ...original.job,
      planSnapshot: {
        ...original.job.planSnapshot,
        schedule: { mode: "MANUAL" },
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}
const fullReceipt = {
  ...receipt,
  contract_version: GLOBAL_TRADEMARK_FULL_BASELINE_CONTRACT,
  observation_kind: "FULL_INDEX_PAGE",
  source_total: 73531,
  record_count: 50,
  inserted_count: 50,
};

describe("default-off V2 full-index fact admission publisher", () => {
  it("rejects an authentic durable full request before any DE access when switch is off", async () => {
    const request = fullIndexRequest();
    const client = new FakeClient(fullReceipt);
    await expect(
      new GlobalTrademarkFactAdmissionJobAcquirer({
        reader: { read: async () => request },
        client,
      }).acquire(manualContext(ref(request))),
    ).rejects.toMatchObject({ code: "GLOBAL_TRADEMARK_PUBLISH_JOB_CONFIG_INVALID" });
    expect(client.calls).toEqual([]);
  });
  it("requires an immutable manual Work as well as an explicit worker switch", async () => {
    const request = fullIndexRequest();
    const client = new FakeClient(fullReceipt);
    await expect(
      new GlobalTrademarkFactAdmissionJobAcquirer({
        reader: { read: async () => request },
        client,
        fullBaselineEnabled: true,
      }).acquire(context(ref(request))),
    ).rejects.toMatchObject({ code: "GLOBAL_TRADEMARK_PUBLISH_JOB_CONFIG_INVALID" });
    expect(client.calls).toEqual([]);
  });
  it("only forwards exact durable V2 source evidence and validates source-total receipt", async () => {
    const request = fullIndexRequest();
    const client = new FakeClient(fullReceipt);
    const producer = new GlobalTrademarkFactAdmissionJobAcquirer({
      reader: { read: async () => request },
      client,
      fullBaselineEnabled: true,
    });
    const output = await producer.acquire(manualContext(ref(request)));
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.payload).toMatchObject({
      contract_version: GLOBAL_TRADEMARK_FULL_BASELINE_CONTRACT,
      source_total: 73531,
      page_index: 1,
    });
    expect(output[0]?.parentArtifactIds).toEqual([ARTIFACT_ID]);
    const badClient = new FakeClient({ ...fullReceipt, source_total: 73530 });
    await expect(
      new GlobalTrademarkFactAdmissionJobAcquirer({
        reader: { read: async () => request },
        client: badClient,
        fullBaselineEnabled: true,
      }).acquire(manualContext(ref(request))),
    ).rejects.toMatchObject({ code: "GLOBAL_TRADEMARK_ADMISSION_RECEIPT_INVALID" });
  });
  it("rejects forged V2 plan bounds and V1 authorization upgrades before writing", async () => {
    const request = fullIndexRequest();
    const payload = JSON.parse(new TextDecoder().decode(request.content));
    payload.payload.page_index = 2001;
    const forged = { ...request, content: encoder.encode(JSON.stringify(payload)) };
    const client = new FakeClient(fullReceipt);
    await expect(
      new GlobalTrademarkFactAdmissionJobAcquirer({
        reader: { read: async () => forged },
        client,
        fullBaselineEnabled: true,
      }).acquire(manualContext(ref(forged))),
    ).rejects.toMatchObject({ code: "GLOBAL_TRADEMARK_PUBLISH_JOB_CONFIG_INVALID" });
    const pilot = requestArtifact();
    const upgraded = JSON.parse(new TextDecoder().decode(pilot.content));
    upgraded.fullCollectionAuthorized = true;
    const fakePilot = { ...pilot, content: encoder.encode(JSON.stringify(upgraded)) };
    await expect(
      new GlobalTrademarkFactAdmissionJobAcquirer({
        reader: { read: async () => fakePilot },
        client,
        fullBaselineEnabled: true,
      }).acquire(manualContext(ref(fakePilot))),
    ).rejects.toMatchObject({ code: "GLOBAL_TRADEMARK_PUBLISH_JOB_CONFIG_INVALID" });
    expect(client.calls).toEqual([]);
  });
});

describe("bounded streaming V2 durable-request publisher", () => {
  function secondFullIndexRequest(): AcquiredCollectionArtifact {
    const request = fullIndexRequest();
    const value = JSON.parse(new TextDecoder().decode(request.content));
    value.evidenceCanonicalUri = "la-dipo://wopublish/trademarks/list/page/2/redacted-response";
    value.payload.page_index = 2;
    value.payload.evidence_canonical_uri = value.evidenceCanonicalUri;
    value.payload.records = value.payload.records.map(
      (record: Record<string, unknown>, index: number) => ({
        ...record,
        source_record_id: "LA" + String(55200 + index),
      }),
    );
    return {
      ...request,
      canonicalUri: "la-dipo://wopublish/trademarks/list/page/2/fact-admission-request",
      content: encoder.encode(JSON.stringify(value)),
    };
  }
  function batchContext(references: Array<ReturnType<typeof ref>>): ArtifactBackedExecutionContext {
    const base = manualContext(references[0]!);
    return {
      ...base,
      job: {
        ...base.job,
        sourceSnapshot: {
          ...base.job.sourceSnapshot,
          connectorConfig: {
            intent: "PUBLISH_DURABLE_REQUEST_BATCH",
            requestArtifactRefs: references,
          },
        },
      },
    } as unknown as ArtifactBackedExecutionContext;
  }

  it("publishes 1..500 exact V2 requests sequentially and parents every receipt", async () => {
    const first = fullIndexRequest();
    const second = secondFullIndexRequest();
    const references = [ref(first), ref(second, ARTIFACT_ID_2)];
    const artifacts = new Map([
      [ARTIFACT_ID, first],
      [ARTIFACT_ID_2, second],
    ]);
    const calls: number[] = [];
    const client: FactAdmissionClient = {
      async post(_path, payload) {
        const value = payload as Record<string, unknown>;
        calls.push(value.page_index as number);
        return {
          ...fullReceipt,
          page_index: value.page_index,
          source_total: value.source_total,
          source_response_sha256: value.source_response_sha256,
          evidence_sha256: value.evidence_sha256,
          record_count: (value.records as unknown[]).length,
          inserted_count: (value.records as unknown[]).length,
        };
      },
    };
    const producer = new GlobalTrademarkFactAdmissionJobAcquirer({
      reader: {
        async read(id) {
          const artifact = artifacts.get(id);
          if (!artifact) throw Error("Unexpected artifact " + id);
          return artifact;
        },
      },
      client,
      fullBaselineEnabled: true,
    });
    const frozen = batchContext(references);
    expect(producer.isStreamingJob(frozen)).toBe(true);
    await expect(producer.acquire(frozen)).rejects.toMatchObject({
      code: "GLOBAL_TRADEMARK_PUBLISH_JOB_CONFIG_INVALID",
    });
    const batches = [];
    for await (const batch of producer.acquireBatches(frozen)) batches.push(batch);
    expect(calls).toEqual([1, 2]);
    expect(batches).toHaveLength(2);
    expect(batches[0]![0]?.parentArtifactIds).toEqual([ARTIFACT_ID]);
    expect(batches[1]![0]?.parentArtifactIds).toEqual([ARTIFACT_ID_2]);
  });

  it("rejects duplicate or oversized batch references before reading durable bytes", () => {
    const request = fullIndexRequest();
    const reference = ref(request);
    const duplicate = batchContext([reference, reference]);
    const producer = new GlobalTrademarkFactAdmissionJobAcquirer({
      reader: { read: async () => request },
      client: new FakeClient(fullReceipt),
      fullBaselineEnabled: true,
    });
    expect(() => producer.isStreamingJob(duplicate)).toThrowError(/unique RawArtifact ids/u);
  });
});
