import type { AcquiredCollectionArtifact } from "./artifact-backed-collection-executor";
import type {
  CnipaGazetteChunkAdmissionReceipt,
  CnipaGazetteFinalizeAdmissionReceipt,
} from "./cnipa-gazette-data-engine-publisher";
import {
  CNIPA_GAZETTE_CHUNK_ADMISSION_PATH,
  CNIPA_GAZETTE_FINALIZE_ADMISSION_PATH,
} from "./cnipa-gazette-data-engine-publisher";
import type {
  CnipaGazetteDataEngineChunkPackage,
  CnipaGazetteDataEngineFinalizePackage,
} from "./cnipa-gazette-data-engine-handoff";

export const CNIPA_GAZETTE_FACT_ADMISSION_REQUEST_SCHEMA =
  "CNIPA_GAZETTE_FACT_ADMISSION_REQUEST_V1" as const;
export const CNIPA_GAZETTE_FACT_ADMISSION_RECEIPT_SCHEMA =
  "CNIPA_GAZETTE_FACT_ADMISSION_RECEIPT_V1" as const;

export type CnipaGazetteFactAdmissionOperation = "CHUNK" | "FINALIZE";

export type CnipaGazetteChunkAdmissionRequestEnvelope = {
  schemaVersion: typeof CNIPA_GAZETTE_FACT_ADMISSION_REQUEST_SCHEMA;
  operation: "CHUNK";
  method: "POST";
  path: typeof CNIPA_GAZETTE_CHUNK_ADMISSION_PATH;
  createdAt: string;
  sourceDatasetSha256: string;
  announcementIssue: number;
  range: {
    startPage: number;
    endPage: number;
  };
  payload: CnipaGazetteDataEngineChunkPackage;
};

export type CnipaGazetteFinalizeAdmissionRequestEnvelope = {
  schemaVersion: typeof CNIPA_GAZETTE_FACT_ADMISSION_REQUEST_SCHEMA;
  operation: "FINALIZE";
  method: "POST";
  path: typeof CNIPA_GAZETTE_FINALIZE_ADMISSION_PATH;
  createdAt: string;
  sourceDatasetSha256: string;
  announcementIssue: number;
  pageCount: number;
  payload: CnipaGazetteDataEngineFinalizePackage;
};

export type CnipaGazetteFactAdmissionRequestEnvelope =
  CnipaGazetteChunkAdmissionRequestEnvelope | CnipaGazetteFinalizeAdmissionRequestEnvelope;

export type CnipaGazetteChunkAdmissionReceiptEnvelope = {
  schemaVersion: typeof CNIPA_GAZETTE_FACT_ADMISSION_RECEIPT_SCHEMA;
  operation: "CHUNK";
  observedAt: string;
  requestCanonicalUri: string;
  path: typeof CNIPA_GAZETTE_CHUNK_ADMISSION_PATH;
  sourceDatasetSha256: string;
  announcementIssue: number;
  range: {
    startPage: number;
    endPage: number;
  };
  receipt: CnipaGazetteChunkAdmissionReceipt;
};

export type CnipaGazetteFinalizeAdmissionReceiptEnvelope = {
  schemaVersion: typeof CNIPA_GAZETTE_FACT_ADMISSION_RECEIPT_SCHEMA;
  operation: "FINALIZE";
  observedAt: string;
  requestCanonicalUri: string;
  path: typeof CNIPA_GAZETTE_FINALIZE_ADMISSION_PATH;
  sourceDatasetSha256: string;
  announcementIssue: number;
  pageCount: number;
  receipt: CnipaGazetteFinalizeAdmissionReceipt;
};

export type CnipaGazetteFactAdmissionReceiptEnvelope =
  CnipaGazetteChunkAdmissionReceiptEnvelope | CnipaGazetteFinalizeAdmissionReceiptEnvelope;

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function nonEmpty(value: unknown, label: string, maximum = 4096): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`${label} must be non-empty and at most ${maximum} characters`);
  }
  return normalized;
}

