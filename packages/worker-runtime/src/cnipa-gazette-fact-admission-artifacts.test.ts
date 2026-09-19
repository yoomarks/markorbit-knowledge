import { describe, expect, it } from "vitest";

import type { AcquiredCollectionArtifact } from "./artifact-backed-collection-executor";
import type {
  CnipaGazetteDataEngineChunkPackage,
  CnipaGazetteDataEngineFinalizePackage,
} from "./cnipa-gazette-data-engine-handoff";
import {
  buildCnipaGazetteChunkAdmissionRequestArtifact,
  buildCnipaGazetteFactAdmissionReceiptArtifact,
  buildCnipaGazetteFinalizeAdmissionRequestArtifact,
  CNIPA_GAZETTE_FACT_ADMISSION_RECEIPT_SCHEMA,
  CNIPA_GAZETTE_FACT_ADMISSION_REQUEST_SCHEMA,
  parseCnipaGazetteFactAdmissionReceiptArtifact,
  parseCnipaGazetteFactAdmissionRequestArtifact,
} from "./cnipa-gazette-fact-admission-artifacts";

const DATASET_SHA = "a".repeat(64);
const ISSUE = 75;
const IDENTITY_URI = `cnipa://trademark-gazette/issue/${ISSUE}/dataset/${DATASET_SHA}`;
const SOURCE_URI =
  "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg";

function row(index: number) {
  return {
    source_row_id: `row-${index}`,
    source_search_id: `row-${index}`,
    registration_number: String(200000 + index),
    announcement_issue: ISSUE,
    announcement_type_code: "TMZCSQ",
    announcement_type_name: "商标初步审定公告",
    detail_page_no: index + 1,
    announcement_page_count: 97,
    detail_file_id: `file-${index}`,
    detail_asset_path: `/group/${index}.jpg`,
    announcement_detail_url: "",
  };
}

function chunkPackage(
  startPage: number,
  endPage: number,
  startRow: number,
  rowCount: number,
): CnipaGazetteDataEngineChunkPackage {
  return {
    contract_version: "CN_TRADEMARK_GAZETTE_ADMISSION_CHUNK_V1",
    source_authority: "CNIPA",
    query_scope: {
      announcement_type_selection: "ALL",
      annc_type: "",
    },
    announcement_issue: ISSUE,
    announcement_date: "1983-08-15",
    source_record_count: 250,
    source_page_count: 3,
    page_size: 100,
    range_start_page: startPage,
    range_end_page: endPage,
    page_row_counts: Array.from({ length: endPage - startPage + 1 }, (_, offset) => {
      const pageIndex = startPage + offset;
      return {
        page_index: pageIndex,
        row_count: pageIndex === 3 ? 50 : 100,
      };
    }),
    chunk_row_count: rowCount,
    source_capture_schema: "CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_V1",
    source_dataset_sha256: DATASET_SHA,
    source_uri: SOURCE_URI,
    collected_at: "2026-09-19T08:01:00.000Z",
    records: Array.from({ length: rowCount }, (_, index) => row(startRow + index)),
  };
}

function finalizePackage(): CnipaGazetteDataEngineFinalizePackage {
  return {
    contract_version: "CN_TRADEMARK_GAZETTE_ADMISSION_FINALIZE_V1",
    source_authority: "CNIPA",
    query_scope: {
      announcement_type_selection: "ALL",
      annc_type: "",
    },
    announcement_issue: ISSUE,
    announcement_date: "1983-08-15",
    record_count: 250,
    page_count: 3,
    page_size: 100,
    source_capture_schema: "CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_V1",
    source_dataset_sha256: DATASET_SHA,
    source_uri: SOURCE_URI,
    collected_at: "2026-09-19T08:10:00.000Z",
  };
}

function chunkRequest(
  startPage: number,
  endPage: number,
  startRow: number,
  rowCount: number,
): AcquiredCollectionArtifact {
  return buildCnipaGazetteChunkAdmissionRequestArtifact({
    package: chunkPackage(startPage, endPage, startRow, rowCount),
    datasetIdentityCanonicalUri: IDENTITY_URI,
    checkpointCanonicalUri: `cnipa://trademark-gazette/issue/${ISSUE}/checkpoint/${startPage}-${endPage}`,
    createdAt: "2026-09-19T08:02:00.000Z",
  });
}

