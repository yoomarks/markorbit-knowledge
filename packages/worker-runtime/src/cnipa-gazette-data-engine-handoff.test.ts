import { describe, expect, it } from "vitest";

import type { AcquiredCollectionArtifact } from "./artifact-backed-collection-executor";
import {
  CNIPA_GAZETTE_RUNTIME_CONTRACT_VERSION,
  type CnipaGazetteCheckpoint,
  type CnipaGazetteRuntimeRow,
} from "./cnipa-gazette-checkpoint-runtime";
import {
  CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_SCHEMA,
  type CnipaGazetteCheckpointAcquisitionResult,
} from "./cnipa-gazette-checkpoint-acquirer";
import {
  buildCnipaGazetteDataEngineChunkPackage,
  buildCnipaGazetteDataEngineFinalizePackage,
  buildCnipaGazetteDatasetIdentity,
  CNIPA_GAZETTE_DATASET_IDENTITY_SCHEMA,
  CNIPA_GAZETTE_DE_CHUNK_CONTRACT,
  CNIPA_GAZETTE_DE_FINALIZE_CONTRACT,
} from "./cnipa-gazette-data-engine-handoff";

function row(index: number): CnipaGazetteRuntimeRow {
  return {
    sourceRowId: `row-${index}`,
    sourceSearchId: `row-${index}`,
    registrationNumber: String(200000 + index),
    announcementIssue: 75,
    announcementTypeCode: "TMZCSQ",
    announcementTypeName: "商标初步审定公告",
    detailPageNo: index + 1,
    announcementPageCount: 97,
    detailFileId: `file-${Math.floor(index / 5)}`,
    detailAssetPath: `/group/page-${Math.floor(index / 5)}.jpg`,
    announcementDetailUrl: "",
  };
}

function checkpoint(
  startPage = 1,
  endPage = 2,
  sourceTotal = 250,
  sourcePages = 3,
): CnipaGazetteCheckpoint {
  const pages = [];
  let rowOffset = (startPage - 1) * 100;
  for (let pageIndex = startPage; pageIndex <= endPage; pageIndex += 1) {
    const count = pageIndex === sourcePages ? sourceTotal % 100 || 100 : 100;
    pages.push({
      pageIndex,
      pageSize: 100 as const,
      sourceTotal,
      sourcePages,
      announcementDate: "1983-08-15",
      rows: Array.from({ length: count }, (_, index) => row(rowOffset + index)),
    });
    rowOffset += count;
  }
  const allRows = pages.flatMap((page) => page.rows);
  return {
    contractVersion: CNIPA_GAZETTE_RUNTIME_CONTRACT_VERSION,
    announcementIssue: 75,
    sourceTotal,
    sourcePages,
    announcementDate: "1983-08-15",
    pageSize: 100,
    range: { startPage, endPage },
    pages,
    rowCount: allRows.length,
    uniqueOfficialRowIds: new Set(allRows.map((item) => item.sourceRowId)).size,
    completeness: "RANGE_COMPLETE",
  };
}

function artifact(input: {
  canonicalUri: string;
  content: string | Uint8Array;
  sourceUri?: string;
  parents?: string[];
}): AcquiredCollectionArtifact {
  return {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: "fixture.json",
    sourceUri:
      input.sourceUri ??
      "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
    canonicalUri: input.canonicalUri,
    ...(input.parents ? { parentCanonicalUris: input.parents } : {}),
    content:
      typeof input.content === "string" ? new TextEncoder().encode(input.content) : input.content,
  };
}

function firstCheckpoint(
  rawBody = '{"code":0,"data":{"pageIndex":1}}',
  observedAt = "2026-09-19T08:00:00.000Z",
): CnipaGazetteCheckpointAcquisitionResult {
  const cp = checkpoint();
  const rawUri = "cnipa://trademark-gazette/issue/75/list/page/1/raw";
  const projectionUri = "cnipa://trademark-gazette/issue/75/list/page/1/projection";
  const checkpointUri = "cnipa://trademark-gazette/issue/75/checkpoint/1-2";
  const raw = artifact({
    canonicalUri: rawUri,
    content: rawBody,
  });
  const projection = artifact({
    canonicalUri: projectionUri,
    parents: [rawUri],
    content: JSON.stringify({
      schemaVersion: "CNIPA_GAZETTE_PAGE_EVIDENCE_V1",
      observedAt,
    }),
  });
  const checkpointArtifact = artifact({
    canonicalUri: checkpointUri,
    parents: [projectionUri],
    content: JSON.stringify({
      schemaVersion: CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_SCHEMA,
    }),
  });

  return {
    checkpoint: cp,
    checkpointArtifact,
    pageArtifacts: [raw, projection],
    plannedRanges: [
      { startPage: 1, endPage: 2 },
      { startPage: 3, endPage: 3 },
    ],
  };
}