function instant(value: unknown, label: string): string {
  const normalized = nonEmpty(value, label, 64);
  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error(`${label} must be an ISO-8601 instant`);
  }
  return normalized;
}

function sha256Text(value: unknown, label: string): string {
  const normalized = nonEmpty(value, label, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be 64 hexadecimal characters`);
  }
  return normalized;
}

function canonicalUri(value: unknown, label: string): string {
  const normalized = nonEmpty(value, label);
  if (!/^[a-z][a-z0-9+.-]*:\/\//iu.test(normalized)) {
    throw new Error(`${label} must be an absolute canonical URI`);
  }
  return normalized;
}

function parseJsonArtifact(artifact: AcquiredCollectionArtifact, label: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(artifact.content)) as unknown;
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
  return record(parsed, label);
}

function dataEngineTargetUri(path: string): string {
  return `markorbit://data-engine${path}`;
}

function datasetRoot(issue: number, sha: string): string {
  return `cnipa://trademark-gazette/issue/${issue}/dataset/${sha}/fact-admission`;
}

function assertAllScope(payload: JsonRecord, label: string): void {
  const sourceAuthority = payload.source_authority;
  if (sourceAuthority !== "CNIPA") {
    throw new Error(`${label}.source_authority must be CNIPA`);
  }
  const scope = record(payload.query_scope, `${label}.query_scope`);
  if (scope.announcement_type_selection !== "ALL" || scope.annc_type !== "") {
    throw new Error(`${label}.query_scope must be ALL with annc_type=""`);
  }
}

function assertChunkPackage(payload: CnipaGazetteDataEngineChunkPackage): void {
  const raw = record(payload, "chunk payload");
  if (raw.contract_version !== "CN_TRADEMARK_GAZETTE_ADMISSION_CHUNK_V1") {
    throw new Error("chunk payload contract_version is invalid");
  }
  assertAllScope(raw, "chunk payload");
  positiveInteger(raw.announcement_issue, "chunk payload.announcement_issue");
  sha256Text(raw.source_dataset_sha256, "chunk payload.source_dataset_sha256");
  const start = positiveInteger(raw.range_start_page, "chunk payload.range_start_page");
  const end = positiveInteger(raw.range_end_page, "chunk payload.range_end_page");
  if (end < start) {
    throw new Error("chunk payload range_end_page must be >= range_start_page");
  }
}

function assertFinalizePackage(payload: CnipaGazetteDataEngineFinalizePackage): void {
  const raw = record(payload, "finalize payload");
  if (raw.contract_version !== "CN_TRADEMARK_GAZETTE_ADMISSION_FINALIZE_V1") {
    throw new Error("finalize payload contract_version is invalid");
  }
  assertAllScope(raw, "finalize payload");
  positiveInteger(raw.announcement_issue, "finalize payload.announcement_issue");
  positiveInteger(raw.page_count, "finalize payload.page_count");
  sha256Text(raw.source_dataset_sha256, "finalize payload.source_dataset_sha256");
}

export function buildCnipaGazetteChunkAdmissionRequestArtifact(input: {
  package: CnipaGazetteDataEngineChunkPackage;
  datasetIdentityCanonicalUri: string;
  checkpointCanonicalUri: string;
  createdAt: string;
}): AcquiredCollectionArtifact {
  assertChunkPackage(input.package);
  const issue = input.package.announcement_issue;
  const datasetSha = sha256Text(input.package.source_dataset_sha256, "sourceDatasetSha256");
  const startPage = input.package.range_start_page;
  const endPage = input.package.range_end_page;
  const createdAt = instant(input.createdAt, "createdAt");
  const identityUri = canonicalUri(
    input.datasetIdentityCanonicalUri,
    "datasetIdentityCanonicalUri",
  );
  const checkpointUri = canonicalUri(input.checkpointCanonicalUri, "checkpointCanonicalUri");
  const expectedIdentityPrefix = `cnipa://trademark-gazette/issue/${issue}/dataset/${datasetSha}`;
  if (identityUri !== expectedIdentityPrefix) {
    throw new Error("dataset identity canonical URI does not match chunk package");
  }
  const expectedCheckpointPrefix = `cnipa://trademark-gazette/issue/${issue}/checkpoint/${startPage}-${endPage}`;
  if (checkpointUri !== expectedCheckpointPrefix) {
    throw new Error("checkpoint canonical URI does not match chunk range");
  }

  const envelope: CnipaGazetteChunkAdmissionRequestEnvelope = {
    schemaVersion: CNIPA_GAZETTE_FACT_ADMISSION_REQUEST_SCHEMA,
    operation: "CHUNK",
    method: "POST",
    path: CNIPA_GAZETTE_CHUNK_ADMISSION_PATH,
    createdAt,
    sourceDatasetSha256: datasetSha,
    announcementIssue: issue,
    range: { startPage, endPage },
    payload: input.package,
  };
  const canonical = `${datasetRoot(issue, datasetSha)}/chunk/${startPage}-${endPage}/request`;
  return {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: `cnipa-gazette-issue-${issue}-chunk-${startPage}-${endPage}-fact-admission-request.json`,
    sourceUri: dataEngineTargetUri(CNIPA_GAZETTE_CHUNK_ADMISSION_PATH),
    canonicalUri: canonical,
    parentCanonicalUris: [identityUri, checkpointUri].sort(),
    content: new TextEncoder().encode(JSON.stringify(envelope)),
  };
}

export function parseCnipaGazetteFactAdmissionRequestArtifact(
  artifact: AcquiredCollectionArtifact,
): CnipaGazetteFactAdmissionRequestEnvelope {
  const raw = parseJsonArtifact(artifact, "Gazette fact-admission request artifact");
  if (raw.schemaVersion !== CNIPA_GAZETTE_FACT_ADMISSION_REQUEST_SCHEMA) {
    throw new Error("Gazette fact-admission request schemaVersion is invalid");
  }
  if (raw.method !== "POST") {
    throw new Error("Gazette fact-admission request method must be POST");
  }
  const operation = raw.operation;
  if (operation === "CHUNK") {
    if (raw.path !== CNIPA_GAZETTE_CHUNK_ADMISSION_PATH) {
      throw new Error("Gazette CHUNK request path is invalid");
    }
    const payload = record(raw.payload, "Gazette CHUNK request payload");
    assertChunkPackage(payload as unknown as CnipaGazetteDataEngineChunkPackage);
    const issue = positiveInteger(raw.announcementIssue, "announcementIssue");
    const sha = sha256Text(raw.sourceDatasetSha256, "sourceDatasetSha256");
    const range = record(raw.range, "range");
    const startPage = positiveInteger(range.startPage, "range.startPage");
    const endPage = positiveInteger(range.endPage, "range.endPage");
    if (
      issue !== payload.announcement_issue ||
      sha !== payload.source_dataset_sha256 ||
      startPage !== payload.range_start_page ||
      endPage !== payload.range_end_page
    ) {
      throw new Error("Gazette CHUNK request metadata does not match payload");
    }
    return {
      schemaVersion: CNIPA_GAZETTE_FACT_ADMISSION_REQUEST_SCHEMA,
      operation: "CHUNK",
      method: "POST",
      path: CNIPA_GAZETTE_CHUNK_ADMISSION_PATH,
      createdAt: instant(raw.createdAt, "createdAt"),
      sourceDatasetSha256: sha,
      announcementIssue: issue,
      range: { startPage, endPage },
      payload: payload as unknown as CnipaGazetteDataEngineChunkPackage,
    };
  }
  if (operation === "FINALIZE") {
    if (raw.path !== CNIPA_GAZETTE_FINALIZE_ADMISSION_PATH) {
      throw new Error("Gazette FINALIZE request path is invalid");
    }
    const payload = record(raw.payload, "Gazette FINALIZE request payload");
    assertFinalizePackage(payload as unknown as CnipaGazetteDataEngineFinalizePackage);
    const issue = positiveInteger(raw.announcementIssue, "announcementIssue");
    const sha = sha256Text(raw.sourceDatasetSha256, "sourceDatasetSha256");
    const pageCount = positiveInteger(raw.pageCount, "pageCount");
    if (
      issue !== payload.announcement_issue ||
      sha !== payload.source_dataset_sha256 ||
      pageCount !== payload.page_count
    ) {
      throw new Error("Gazette FINALIZE request metadata does not match payload");
    }
    return {
      schemaVersion: CNIPA_GAZETTE_FACT_ADMISSION_REQUEST_SCHEMA,
      operation: "FINALIZE",
      method: "POST",
      path: CNIPA_GAZETTE_FINALIZE_ADMISSION_PATH,
      createdAt: instant(raw.createdAt, "createdAt"),
      sourceDatasetSha256: sha,
      announcementIssue: issue,
      pageCount,
      payload: payload as unknown as CnipaGazetteDataEngineFinalizePackage,
    };
  }
  throw new Error("Gazette fact-admission request operation is invalid");
}

export function buildCnipaGazetteFactAdmissionReceiptArtifact(input: {
  requestArtifact: AcquiredCollectionArtifact;
  receipt: CnipaGazetteChunkAdmissionReceipt | CnipaGazetteFinalizeAdmissionReceipt;
  observedAt: string;
}): AcquiredCollectionArtifact {
  const request = parseCnipaGazetteFactAdmissionRequestArtifact(input.requestArtifact);
  const requestCanonicalUri = canonicalUri(
    input.requestArtifact.canonicalUri,
    "requestArtifact.canonicalUri",
  );
  const observedAt = instant(input.observedAt, "observedAt");

  if (request.operation === "CHUNK") {
    if (input.receipt.outcome !== "CHUNK_ADMITTED") {
      throw new Error("Gazette CHUNK receipt outcome must be CHUNK_ADMITTED");
    }
    if (
      input.receipt.source_dataset_sha256 !== undefined &&
      input.receipt.source_dataset_sha256 !== request.sourceDatasetSha256
    ) {
      throw new Error("Gazette CHUNK receipt dataset identity mismatch");
    }
    if (
      input.receipt.announcement_issue !== undefined &&
      input.receipt.announcement_issue !== request.announcementIssue
    ) {
      throw new Error("Gazette CHUNK receipt issue mismatch");
    }
    if (
      input.receipt.range_start_page !== undefined &&
      input.receipt.range_start_page !== request.range.startPage
    ) {
      throw new Error("Gazette CHUNK receipt start-page mismatch");
    }
    if (
      input.receipt.range_end_page !== undefined &&
      input.receipt.range_end_page !== request.range.endPage
    ) {
      throw new Error("Gazette CHUNK receipt end-page mismatch");
    }

    const envelope: CnipaGazetteChunkAdmissionReceiptEnvelope = {
      schemaVersion: CNIPA_GAZETTE_FACT_ADMISSION_RECEIPT_SCHEMA,
      operation: "CHUNK",
      observedAt,
      requestCanonicalUri,
      path: CNIPA_GAZETTE_CHUNK_ADMISSION_PATH,
      sourceDatasetSha256: request.sourceDatasetSha256,
      announcementIssue: request.announcementIssue,
      range: request.range,
      receipt: input.receipt,
    };
    return {
      artifactKind: "JSON",
      mimeType: "application/json;charset=UTF-8",
      originalName: `cnipa-gazette-issue-${request.announcementIssue}-chunk-${request.range.startPage}-${request.range.endPage}-fact-admission-receipt.json`,
      sourceUri: dataEngineTargetUri(CNIPA_GAZETTE_CHUNK_ADMISSION_PATH),
      canonicalUri: requestCanonicalUri.replace(/\/request$/u, "/receipt"),
      parentCanonicalUris: [requestCanonicalUri],
      content: new TextEncoder().encode(JSON.stringify(envelope)),
    };
  }

  if (input.receipt.outcome !== "ADMITTED") {
    throw new Error("Gazette FINALIZE receipt outcome must be ADMITTED");
  }
  if (
    input.receipt.source_dataset_sha256 !== undefined &&
    input.receipt.source_dataset_sha256 !== request.sourceDatasetSha256
  ) {
    throw new Error("Gazette FINALIZE receipt dataset identity mismatch");
  }
  if (
    input.receipt.announcement_issue !== undefined &&
    input.receipt.announcement_issue !== request.announcementIssue
  ) {
    throw new Error("Gazette FINALIZE receipt issue mismatch");
  }
  if (input.receipt.page_count !== undefined && input.receipt.page_count !== request.pageCount) {
    throw new Error("Gazette FINALIZE receipt page-count mismatch");
  }

  const envelope: CnipaGazetteFinalizeAdmissionReceiptEnvelope = {
    schemaVersion: CNIPA_GAZETTE_FACT_ADMISSION_RECEIPT_SCHEMA,
    operation: "FINALIZE",
    observedAt,
    requestCanonicalUri,
    path: CNIPA_GAZETTE_FINALIZE_ADMISSION_PATH,
    sourceDatasetSha256: request.sourceDatasetSha256,
    announcementIssue: request.announcementIssue,
    pageCount: request.pageCount,
    receipt: input.receipt,
  };
  return {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: `cnipa-gazette-issue-${request.announcementIssue}-fact-admission-finalize-receipt.json`,
    sourceUri: dataEngineTargetUri(CNIPA_GAZETTE_FINALIZE_ADMISSION_PATH),
    canonicalUri: requestCanonicalUri.replace(/\/request$/u, "/receipt"),
    parentCanonicalUris: [requestCanonicalUri],
    content: new TextEncoder().encode(JSON.stringify(envelope)),
  };
}

export function parseCnipaGazetteFactAdmissionReceiptArtifact(
  artifact: AcquiredCollectionArtifact,
): CnipaGazetteFactAdmissionReceiptEnvelope {
  const raw = parseJsonArtifact(artifact, "Gazette fact-admission receipt artifact");
  if (raw.schemaVersion !== CNIPA_GAZETTE_FACT_ADMISSION_RECEIPT_SCHEMA) {
    throw new Error("Gazette fact-admission receipt schemaVersion is invalid");
  }
  const operation = raw.operation;
  const requestCanonicalUri = canonicalUri(raw.requestCanonicalUri, "requestCanonicalUri");
  const sourceDatasetSha256 = sha256Text(raw.sourceDatasetSha256, "sourceDatasetSha256");
  const announcementIssue = positiveInteger(raw.announcementIssue, "announcementIssue");
  const observedAt = instant(raw.observedAt, "observedAt");
  const receipt = record(raw.receipt, "receipt");

  if (operation === "CHUNK") {
    if (raw.path !== CNIPA_GAZETTE_CHUNK_ADMISSION_PATH || receipt.outcome !== "CHUNK_ADMITTED") {
      throw new Error("Gazette CHUNK receipt artifact is invalid");
    }
    const range = record(raw.range, "range");
    return {
      schemaVersion: CNIPA_GAZETTE_FACT_ADMISSION_RECEIPT_SCHEMA,
      operation: "CHUNK",
      observedAt,
      requestCanonicalUri,
      path: CNIPA_GAZETTE_CHUNK_ADMISSION_PATH,
      sourceDatasetSha256,
      announcementIssue,
      range: {
        startPage: positiveInteger(range.startPage, "range.startPage"),
        endPage: positiveInteger(range.endPage, "range.endPage"),
      },
      receipt: receipt as unknown as CnipaGazetteChunkAdmissionReceipt,
    };
  }
  if (operation === "FINALIZE") {
    if (raw.path !== CNIPA_GAZETTE_FINALIZE_ADMISSION_PATH || receipt.outcome !== "ADMITTED") {
      throw new Error("Gazette FINALIZE receipt artifact is invalid");
    }
    return {
      schemaVersion: CNIPA_GAZETTE_FACT_ADMISSION_RECEIPT_SCHEMA,
      operation: "FINALIZE",
      observedAt,
      requestCanonicalUri,
      path: CNIPA_GAZETTE_FINALIZE_ADMISSION_PATH,
      sourceDatasetSha256,
      announcementIssue,
      pageCount: positiveInteger(raw.pageCount, "pageCount"),
      receipt: receipt as unknown as CnipaGazetteFinalizeAdmissionReceipt,
    };
  }
  throw new Error("Gazette fact-admission receipt operation is invalid");
}

export function buildCnipaGazetteFinalizeAdmissionRequestArtifact(input: {
  package: CnipaGazetteDataEngineFinalizePackage;
  datasetIdentityCanonicalUri: string;
  chunkReceiptArtifacts: readonly AcquiredCollectionArtifact[];
  createdAt: string;
}): AcquiredCollectionArtifact {
  assertFinalizePackage(input.package);
  const issue = input.package.announcement_issue;
  const datasetSha = sha256Text(input.package.source_dataset_sha256, "sourceDatasetSha256");
  const pageCount = input.package.page_count;
  const identityUri = canonicalUri(
    input.datasetIdentityCanonicalUri,
    "datasetIdentityCanonicalUri",
  );
  const expectedIdentity = `cnipa://trademark-gazette/issue/${issue}/dataset/${datasetSha}`;
  if (identityUri !== expectedIdentity) {
    throw new Error("dataset identity canonical URI does not match finalize package");
  }
  if (input.chunkReceiptArtifacts.length === 0) {
    throw new Error("finalize request requires committed chunk receipt artifacts");
  }

  const receipts = input.chunkReceiptArtifacts
    .map((artifact) => ({
      artifact,
      parsed: parseCnipaGazetteFactAdmissionReceiptArtifact(artifact),
    }))
    .sort((left, right) => {
      if (left.parsed.operation !== "CHUNK") return 1;
      if (right.parsed.operation !== "CHUNK") return -1;
      return left.parsed.range.startPage - right.parsed.range.startPage;
    });

  let nextPage = 1;
  const parentUris = [identityUri];
  for (const { artifact, parsed } of receipts) {
    if (parsed.operation !== "CHUNK") {
      throw new Error("finalize request parents must be CHUNK receipt artifacts");
    }
    if (parsed.sourceDatasetSha256 !== datasetSha || parsed.announcementIssue !== issue) {
      throw new Error("chunk receipt does not belong to finalize dataset");
    }
    if (parsed.range.startPage !== nextPage) {
      throw new Error(
        `chunk receipt coverage gap/overlap: expected page ${nextPage}, got ${parsed.range.startPage}`,
      );
    }
    if (parsed.range.endPage < parsed.range.startPage) {
      throw new Error("chunk receipt range is invalid");
    }
    nextPage = parsed.range.endPage + 1;
    parentUris.push(canonicalUri(artifact.canonicalUri, "chunkReceiptArtifact.canonicalUri"));
  }
  if (nextPage !== pageCount + 1) {
    throw new Error(`chunk receipt coverage ends at page ${nextPage - 1}, expected ${pageCount}`);
  }

  const envelope: CnipaGazetteFinalizeAdmissionRequestEnvelope = {
    schemaVersion: CNIPA_GAZETTE_FACT_ADMISSION_REQUEST_SCHEMA,
    operation: "FINALIZE",
    method: "POST",
    path: CNIPA_GAZETTE_FINALIZE_ADMISSION_PATH,
    createdAt: instant(input.createdAt, "createdAt"),
    sourceDatasetSha256: datasetSha,
    announcementIssue: issue,
    pageCount,
    payload: input.package,
  };
  const canonical = `${datasetRoot(issue, datasetSha)}/finalize/request`;
  return {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: `cnipa-gazette-issue-${issue}-fact-admission-finalize-request.json`,
    sourceUri: dataEngineTargetUri(CNIPA_GAZETTE_FINALIZE_ADMISSION_PATH),
    canonicalUri: canonical,
    parentCanonicalUris: [...new Set(parentUris)].sort(),
    content: new TextEncoder().encode(JSON.stringify(envelope)),
  };
}