function chunkReceipt(
  startPage: number,
  endPage: number,
  startRow: number,
  rowCount: number,
): AcquiredCollectionArtifact {
  const request = chunkRequest(startPage, endPage, startRow, rowCount);
  return buildCnipaGazetteFactAdmissionReceiptArtifact({
    requestArtifact: request,
    receipt: {
      outcome: "CHUNK_ADMITTED",
      contract_version: "CN_TRADEMARK_GAZETTE_ADMISSION_CHUNK_V1",
      announcement_issue: ISSUE,
      source_dataset_sha256: DATASET_SHA,
      range_start_page: startPage,
      range_end_page: endPage,
      chunk_row_count: rowCount,
      chunk_fingerprint: "b".repeat(64),
      replayed: false,
    },
    observedAt: "2026-09-19T08:03:00.000Z",
  });
}

describe("CNIPA Gazette fact-admission durable artifacts", () => {
  it("builds a CHUNK request artifact with exact durable lineage", () => {
    const artifact = chunkRequest(1, 2, 0, 200);

    expect(artifact).toMatchObject({
      artifactKind: "JSON",
      sourceUri: "markorbit://data-engine/api/admin/v2/fact-admissions/cn/trademark-gazette/chunks",
      canonicalUri: `${IDENTITY_URI}/fact-admission/chunk/1-2/request`,
      parentCanonicalUris: [
        "cnipa://trademark-gazette/issue/75/checkpoint/1-2",
        IDENTITY_URI,
      ].sort(),
    });

    const parsed = parseCnipaGazetteFactAdmissionRequestArtifact(artifact);
    expect(parsed).toMatchObject({
      schemaVersion: CNIPA_GAZETTE_FACT_ADMISSION_REQUEST_SCHEMA,
      operation: "CHUNK",
      method: "POST",
      sourceDatasetSha256: DATASET_SHA,
      announcementIssue: ISSUE,
      range: { startPage: 1, endPage: 2 },
    });
    if (parsed.operation !== "CHUNK") {
      throw new Error("expected CHUNK request");
    }
    expect(parsed.payload.chunk_row_count).toBe(200);
  });

  it("builds and parses a CHUNK receipt artifact pinned to request metadata", () => {
    const request = chunkRequest(1, 2, 0, 200);
    const artifact = buildCnipaGazetteFactAdmissionReceiptArtifact({
      requestArtifact: request,
      receipt: {
        outcome: "CHUNK_ADMITTED",
        announcement_issue: ISSUE,
        source_dataset_sha256: DATASET_SHA,
        range_start_page: 1,
        range_end_page: 2,
        chunk_row_count: 200,
        replayed: false,
      },
      observedAt: "2026-09-19T08:03:00.000Z",
    });

    expect(artifact.canonicalUri).toBe(`${IDENTITY_URI}/fact-admission/chunk/1-2/receipt`);
    expect(artifact.parentCanonicalUris).toEqual([request.canonicalUri]);
    const parsed = parseCnipaGazetteFactAdmissionReceiptArtifact(artifact);
    expect(parsed).toMatchObject({
      schemaVersion: CNIPA_GAZETTE_FACT_ADMISSION_RECEIPT_SCHEMA,
      operation: "CHUNK",
      sourceDatasetSha256: DATASET_SHA,
      announcementIssue: ISSUE,
      range: { startPage: 1, endPage: 2 },
    });
    expect(parsed.receipt.outcome).toBe("CHUNK_ADMITTED");
  });

  it("rejects CHUNK receipts that do not match request dataset or range", () => {
    const request = chunkRequest(1, 2, 0, 200);

    expect(() =>
      buildCnipaGazetteFactAdmissionReceiptArtifact({
        requestArtifact: request,
        receipt: {
          outcome: "CHUNK_ADMITTED",
          source_dataset_sha256: "c".repeat(64),
        },
        observedAt: "2026-09-19T08:03:00.000Z",
      }),
    ).toThrow(/dataset identity mismatch/);

    expect(() =>
      buildCnipaGazetteFactAdmissionReceiptArtifact({
        requestArtifact: request,
        receipt: {
          outcome: "CHUNK_ADMITTED",
          range_start_page: 2,
        },
        observedAt: "2026-09-19T08:03:00.000Z",
      }),
    ).toThrow(/start-page mismatch/);
  });

  it("builds FINALIZE request only after contiguous CHUNK receipt coverage", () => {
    const left = chunkReceipt(1, 2, 0, 200);
    const right = chunkReceipt(3, 3, 200, 50);

    const artifact = buildCnipaGazetteFinalizeAdmissionRequestArtifact({
      package: finalizePackage(),
      datasetIdentityCanonicalUri: IDENTITY_URI,
      chunkReceiptArtifacts: [right, left],
      createdAt: "2026-09-19T08:09:00.000Z",
    });

    expect(artifact.canonicalUri).toBe(`${IDENTITY_URI}/fact-admission/finalize/request`);
    expect(artifact.parentCanonicalUris).toEqual(
      [IDENTITY_URI, left.canonicalUri!, right.canonicalUri!].sort(),
    );
    const parsed = parseCnipaGazetteFactAdmissionRequestArtifact(artifact);
    expect(parsed).toMatchObject({
      operation: "FINALIZE",
      sourceDatasetSha256: DATASET_SHA,
      announcementIssue: ISSUE,
      pageCount: 3,
    });
  });

  it("rejects FINALIZE request when chunk receipts have gaps or foreign datasets", () => {
    const pageOneOnly = chunkReceipt(1, 1, 0, 100);
    const pageThree = chunkReceipt(3, 3, 200, 50);

    expect(() =>
      buildCnipaGazetteFinalizeAdmissionRequestArtifact({
        package: finalizePackage(),
        datasetIdentityCanonicalUri: IDENTITY_URI,
        chunkReceiptArtifacts: [pageOneOnly, pageThree],
        createdAt: "2026-09-19T08:09:00.000Z",
      }),
    ).toThrow(/coverage gap\/overlap/);

    const foreign = chunkReceipt(3, 3, 200, 50);
    const raw = JSON.parse(new TextDecoder().decode(foreign.content)) as Record<string, unknown>;
    raw.sourceDatasetSha256 = "d".repeat(64);
    foreign.content = new TextEncoder().encode(JSON.stringify(raw));

    expect(() =>
      buildCnipaGazetteFinalizeAdmissionRequestArtifact({
        package: finalizePackage(),
        datasetIdentityCanonicalUri: IDENTITY_URI,
        chunkReceiptArtifacts: [chunkReceipt(1, 2, 0, 200), foreign],
        createdAt: "2026-09-19T08:09:00.000Z",
      }),
    ).toThrow(/does not belong to finalize dataset/);
  });

  it("builds FINALIZE receipt as the terminal cross-plane evidence artifact", () => {
    const finalizeRequest = buildCnipaGazetteFinalizeAdmissionRequestArtifact({
      package: finalizePackage(),
      datasetIdentityCanonicalUri: IDENTITY_URI,
      chunkReceiptArtifacts: [chunkReceipt(1, 2, 0, 200), chunkReceipt(3, 3, 200, 50)],
      createdAt: "2026-09-19T08:09:00.000Z",
    });

    const receipt = buildCnipaGazetteFactAdmissionReceiptArtifact({
      requestArtifact: finalizeRequest,
      receipt: {
        outcome: "ADMITTED",
        announcement_issue: ISSUE,
        source_dataset_sha256: DATASET_SHA,
        record_count: 250,
        page_count: 3,
        chunk_count: 2,
        replayed: false,
      },
      observedAt: "2026-09-19T08:11:00.000Z",
    });

    expect(receipt.canonicalUri).toBe(`${IDENTITY_URI}/fact-admission/finalize/receipt`);
    expect(receipt.parentCanonicalUris).toEqual([finalizeRequest.canonicalUri]);

    const parsed = parseCnipaGazetteFactAdmissionReceiptArtifact(receipt);
    expect(parsed).toMatchObject({
      operation: "FINALIZE",
      sourceDatasetSha256: DATASET_SHA,
      announcementIssue: ISSUE,
      pageCount: 3,
    });
    expect(parsed.receipt.outcome).toBe("ADMITTED");
  });
});
