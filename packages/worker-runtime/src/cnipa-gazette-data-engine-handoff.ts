import { createHash } from "node:crypto";

import type { AcquiredCollectionArtifact } from "./artifact-backed-collection-executor";
import type {
  CnipaGazetteCheckpoint,
  CnipaGazetteRuntimeRow,
} from "./cnipa-gazette-checkpoint-runtime";
import {
  CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_SCHEMA,
  type CnipaGazetteCheckpointAcquisitionResult,
} from "./cnipa-gazette-checkpoint-acquirer";

export const CNIPA_GAZETTE_DATASET_IDENTITY_SCHEMA = "CNIPA_GAZETTE_DATASET_IDENTITY_V1" as const;
export const CNIPA_GAZETTE_DE_CHUNK_CONTRACT = "CN_TRADEMARK_GAZETTE_ADMISSION_CHUNK_V1" as const;
export const CNIPA_GAZETTE_DE_FINALIZE_CONTRACT =
  "CN_TRADEMARK_GAZETTE_ADMISSION_FINALIZE_V1" as const;

export type CnipaGazetteDatasetIdentity = {
  schemaVersion: typeof CNIPA_GAZETTE_DATASET_IDENTITY_SCHEMA;
  sourceAuthority: "CNIPA";
  sourceFamily: "CNIPA_TRADEMARK_GAZETTE";
  queryScope: {
    announcementTypeSelection: "ALL";
    anncType: "";
  };
  announcementIssue: number;
  announcementDate: string;
  sourceRecordCount: number;
  sourcePageCount: number;
  pageSize: 100;
  sourceUri: string;
  captureStartedAt: string;
  firstPageRawSha256: string;
};

export type CnipaGazetteDatasetIdentityEnvelope = {
  identity: CnipaGazetteDatasetIdentity;
  sourceDatasetSha256: string;
  artifact: AcquiredCollectionArtifact;
};

export type CnipaGazetteDataEngineChunkPackage = {
  contract_version: typeof CNIPA_GAZETTE_DE_CHUNK_CONTRACT;
  source_authority: "CNIPA";
  query_scope: {
    announcement_type_selection: "ALL";
    annc_type: "";
  };
  announcement_issue: number;
  announcement_date: string;
  source_record_count: number;
  source_page_count: number;
  page_size: 100;
  range_start_page: number;
  range_end_page: number;
  page_row_counts: readonly {
    page_index: number;
    row_count: number;
  }[];
  chunk_row_count: number;
  source_capture_schema: typeof CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_SCHEMA;
  source_dataset_sha256: string;
  source_uri: string;
  collected_at: string;
  records: readonly CnipaGazetteDataEngineAnnouncementRow[];
};

export type CnipaGazetteDataEngineAnnouncementRow = {
  source_row_id: string;
  source_search_id: string;
  registration_number: string;
  announcement_issue: number;
  announcement_type_code: string;
  announcement_type_name: string;
  detail_page_no: number | null;
  announcement_page_count: number | null;
  detail_file_id: string;
  detail_asset_path: string;
  announcement_detail_url: string;
};

export type CnipaGazetteDataEngineFinalizePackage = {
  contract_version: typeof CNIPA_GAZETTE_DE_FINALIZE_CONTRACT;
  source_authority: "CNIPA";
  query_scope: {
    announcement_type_selection: "ALL";
    annc_type: "";
  };
  announcement_issue: number;
  announcement_date: string;
  record_count: number;
  page_count: number;
  page_size: 100;
  source_capture_schema: typeof CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_SCHEMA;
  source_dataset_sha256: string;
  source_uri: string;
  collected_at: string;
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

function nonEmpty(value: string, label: string, maximum = 4096): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`${label} must be non-empty and at most ${maximum} characters`);
  }
  return normalized;
}

function isoDate(value: string | null, label: string): string {
  if (
    value === null ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  ) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return value;
}

function instant(value: string, label: string): string {
  const normalized = nonEmpty(value, label, 64);
  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error(`${label} must be an ISO-8601 instant`);
  }
  return normalized;
}

