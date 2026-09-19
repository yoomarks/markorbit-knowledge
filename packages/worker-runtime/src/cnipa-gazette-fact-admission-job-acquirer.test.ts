import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  AcquiredCollectionArtifact,
  ArtifactBackedExecutionContext,
} from "./artifact-backed-collection-executor";
import {
  buildCnipaGazetteChunkAdmissionRequestArtifact,
  parseCnipaGazetteFactAdmissionReceiptArtifact,
} from "./cnipa-gazette-fact-admission-artifacts";
import {
  CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_ID,
  CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
  CNIPA_GAZETTE_FACT_ADMISSION_JOB_SOURCE,
  CnipaGazetteFactAdmissionJobAcquirer,
  cnipaGazetteFactAdmissionJobRuntimeDescriptor,
} from "./cnipa-gazette-fact-admission-job-acquirer";
import type { CnipaGazetteDataEngineChunkPackage } from "./cnipa-gazette-data-engine-handoff";
import { FactAdmissionHttpError, type FactAdmissionClient } from "./fact-admission-http-client";

const ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const DATASET_SHA = "a".repeat(64);
const IDENTITY = `cnipa://trademark-gazette/issue/75/dataset/${DATASET_SHA}`;
const SOURCE =
  "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg";
function chunkPackage(): CnipaGazetteDataEngineChunkPackage {
  return {
    contract_version: "CN_TRADEMARK_GAZETTE_ADMISSION_CHUNK_V1",
    source_authority: "CNIPA",
    query_scope: { announcement_type_selection: "ALL", annc_type: "" },
    announcement_issue: 75,
    announcement_date: "1983-08-15",
    source_record_count: 1,
    source_page_count: 1,
    page_size: 100,
    range_start_page: 1,
    range_end_page: 1,
    page_row_counts: [{ page_index: 1, row_count: 1 }],
    chunk_row_count: 1,
    source_capture_schema: "CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_V1",
    source_dataset_sha256: DATASET_SHA,
    source_uri: SOURCE,
    collected_at: "2026-09-19T08:01:00.000Z",
    records: [
      {
        source_row_id: "row-1",
        source_search_id: "row-1",
        registration_number: "200001",
        announcement_issue: 75,
        announcement_type_code: "TMZCSQ",
        announcement_type_name: "商标初步审定公告",
        detail_page_no: 1,
        announcement_page_count: 97,
        detail_file_id: "file-1",
        detail_asset_path: "/group/1.jpg",
        announcement_detail_url: "",
      },
    ],
  };
}

function requestArtifact(): AcquiredCollectionArtifact {
  return buildCnipaGazetteChunkAdmissionRequestArtifact({
    package: chunkPackage(),
    datasetIdentityCanonicalUri: IDENTITY,
    checkpointCanonicalUri: "cnipa://trademark-gazette/issue/75/checkpoint/1-1",
    createdAt: "2026-09-19T08:02:00.000Z",
  });
}

