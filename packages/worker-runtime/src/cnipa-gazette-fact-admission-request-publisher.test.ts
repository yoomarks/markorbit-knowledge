import { describe, expect, it } from "vitest";

import type { FactAdmissionClient } from "./fact-admission-http-client";
import { FactAdmissionHttpError } from "./fact-admission-http-client";
import {
  buildCnipaGazetteChunkAdmissionRequestArtifact,
  buildCnipaGazetteFactAdmissionReceiptArtifact,
  buildCnipaGazetteFinalizeAdmissionRequestArtifact,
  parseCnipaGazetteFactAdmissionReceiptArtifact,
} from "./cnipa-gazette-fact-admission-artifacts";
import { CnipaGazetteFactAdmissionRequestPublisher } from "./cnipa-gazette-fact-admission-request-publisher";
import type {
  CnipaGazetteDataEngineChunkPackage,
  CnipaGazetteDataEngineFinalizePackage,
} from "./cnipa-gazette-data-engine-handoff";

const SHA = "a".repeat(64);
const IDENTITY = `cnipa://trademark-gazette/issue/75/dataset/${SHA}`;
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
    source_dataset_sha256: SHA,
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

function finalizePackage(): CnipaGazetteDataEngineFinalizePackage {
  return {
    contract_version: "CN_TRADEMARK_GAZETTE_ADMISSION_FINALIZE_V1",
    source_authority: "CNIPA",
    query_scope: { announcement_type_selection: "ALL", annc_type: "" },
    announcement_issue: 75,
    announcement_date: "1983-08-15",
    record_count: 1,
    page_count: 1,
    page_size: 100,
    source_capture_schema: "CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_V1",
    source_dataset_sha256: SHA,
    source_uri: SOURCE,
    collected_at: "2026-09-19T08:10:00.000Z",
  };
}

function chunkRequest() {
  return buildCnipaGazetteChunkAdmissionRequestArtifact({
    package: chunkPackage(),
    datasetIdentityCanonicalUri: IDENTITY,
    checkpointCanonicalUri: "cnipa://trademark-gazette/issue/75/checkpoint/1-1",
    createdAt: "2026-09-19T08:02:00.000Z",
  });
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

describe("CnipaGazetteFactAdmissionRequestPublisher", () => {
  it("publishes a durable CHUNK request and emits a receipt artifact", async () => {
    const client = new FakeClient(async () => ({
      outcome: "CHUNK_ADMITTED",
      announcement_issue: 75,
      source_dataset_sha256: SHA,
      range_start_page: 1,
      range_end_page: 1,
      chunk_row_count: 1,
      replayed: false,
    }));
    const publisher = new CnipaGazetteFactAdmissionRequestPublisher(client);
    const requestArtifact = chunkRequest();

    const result = await publisher.publish({
      requestArtifact,
      observedAt: "2026-09-19T08:03:00.000Z",
    });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.path).toBe("/api/admin/v2/fact-admissions/cn/trademark-gazette/chunks");
    expect(client.calls[0]!.payload).toEqual(chunkPackage());
    expect(result.receipt.outcome).toBe("CHUNK_ADMITTED");
    expect(result.receiptArtifact.parentCanonicalUris).toEqual([requestArtifact.canonicalUri]);
    expect(parseCnipaGazetteFactAdmissionReceiptArtifact(result.receiptArtifact)).toMatchObject({
      operation: "CHUNK",
      sourceDatasetSha256: SHA,
      announcementIssue: 75,
      range: { startPage: 1, endPage: 1 },
    });
  });

  it("publishes FINALIZE only from a request backed by committed CHUNK receipts", async () => {
    const committedChunk = buildCnipaGazetteFactAdmissionReceiptArtifact({
      requestArtifact: chunkRequest(),
      receipt: {
        outcome: "CHUNK_ADMITTED",
        announcement_issue: 75,
        source_dataset_sha256: SHA,
        range_start_page: 1,
        range_end_page: 1,
        replayed: false,
      },
      observedAt: "2026-09-19T08:03:00.000Z",
    });
    const finalizeRequest = buildCnipaGazetteFinalizeAdmissionRequestArtifact({
      package: finalizePackage(),
      datasetIdentityCanonicalUri: IDENTITY,
      chunkReceiptArtifacts: [committedChunk],
      createdAt: "2026-09-19T08:09:00.000Z",
    });
    const client = new FakeClient(async () => ({
      outcome: "ADMITTED",
      announcement_issue: 75,
      source_dataset_sha256: SHA,
      record_count: 1,
      page_count: 1,
      chunk_count: 1,
      replayed: false,
    }));
    const publisher = new CnipaGazetteFactAdmissionRequestPublisher(client);

    const result = await publisher.publish({
      requestArtifact: finalizeRequest,
      observedAt: "2026-09-19T08:11:00.000Z",
    });

    expect(client.calls[0]!.path).toBe(
      "/api/admin/v2/fact-admissions/cn/trademark-gazette/finalize",
    );
    expect(client.calls[0]!.payload).toEqual(finalizePackage());
    expect(parseCnipaGazetteFactAdmissionReceiptArtifact(result.receiptArtifact)).toMatchObject({
      operation: "FINALIZE",
      sourceDatasetSha256: SHA,
      announcementIssue: 75,
      pageCount: 1,
    });
  });

  it("fails closed when Data Engine returns an unexpected outcome", async () => {
    const client = new FakeClient(async () => ({
      outcome: "ADMITTED",
    }));
    const publisher = new CnipaGazetteFactAdmissionRequestPublisher(client);

    await expect(
      publisher.publish({
        requestArtifact: chunkRequest(),
        observedAt: "2026-09-19T08:03:00.000Z",
      }),
    ).rejects.toThrow(/CHUNK receipt outcome must be CHUNK_ADMITTED/);
  });

  it("propagates governed fact-admission transport failures unchanged", async () => {
    const expected = new FactAdmissionHttpError(
      503,
      "DATA_ENGINE_FACT_ADMISSION_UNAVAILABLE",
      "clickhouse unavailable",
      true,
    );
    const client = new FakeClient(async () => {
      throw expected;
    });
    const publisher = new CnipaGazetteFactAdmissionRequestPublisher(client);

    await expect(
      publisher.publish({
        requestArtifact: chunkRequest(),
        observedAt: "2026-09-19T08:03:00.000Z",
      }),
    ).rejects.toBe(expected);
  });
});