function sha256Text(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be 64 hexadecimal characters`);
  }
  return normalized;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function parseProjectionObservedAt(artifact: AcquiredCollectionArtifact): string {
  if (!artifact.canonicalUri?.endsWith("/projection")) {
    throw new Error("first page projection artifact has an unexpected canonical URI");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(artifact.content)) as unknown;
  } catch {
    throw new Error("first page projection artifact must contain valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("first page projection artifact must contain an object");
  }
  const observedAt = (parsed as Record<string, unknown>).observedAt;
  if (typeof observedAt !== "string") {
    throw new Error("first page projection artifact is missing observedAt");
  }
  return instant(observedAt, "captureStartedAt");
}

function firstPageArtifacts(result: CnipaGazetteCheckpointAcquisitionResult): {
  raw: AcquiredCollectionArtifact;
  projection: AcquiredCollectionArtifact;
} {
  if (result.checkpoint.range.startPage !== 1) {
    throw new Error("dataset identity must be created from the first checkpoint range");
  }
  const rawCanonical = `cnipa://trademark-gazette/issue/${result.checkpoint.announcementIssue}/list/page/1/raw`;
  const projectionCanonical = `cnipa://trademark-gazette/issue/${result.checkpoint.announcementIssue}/list/page/1/projection`;
  const raw = result.pageArtifacts.find((artifact) => artifact.canonicalUri === rawCanonical);
  const projection = result.pageArtifacts.find(
    (artifact) => artifact.canonicalUri === projectionCanonical,
  );
  if (!raw || !projection) {
    throw new Error("first checkpoint must contain page-1 raw and projection artifacts");
  }
  return { raw, projection };
}

export function buildCnipaGazetteDatasetIdentity(
  firstCheckpoint: CnipaGazetteCheckpointAcquisitionResult,
): CnipaGazetteDatasetIdentityEnvelope {
  const checkpoint = firstCheckpoint.checkpoint;
  const announcementIssue = positiveInteger(checkpoint.announcementIssue, "announcementIssue");
  const announcementDate = isoDate(checkpoint.announcementDate, "announcementDate");
  const sourceRecordCount = nonNegativeInteger(checkpoint.sourceTotal, "sourceTotal");
  const sourcePageCount = positiveInteger(checkpoint.sourcePages, "sourcePages");
  if (checkpoint.pageSize !== 100) {
    throw new Error("Gazette dataset identity requires pageSize=100");
  }
  const { raw, projection } = firstPageArtifacts(firstCheckpoint);
  const sourceUri = nonEmpty(raw.sourceUri, "sourceUri");
  const captureStartedAt = parseProjectionObservedAt(projection);
  const firstPageRawSha256 = sha256(raw.content);

  const identity: CnipaGazetteDatasetIdentity = {
    schemaVersion: CNIPA_GAZETTE_DATASET_IDENTITY_SCHEMA,
    sourceAuthority: "CNIPA",
    sourceFamily: "CNIPA_TRADEMARK_GAZETTE",
    queryScope: {
      announcementTypeSelection: "ALL",
      anncType: "",
    },
    announcementIssue,
    announcementDate,
    sourceRecordCount,
    sourcePageCount,
    pageSize: 100,
    sourceUri,
    captureStartedAt,
    firstPageRawSha256,
  };
  const sourceDatasetSha256 = sha256(canonicalJson(identity));
  const canonicalUri = `cnipa://trademark-gazette/issue/${announcementIssue}/dataset/${sourceDatasetSha256}`;
  const parents = [raw.canonicalUri, firstCheckpoint.checkpointArtifact.canonicalUri].filter(
    (value): value is string => Boolean(value),
  );

  const artifact: AcquiredCollectionArtifact = {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: `cnipa-gazette-issue-${announcementIssue}-dataset-identity.json`,
    sourceUri,
    canonicalUri,
    parentCanonicalUris: parents,
    content: new TextEncoder().encode(
      JSON.stringify({
        identity,
        sourceDatasetSha256,
      }),
    ),
  };

  return {
    identity,
    sourceDatasetSha256,
    artifact,
  };
}