function reference(artifact: AcquiredCollectionArtifact) {
  return {
    artifactId: ARTIFACT_ID,
    canonicalUri: artifact.canonicalUri!,
    sha256: createHash("sha256").update(artifact.content).digest("hex"),
    sizeBytes: artifact.content.byteLength,
  };
}
function context(requestRef: ReturnType<typeof reference>): ArtifactBackedExecutionContext {
  return {
    workerId: "wrk_fixture",
    leaseToken: "lease-token",
    lease: { id: "lse_fixture" },
    job: {
      connector: {
        connectorId: CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_ID,
        version: CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
      },
      sourceSnapshot: {
        sourceType: "DATABASE",
        connector: {
          connectorId: CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_ID,
          version: CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
        },
        connectorConfig: {
          intent: "PUBLISH_DURABLE_REQUEST",
          requestArtifactRef: requestRef,
        },
        canonicalUri: CNIPA_GAZETTE_FACT_ADMISSION_JOB_SOURCE,
      },
      planSnapshot: {
        output: { artifactKinds: ["JSON"] },
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

class FakeClient implements FactAdmissionClient {
  readonly calls: Array<{ path: string; payload: object }> = [];
  constructor(
    private readonly handler: (path: string, payload: object) => Promise<Record<string, unknown>>,
  ) {}

  async post<TPayload extends object>(path: string, payload: TPayload) {
    this.calls.push({ path, payload });
    return this.handler(path, payload);
  }
}

describe("CnipaGazetteFactAdmissionJobAcquirer", () => {
  it("replays only the verified durable request and emits a receipt bound to its RawArtifact id", async () => {
    const request = requestArtifact();
    const readIds: string[] = [];
    const client = new FakeClient(async () => ({
      outcome: "CHUNK_ADMITTED",
      announcement_issue: 75,
      source_dataset_sha256: DATASET_SHA,
      range_start_page: 1,
      range_end_page: 1,
    }));
    const acquirer = new CnipaGazetteFactAdmissionJobAcquirer({
      reader: {
        async read(artifactId) {
          readIds.push(artifactId);
          return request;
        },
      },
      client,
      clock: () => "2026-09-19T08:03:00.000Z",
    });
    const artifacts = await acquirer.acquire(context(reference(request)));

    expect(readIds).toEqual([ARTIFACT_ID]);
    expect(client.calls).toEqual([
      {
        path: "/api/admin/v2/fact-admissions/cn/trademark-gazette/chunks",
        payload: chunkPackage(),
      },
    ]);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.parentArtifactIds).toEqual([ARTIFACT_ID]);
    expect(artifacts[0]?.parentCanonicalUris).toBeUndefined();
    expect(parseCnipaGazetteFactAdmissionReceiptArtifact(artifacts[0]!)).toMatchObject({
      operation: "CHUNK",
      announcementIssue: 75,
      sourceDatasetSha256: DATASET_SHA,
      range: { startPage: 1, endPage: 1 },
    });
  });

  it("refuses Data Engine access when loaded request bytes do not match the frozen SHA", async () => {
    const request = requestArtifact();
    const altered = {
      ...request,
      content: new TextEncoder().encode(
        new TextDecoder().decode(request.content).replace('"createdAt":', '"changedAt":'),
      ),
    };
    const client = new FakeClient(async () => ({ outcome: "CHUNK_ADMITTED" }));
    const acquirer = new CnipaGazetteFactAdmissionJobAcquirer({
      reader: { read: async () => altered },
      client,
    });

    await expect(acquirer.acquire(context(reference(request)))).rejects.toMatchObject({
      code: "CNIPA_GAZETTE_DURABLE_REQUEST_MISMATCH",
      retryable: false,
    });
    expect(client.calls).toEqual([]);
  });

  it("preserves governed retryability when Data Engine admission is unavailable", async () => {
    const request = requestArtifact();
    const client = new FakeClient(async () => {
      throw new FactAdmissionHttpError(
        503,
        "DATA_ENGINE_FACT_ADMISSION_UNAVAILABLE",
        "clickhouse unavailable",
        true,
      );
    });
    const acquirer = new CnipaGazetteFactAdmissionJobAcquirer({
      reader: { read: async () => request },
      client,
    });

    await expect(acquirer.acquire(context(reference(request)))).rejects.toMatchObject({
      code: "DATA_ENGINE_FACT_ADMISSION_UNAVAILABLE",
      retryable: true,
    });
  });
  it("rejects connectorConfig attempts to inject another Data Engine endpoint", async () => {
    const request = requestArtifact();
    const input = context(reference(request));
    input.job.sourceSnapshot.connectorConfig = {
      ...(input.job.sourceSnapshot.connectorConfig as Record<string, unknown>),
      dataEngineUrl: "https://example.test",
    };
    const client = new FakeClient(async () => ({ outcome: "CHUNK_ADMITTED" }));
    const acquirer = new CnipaGazetteFactAdmissionJobAcquirer({
      reader: { read: async () => request },
      client,
    });

    await expect(acquirer.acquire(input)).rejects.toMatchObject({
      code: "CNIPA_GAZETTE_PUBLISH_JOB_CONFIG_INVALID",
    });
    expect(client.calls).toEqual([]);
  });

  it("rejects any source other than the durable Knowledge request-artifact source", async () => {
    const request = requestArtifact();
    const input = context(reference(request));
    input.job.sourceSnapshot.sourceType = "API";
    const acquirer = new CnipaGazetteFactAdmissionJobAcquirer({
      reader: { read: async () => request },
      client: new FakeClient(async () => ({ outcome: "CHUNK_ADMITTED" })),
    });
    await expect(acquirer.acquire(input)).rejects.toMatchObject({
      code: "CNIPA_GAZETTE_PUBLISH_SOURCE_BOUNDARY_INVALID",
    });
  });

  it("declares that publisher execution has no CNIPA network dependency", () => {
    expect(cnipaGazetteFactAdmissionJobRuntimeDescriptor()).toMatchObject({
      sourceType: "DATABASE",
      inputMustBeDurableRawArtifact: true,
      requestIntegrityVerifiedBeforeDataEngineWrite: true,
      cnipaNetworkAccessRequired: false,
      factAdmissionOnly: true,
      artifactBackedReceiptRequired: true,
      historicalReplayActivated: false,
    });
  });
});