describe("CNIPA Gazette Data Engine handoff", () => {
  it("creates a durable observation identity from first checkpoint evidence", () => {
    const result = buildCnipaGazetteDatasetIdentity(firstCheckpoint());

    expect(result.identity).toEqual({
      schemaVersion: CNIPA_GAZETTE_DATASET_IDENTITY_SCHEMA,
      sourceAuthority: "CNIPA",
      sourceFamily: "CNIPA_TRADEMARK_GAZETTE",
      queryScope: {
        announcementTypeSelection: "ALL",
        anncType: "",
      },
      announcementIssue: 75,
      announcementDate: "1983-08-15",
      sourceRecordCount: 250,
      sourcePageCount: 3,
      pageSize: 100,
      sourceUri:
        "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
      captureStartedAt: "2026-09-19T08:00:00.000Z",
      firstPageRawSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(result.sourceDatasetSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.artifact.canonicalUri).toBe(
      `cnipa://trademark-gazette/issue/75/dataset/${result.sourceDatasetSha256}`,
    );
    expect(result.artifact.parentCanonicalUris).toEqual([
      "cnipa://trademark-gazette/issue/75/list/page/1/raw",
      "cnipa://trademark-gazette/issue/75/checkpoint/1-2",
    ]);
  });

  it("changes dataset identity across distinct observations even when issue totals are unchanged", () => {
    const baseline = buildCnipaGazetteDatasetIdentity(firstCheckpoint());
    const laterTime = buildCnipaGazetteDatasetIdentity(
      firstCheckpoint('{"code":0,"data":{"pageIndex":1}}', "2026-09-19T08:05:00.000Z"),
    );
    const changedRaw = buildCnipaGazetteDatasetIdentity(
      firstCheckpoint(
        '{"code":0,"data":{"pageIndex":1,"corrected":true}}',
        "2026-09-19T08:00:00.000Z",
      ),
    );

    expect(laterTime.sourceDatasetSha256).not.toBe(baseline.sourceDatasetSha256);
    expect(changedRaw.sourceDatasetSha256).not.toBe(baseline.sourceDatasetSha256);
  });

  it("builds exact chunk contract from a bounded checkpoint", () => {
    const identity = buildCnipaGazetteDatasetIdentity(firstCheckpoint());
    const result = buildCnipaGazetteDataEngineChunkPackage({
      checkpoint: checkpoint(1, 2),
      datasetIdentity: identity,
      collectedAt: "2026-09-19T08:01:00.000Z",
    });

    expect(result).toMatchObject({
      contract_version: CNIPA_GAZETTE_DE_CHUNK_CONTRACT,
      source_authority: "CNIPA",
      query_scope: {
        announcement_type_selection: "ALL",
        annc_type: "",
      },
      announcement_issue: 75,
      announcement_date: "1983-08-15",
      source_record_count: 250,
      source_page_count: 3,
      page_size: 100,
      range_start_page: 1,
      range_end_page: 2,
      page_row_counts: [
        { page_index: 1, row_count: 100 },
        { page_index: 2, row_count: 100 },
      ],
      chunk_row_count: 200,
      source_capture_schema: CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_SCHEMA,
      source_dataset_sha256: identity.sourceDatasetSha256,
      collected_at: "2026-09-19T08:01:00.000Z",
    });
    expect(result.records).toHaveLength(200);
    expect(result.records[0]).toEqual({
      source_row_id: "row-0",
      source_search_id: "row-0",
      registration_number: "200000",
      announcement_issue: 75,
      announcement_type_code: "TMZCSQ",
      announcement_type_name: "商标初步审定公告",
      detail_page_no: 1,
      announcement_page_count: 97,
      detail_file_id: "file-0",
      detail_asset_path: "/group/page-0.jpg",
      announcement_detail_url: "",
    });

    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "registerCnName",
      "applicant_name",
      "tmName",
      "trademark_name",
      "intlCls",
      "nice_class",
      "applyDate",
      "application_date",
      "agentName",
      "workspace_id",
      "customer_id",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("builds finalize contract from the same observation identity", () => {
    const identity = buildCnipaGazetteDatasetIdentity(firstCheckpoint());
    const result = buildCnipaGazetteDataEngineFinalizePackage({
      datasetIdentity: identity,
      collectedAt: "2026-09-19T08:10:00.000Z",
    });

    expect(result).toEqual({
      contract_version: CNIPA_GAZETTE_DE_FINALIZE_CONTRACT,
      source_authority: "CNIPA",
      query_scope: {
        announcement_type_selection: "ALL",
        annc_type: "",
      },
      announcement_issue: 75,
      announcement_date: "1983-08-15",
      record_count: 250,
      page_count: 3,
      page_size: 100,
      source_capture_schema: CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_SCHEMA,
      source_dataset_sha256: identity.sourceDatasetSha256,
      source_uri:
        "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
      collected_at: "2026-09-19T08:10:00.000Z",
    });
  });

  it("rejects checkpoint metadata that does not belong to the dataset observation", () => {
    const identity = buildCnipaGazetteDatasetIdentity(firstCheckpoint());
    const wrong = {
      ...checkpoint(3, 3),
      announcementDate: "1983-08-16",
    };

    expect(() =>
      buildCnipaGazetteDataEngineChunkPackage({
        checkpoint: wrong,
        datasetIdentity: identity,
        collectedAt: "2026-09-19T08:10:00.000Z",
      }),
    ).toThrow(/does not match dataset identity/);
  });

  it("requires dataset identity to originate from page one evidence", () => {
    const later = firstCheckpoint();
    later.checkpoint = checkpoint(3, 3);
    later.checkpointArtifact = artifact({
      canonicalUri: "cnipa://trademark-gazette/issue/75/checkpoint/3-3",
      content: "{}",
    });

    expect(() => buildCnipaGazetteDatasetIdentity(later)).toThrow(/first checkpoint range/);
  });
});