function assertCheckpointMatchesIdentity(
  checkpoint: CnipaGazetteCheckpoint,
  identity: CnipaGazetteDatasetIdentityEnvelope,
): void {
  const expected = identity.identity;
  if (
    checkpoint.announcementIssue !== expected.announcementIssue ||
    checkpoint.announcementDate !== expected.announcementDate ||
    checkpoint.sourceTotal !== expected.sourceRecordCount ||
    checkpoint.sourcePages !== expected.sourcePageCount ||
    checkpoint.pageSize !== expected.pageSize
  ) {
    throw new Error("Gazette checkpoint metadata does not match dataset identity");
  }
  sha256Text(identity.sourceDatasetSha256, "sourceDatasetSha256");
}

function mapRow(row: CnipaGazetteRuntimeRow): CnipaGazetteDataEngineAnnouncementRow {
  return {
    source_row_id: nonEmpty(row.sourceRowId, "sourceRowId", 256),
    source_search_id: row.sourceSearchId.trim(),
    registration_number: nonEmpty(row.registrationNumber, "registrationNumber", 128),
    announcement_issue: positiveInteger(row.announcementIssue, "announcementIssue"),
    announcement_type_code: nonEmpty(row.announcementTypeCode, "announcementTypeCode", 128),
    announcement_type_name: row.announcementTypeName.trim(),
    detail_page_no: row.detailPageNo,
    announcement_page_count: row.announcementPageCount,
    detail_file_id: row.detailFileId.trim(),
    detail_asset_path: row.detailAssetPath.trim(),
    announcement_detail_url: row.announcementDetailUrl.trim(),
  };
}

export function buildCnipaGazetteDataEngineChunkPackage(input: {
  checkpoint: CnipaGazetteCheckpoint;
  datasetIdentity: CnipaGazetteDatasetIdentityEnvelope;
  collectedAt: string;
}): CnipaGazetteDataEngineChunkPackage {
  assertCheckpointMatchesIdentity(input.checkpoint, input.datasetIdentity);
  const collectedAt = instant(input.collectedAt, "collectedAt");
  const records = input.checkpoint.pages.flatMap((page) => page.rows.map(mapRow));
  if (records.length !== input.checkpoint.rowCount) {
    throw new Error("checkpoint rowCount does not match materialized records");
  }

  return {
    contract_version: CNIPA_GAZETTE_DE_CHUNK_CONTRACT,
    source_authority: "CNIPA",
    query_scope: {
      announcement_type_selection: "ALL",
      annc_type: "",
    },
    announcement_issue: input.checkpoint.announcementIssue,
    announcement_date: isoDate(input.checkpoint.announcementDate, "announcementDate"),
    source_record_count: input.checkpoint.sourceTotal,
    source_page_count: input.checkpoint.sourcePages,
    page_size: 100,
    range_start_page: input.checkpoint.range.startPage,
    range_end_page: input.checkpoint.range.endPage,
    page_row_counts: input.checkpoint.pages.map((page) => ({
      page_index: page.pageIndex,
      row_count: page.rows.length,
    })),
    chunk_row_count: records.length,
    source_capture_schema: CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_SCHEMA,
    source_dataset_sha256: input.datasetIdentity.sourceDatasetSha256,
    source_uri: input.datasetIdentity.identity.sourceUri,
    collected_at: collectedAt,
    records,
  };
}

export function buildCnipaGazetteDataEngineFinalizePackage(input: {
  datasetIdentity: CnipaGazetteDatasetIdentityEnvelope;
  collectedAt: string;
}): CnipaGazetteDataEngineFinalizePackage {
  const identity = input.datasetIdentity.identity;
  return {
    contract_version: CNIPA_GAZETTE_DE_FINALIZE_CONTRACT,
    source_authority: "CNIPA",
    query_scope: {
      announcement_type_selection: "ALL",
      annc_type: "",
    },
    announcement_issue: identity.announcementIssue,
    announcement_date: isoDate(identity.announcementDate, "announcementDate"),
    record_count: identity.sourceRecordCount,
    page_count: identity.sourcePageCount,
    page_size: 100,
    source_capture_schema: CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_SCHEMA,
    source_dataset_sha256: sha256Text(
      input.datasetIdentity.sourceDatasetSha256,
      "sourceDatasetSha256",
    ),
    source_uri: identity.sourceUri,
    collected_at: instant(input.collectedAt, "collectedAt"),
  };
}
