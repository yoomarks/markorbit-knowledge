import { describe, expect, it } from "vitest";

import type { FactAdmissionClient } from "./fact-admission-http-client";
import type { CnipaGazetteDatasetIdentityEnvelope } from "./cnipa-gazette-data-engine-handoff";
import type {
  CnipaGazetteCheckpoint,
  CnipaGazetteRuntimeRow,
} from "./cnipa-gazette-checkpoint-runtime";
import {
  CNIPA_GAZETTE_CHUNK_ADMISSION_PATH,
  CNIPA_GAZETTE_FINALIZE_ADMISSION_PATH,
  CnipaGazetteDataEnginePublisher,
} from "./cnipa-gazette-data-engine-publisher";

function row(): CnipaGazetteRuntimeRow {
  return {
    sourceRowId: "row-1",
    sourceSearchId: "row-1",
    registrationNumber: "200001",
    announcementIssue: 75,
    announcementTypeCode: "TMZCSQ",
    announcementTypeName: "商标初步审定公告",
    detailPageNo: 1,
    announcementPageCount: 97,
    detailFileId: "file-1",
    detailAssetPath: "/group/page-1.jpg",
    announcementDetailUrl: "",
  };
}

function checkpoint(): CnipaGazetteCheckpoint {
  return {
    contractVersion: "CNIPA_GAZETTE_CHECKPOINT_RUNTIME_V1",
    announcementIssue: 75,
    sourceTotal: 1,
    sourcePages: 1,
    announcementDate: "1983-08-15",
    pageSize: 100,
    range: { startPage: 1, endPage: 1 },
    pages: [
      {
        pageIndex: 1,
        pageSize: 100,
        sourceTotal: 1,
        sourcePages: 1,
        announcementDate: "1983-08-15",
        rows: [row()],
      },
    ],
    rowCount: 1,
    uniqueOfficialRowIds: 1,
    completeness: "RANGE_COMPLETE",
  };
}

function identity(): CnipaGazetteDatasetIdentityEnvelope {
  const sourceDatasetSha256 = "a".repeat(64);
  return {
    identity: {
      schemaVersion: "CNIPA_GAZETTE_DATASET_IDENTITY_V1",
      sourceAuthority: "CNIPA",
      sourceFamily: "CNIPA_TRADEMARK_GAZETTE",
      queryScope: {
        announcementTypeSelection: "ALL",
        anncType: "",
      },
      announcementIssue: 75,
      announcementDate: "1983-08-15",
      sourceRecordCount: 1,
      sourcePageCount: 1,
      pageSize: 100,
      sourceUri:
        "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
      captureStartedAt: "2026-09-19T08:00:00.000Z",
      firstPageRawSha256: "b".repeat(64),
    },
    sourceDatasetSha256,
    artifact: {
      artifactKind: "JSON",
      mimeType: "application/json;charset=UTF-8",
      originalName: "identity.json",
      sourceUri:
        "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
      canonicalUri: "cnipa://trademark-gazette/issue/75/dataset/" + sourceDatasetSha256,
      content: new TextEncoder().encode("{}"),
    },
  };
}

class FakeClient implements FactAdmissionClient {
  readonly calls: Array<{ path: string; payload: object }> = [];

  constructor(private readonly outcomeByPath: Record<string, Record<string, unknown>>) {}

  async post<TPayload extends object>(path: string, payload: TPayload) {
    this.calls.push({ path, payload });
    return this.outcomeByPath[path] ?? {};
  }
}

describe("CnipaGazetteDataEnginePublisher", () => {
  it("publishes bounded chunks to the governed chunk endpoint", async () => {
    const client = new FakeClient({
      [CNIPA_GAZETTE_CHUNK_ADMISSION_PATH]: {
        outcome: "CHUNK_ADMITTED",
        replayed: false,
      },
    });
    const publisher = new CnipaGazetteDataEnginePublisher(client);

    const result = await publisher.publishChunk({
      checkpoint: checkpoint(),
      datasetIdentity: identity(),
      collectedAt: "2026-09-19T08:01:00.000Z",
    });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.path).toBe(CNIPA_GAZETTE_CHUNK_ADMISSION_PATH);
    expect(client.calls[0]!.payload).toMatchObject({
      contract_version: "CN_TRADEMARK_GAZETTE_ADMISSION_CHUNK_V1",
      source_authority: "CNIPA",
      query_scope: {
        announcement_type_selection: "ALL",
        annc_type: "",
      },
      announcement_issue: 75,
      announcement_date: "1983-08-15",
      source_record_count: 1,
      source_page_count: 1,
      range_start_page: 1,
      range_end_page: 1,
      chunk_row_count: 1,
      source_dataset_sha256: "a".repeat(64),
    });
    expect(result.receipt).toEqual({
      outcome: "CHUNK_ADMITTED",
      replayed: false,
    });
  });

  it("publishes finalization only to the governed finalize endpoint", async () => {
    const client = new FakeClient({
      [CNIPA_GAZETTE_FINALIZE_ADMISSION_PATH]: {
        outcome: "ADMITTED",
        replayed: false,
      },
    });
    const publisher = new CnipaGazetteDataEnginePublisher(client);

    const result = await publisher.finalize({
      datasetIdentity: identity(),
      collectedAt: "2026-09-19T08:10:00.000Z",
    });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.path).toBe(CNIPA_GAZETTE_FINALIZE_ADMISSION_PATH);
    expect(client.calls[0]!.payload).toEqual({
      contract_version: "CN_TRADEMARK_GAZETTE_ADMISSION_FINALIZE_V1",
      source_authority: "CNIPA",
      query_scope: {
        announcement_type_selection: "ALL",
        annc_type: "",
      },
      announcement_issue: 75,
      announcement_date: "1983-08-15",
      record_count: 1,
      page_count: 1,
      page_size: 100,
      source_capture_schema: "CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_V1",
      source_dataset_sha256: "a".repeat(64),
      source_uri:
        "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
      collected_at: "2026-09-19T08:10:00.000Z",
    });
    expect(result.receipt).toEqual({
      outcome: "ADMITTED",
      replayed: false,
    });
  });

  it("fails closed on unexpected Data Engine receipt outcomes", async () => {
    const client = new FakeClient({
      [CNIPA_GAZETTE_CHUNK_ADMISSION_PATH]: {
        outcome: "SOMETHING_ELSE",
      },
    });
    const publisher = new CnipaGazetteDataEnginePublisher(client);

    await expect(
      publisher.publishChunk({
        checkpoint: checkpoint(),
        datasetIdentity: identity(),
        collectedAt: "2026-09-19T08:01:00.000Z",
      }),
    ).rejects.toThrow(/unexpected outcome SOMETHING_ELSE/);
  });
});
