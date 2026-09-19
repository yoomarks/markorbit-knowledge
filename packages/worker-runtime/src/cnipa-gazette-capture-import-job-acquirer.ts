import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ExecutionExecutor } from "@markorbit/contracts";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import { CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_SCHEMA } from "./cnipa-gazette-checkpoint-acquirer";
import {
  buildCnipaGazetteCheckpoint,
  planCnipaGazettePageRanges,
  type CnipaGazettePageResult,
} from "./cnipa-gazette-checkpoint-runtime";
import {
  buildCnipaGazetteDataEngineChunkPackage,
  buildCnipaGazetteDatasetIdentity,
} from "./cnipa-gazette-data-engine-handoff";
import { buildCnipaGazetteChunkAdmissionRequestArtifact } from "./cnipa-gazette-fact-admission-artifacts";
import {
  CNIPA_GAZETTE_PAGE_EVIDENCE_SCHEMA,
  CNIPA_GAZETTE_PUBLIC_ORIGIN,
  validateAndNormalizeCnipaGazettePagePayload,
} from "./cnipa-gazette-page-acquirer";
import { CNIPA_GAZETTE_ENDPOINTS } from "./cnipa-trademark-gazette";

export const CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_ID = "cnipa-gazette-capture-import";
export const CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_VERSION = "1.0.0";
export const CNIPA_GAZETTE_CAPTURE_IMPORT_SOURCE =
  "markorbit://knowledge/cnipa-gazette/browser-capture-import";
export const CNIPA_GAZETTE_SMALL_COMPLETE_SCHEMA = "mo-cnipa-gazette-small-complete-v1";
export const CNIPA_GAZETTE_CAPTURE_IMPORT_PAGE_SCHEMA = "CNIPA_GAZETTE_CAPTURE_IMPORT_PAGE_V1";

export const CNIPA_GAZETTE_CAPTURE_IMPORT_EXECUTOR: ExecutionExecutor = {
  executorId: CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_ID,
  version: CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_VERSION,
  mode: "PRODUCTION",
};
type CaptureImportConfig = {
  announcementIssue: number;
  announcementDate: string;
  captureFilePath: string;
  captureSha256: string;
  captureToolVersion: string;
};

type ParsedCapture = {
  tool: "MO CNIPA Network Capture";
  version: string;
  exportedAt: string;
  announcementIssue: number;
  announcementDate: string;
  query: Record<string, unknown>;
  sourceUrl: string;
  sourceTotal: number;
  sourcePages: number;
  pageSize: 100;
  records: ReadonlyArray<Record<string, unknown>>;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, maximum = 4096): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`${label} must be non-empty and at most ${maximum} characters`);
  }
  return normalized;
}

function integer(value: unknown, label: string, minimum = 0): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/u.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}`);
  }
  return parsed;
}

function instant(value: unknown, label: string): string {
  const normalized = text(value, label, 64);
  if (Number.isNaN(Date.parse(normalized))) throw new Error(`${label} must be an ISO instant`);
  return normalized;
}
function isoDate(value: unknown, label: string): string {
  const normalized = text(value, label, 32);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(normalized) ||
    Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))
  ) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return normalized;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  const accepted = new Set(allowed);
  const extra = Object.keys(value).filter((key) => !accepted.has(key));
  if (extra.length) throw new Error(`${label} contains unsupported keys: ${extra.join(", ")}`);
}

function canonicalSourceUrl(value: string): string {
  const url = new URL(value);
  if (url.origin !== CNIPA_GAZETTE_PUBLIC_ORIGIN || url.pathname !== CNIPA_GAZETTE_ENDPOINTS.list) {
    throw new Error("capture sourceUrl must be the canonical CNIPA Gazette LIST endpoint");
  }
  return `${url.origin}${url.pathname}`;
}
function parseCapture(
  bytes: Uint8Array,
  expected: Pick<
    CaptureImportConfig,
    "announcementIssue" | "announcementDate" | "captureToolVersion"
  >,
): ParsedCapture {
  let rootValue: unknown;
  try {
    rootValue = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new Error("capture file must contain valid UTF-8 JSON");
  }
  const root = record(rootValue, "capture");
  if (root.exportedSchema !== CNIPA_GAZETTE_SMALL_COMPLETE_SCHEMA) {
    throw new Error(`capture.exportedSchema must equal ${CNIPA_GAZETTE_SMALL_COMPLETE_SCHEMA}`);
  }
  if (root.tool !== "MO CNIPA Network Capture") {
    throw new Error("capture.tool must equal MO CNIPA Network Capture");
  }
  if (root.version !== expected.captureToolVersion) {
    throw new Error("capture.version does not match the frozen acceptance plan");
  }
  if (root.kind !== "gazette_small_issue_complete") {
    throw new Error("capture.kind must equal gazette_small_issue_complete");
  }
  if (root.completeness !== "COMPLETE") {
    throw new Error("capture.completeness must equal COMPLETE");
  }
  const announcementIssue = integer(root.announcementIssue, "capture.announcementIssue", 1);
  if (announcementIssue !== expected.announcementIssue) {
    throw new Error("capture announcement issue does not match the frozen acceptance plan");
  }
  const sourceTotal = integer(root.sourceTotal, "capture.sourceTotal", 0);
  const sourcePages = integer(root.sourcePages, "capture.sourcePages", 1);
  const pageSize = integer(root.pageSize, "capture.pageSize", 1);
  if (pageSize !== 100) throw new Error("capture.pageSize must equal 100");
  if (sourcePages > 100) throw new Error("capture import currently supports at most 100 pages");
  const records = Array.isArray(root.records)
    ? root.records.map((item, index) => record(item, `capture.records[${index}]`))
    : (() => {
        throw new Error("capture.records must be an array");
      })();
  if (
    integer(root.collectedCount, "capture.collectedCount", 0) !== sourceTotal ||
    integer(root.uniqueOfficialRowIds, "capture.uniqueOfficialRowIds", 0) !== sourceTotal ||
    records.length !== sourceTotal
  ) {
    throw new Error("capture total/count/unique-id metadata is inconsistent");
  }
  const expectedPages = Math.max(1, Math.ceil(sourceTotal / 100));
  if (sourcePages !== expectedPages) {
    throw new Error("capture.sourcePages does not match sourceTotal/pageSize");
  }
  const expectedLast = sourceTotal === 0 ? 0 : sourceTotal % 100 || 100;
  if (
    integer(root.expectedLastPageLength, "capture.expectedLastPageLength", 0) !== expectedLast ||
    integer(root.observedLastPageLength, "capture.observedLastPageLength", 0) !== expectedLast
  ) {
    throw new Error("capture last-page metadata is inconsistent");
  }

  const query = record(root.query, "capture.query");
  if (
    String(query.anncIssue ?? "").trim() !== String(announcementIssue) ||
    query.anncType !== "" ||
    query.pageIndex !== 1 ||
    query.pageSize !== 100
  ) {
    throw new Error("capture query must be issue + ALL + pageIndex 1 + pageSize 100");
  }

  const ids = new Set<string>();
  const dates = new Set<string>();
  for (const [index, row] of records.entries()) {
    const id = text(row.id, `capture.records[${index}].id`, 256);
    if (ids.has(id)) throw new Error(`capture contains duplicate official row id: ${id}`);
    ids.add(id);
    if (row.searchId != null && String(row.searchId).trim() !== id) {
      throw new Error(`capture.records[${index}].searchId does not match id`);
    }
    if (integer(row.anncIssue, `capture.records[${index}].anncIssue`, 1) !== announcementIssue) {
      throw new Error(`capture.records[${index}] belongs to a different issue`);
    }
    dates.add(isoDate(row.anncDate, `capture.records[${index}].anncDate`));
  }
  if (ids.size !== sourceTotal) throw new Error("capture official row ids are incomplete");
  if (dates.size !== 1) throw new Error("capture announcement dates are not uniform");
  const announcementDate = dates.values().next().value!;
  if (announcementDate !== expected.announcementDate) {
    throw new Error("capture announcement date does not match the frozen acceptance plan");
  }

  return {
    tool: "MO CNIPA Network Capture",
    version: expected.captureToolVersion,
    exportedAt: instant(root.exportedAt, "capture.exportedAt"),
    announcementIssue,
    announcementDate,
    query,
    sourceUrl: canonicalSourceUrl(text(root.sourceUrl, "capture.sourceUrl")),
    sourceTotal,
    sourcePages,
    pageSize: 100,
    records,
  };
}

function pageRawArtifact(input: {
  capture: ParsedCapture;
  captureCanonicalUri: string;
  captureSha256: string;
  pageIndex: number;
  records: ReadonlyArray<Record<string, unknown>>;
}): AcquiredCollectionArtifact {
  const canonicalUri = `cnipa://trademark-gazette/issue/${input.capture.announcementIssue}/list/page/${input.pageIndex}/raw`;
  return {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: `cnipa-gazette-issue-${input.capture.announcementIssue}-capture-page-${input.pageIndex}.json`,
    sourceUri: input.capture.sourceUrl,
    canonicalUri,
    parentCanonicalUris: [input.captureCanonicalUri],
    content: canonicalJson({
      schemaVersion: CNIPA_GAZETTE_CAPTURE_IMPORT_PAGE_SCHEMA,
      sourceOwner: "MARKORBIT_KNOWLEDGE",
      sourceFamily: "CNIPA_TRADEMARK_GAZETTE",
      capture: {
        canonicalUri: input.captureCanonicalUri,
        sha256: input.captureSha256,
        tool: input.capture.tool,
        version: input.capture.version,
        exportedAt: input.capture.exportedAt,
      },
      announcementIssue: input.capture.announcementIssue,
      announcementDate: input.capture.announcementDate,
      pageIndex: input.pageIndex,
      pageSize: 100,
      sourceTotal: input.capture.sourceTotal,
      sourcePages: input.capture.sourcePages,
      records: input.records,
    }),
  };
}

function pageProjectionArtifact(input: {
  capture: ParsedCapture;
  page: CnipaGazettePageResult;
  rawCanonicalUri: string;
}): AcquiredCollectionArtifact {
  const canonicalUri = `cnipa://trademark-gazette/issue/${input.capture.announcementIssue}/list/page/${input.page.pageIndex}/projection`;
  const requestBody = { ...input.capture.query, pageIndex: input.page.pageIndex, pageSize: 100 };
  return {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: `cnipa-gazette-issue-${input.capture.announcementIssue}-projection-p${input.page.pageIndex}.json`,
    sourceUri: input.capture.sourceUrl,
    canonicalUri,
    parentCanonicalUris: [input.rawCanonicalUri],
    content: canonicalJson({
      schemaVersion: CNIPA_GAZETTE_PAGE_EVIDENCE_SCHEMA,
      sourceOwner: "MARKORBIT_KNOWLEDGE",
      sourceFamily: "CNIPA_TRADEMARK_GAZETTE",
      acquisitionMechanism: "MO_CNIPA_NETWORK_CAPTURE_IMPORT",
      announcementIssue: input.capture.announcementIssue,
      pageIndex: input.page.pageIndex,
      pageSize: 100,
      observedAt: input.capture.exportedAt,
      request: {
        method: "POST",
        path: CNIPA_GAZETTE_ENDPOINTS.list,
        body: requestBody,
      },
      sourceRawCanonicalUri: input.rawCanonicalUri,
      page: input.page,
    }),
  };
}

function buildCheckpointResult(
  capture: ParsedCapture,
  pageArtifacts: AcquiredCollectionArtifact[],
  pages: CnipaGazettePageResult[],
) {
  const range = { startPage: 1, endPage: capture.sourcePages };
  const checkpoint = buildCnipaGazetteCheckpoint({
    announcementIssue: capture.announcementIssue,
    range,
    pages,
  });
  const plannedRanges = planCnipaGazettePageRanges({
    sourcePages: capture.sourcePages,
    pagesPerCheckpoint: capture.sourcePages,
  });
  const parentCanonicalUris = pageArtifacts
    .filter((artifact) => artifact.canonicalUri?.endsWith("/projection"))
    .map((artifact) => artifact.canonicalUri!)
    .sort();
  const checkpointCanonicalUri = `cnipa://trademark-gazette/issue/${capture.announcementIssue}/checkpoint/1-${capture.sourcePages}`;
  const checkpointArtifact: AcquiredCollectionArtifact = {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: `cnipa-gazette-issue-${capture.announcementIssue}-checkpoint-1-${capture.sourcePages}.json`,
    sourceUri: capture.sourceUrl,
    canonicalUri: checkpointCanonicalUri,
    parentCanonicalUris,
    content: canonicalJson({
      schemaVersion: CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_SCHEMA,
      sourceOwner: "MARKORBIT_KNOWLEDGE",
      sourceFamily: "CNIPA_TRADEMARK_GAZETTE",
      queryScope: { announcementTypeSelection: "ALL", anncType: "" },
      acquisitionMechanism: "MO_CNIPA_NETWORK_CAPTURE_IMPORT",
      announcementIssue: capture.announcementIssue,
      sourceTotal: capture.sourceTotal,
      sourcePages: capture.sourcePages,
      announcementDate: capture.announcementDate,
      pageSize: 100,
      range,
      checkpoint,
      plannedRanges,
    }),
  };
  return { checkpoint, checkpointArtifact, pageArtifacts, plannedRanges };
}

export async function importCnipaGazetteSmallCompleteCapture(
  config: CaptureImportConfig,
): Promise<AcquiredCollectionArtifact[]> {
  if (!path.isAbsolute(config.captureFilePath)) {
    throw new Error("captureFilePath must be absolute");
  }
  const bytes = new Uint8Array(await readFile(config.captureFilePath));
  if (bytes.byteLength < 2 || bytes.byteLength > 64 * 1024 * 1024) {
    throw new Error("capture file size must be between 2 bytes and 64 MiB");
  }
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== config.captureSha256) {
    throw new Error("capture file SHA-256 does not match the frozen acceptance plan");
  }
  const capture = parseCapture(bytes, config);
  const captureCanonicalUri = `cnipa://trademark-gazette/issue/${capture.announcementIssue}/browser-capture/${actualSha256}`;
  const captureArtifact: AcquiredCollectionArtifact = {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: `cnipa-gazette-issue-${capture.announcementIssue}-browser-capture-${capture.version}.json`,
    sourceUri: capture.sourceUrl,
    canonicalUri: captureCanonicalUri,
    content: bytes,
  };

  const pageArtifacts: AcquiredCollectionArtifact[] = [];
  const pages: CnipaGazettePageResult[] = [];
  for (let pageIndex = 1; pageIndex <= capture.sourcePages; pageIndex += 1) {
    const start = (pageIndex - 1) * 100;
    const sourceRows = capture.records.slice(start, Math.min(start + 100, capture.sourceTotal));
    const payload = {
      code: 0,
      data: {
        list: sourceRows,
        total: capture.sourceTotal,
        pages: capture.sourcePages,
        pageIndex,
        pageSize: 100,
      },
    };
    const page = validateAndNormalizeCnipaGazettePagePayload({
      announcementIssue: capture.announcementIssue,
      pageIndex,
      payload,
    });
    if (page.announcementDate !== capture.announcementDate) {
      throw new Error(`capture page ${pageIndex} announcement date drifted`);
    }
    const raw = pageRawArtifact({
      capture,
      captureCanonicalUri,
      captureSha256: actualSha256,
      pageIndex,
      records: sourceRows,
    });
    const projection = pageProjectionArtifact({
      capture,
      page,
      rawCanonicalUri: raw.canonicalUri!,
    });
    pages.push(page);
    pageArtifacts.push(raw, projection);
  }

  const checkpoint = buildCheckpointResult(capture, pageArtifacts, pages);
  const datasetIdentity = buildCnipaGazetteDatasetIdentity(checkpoint);
  const chunkPackage = buildCnipaGazetteDataEngineChunkPackage({
    checkpoint: checkpoint.checkpoint,
    datasetIdentity,
    collectedAt: capture.exportedAt,
  });
  const identityCanonicalUri = datasetIdentity.artifact.canonicalUri;
  const checkpointCanonicalUri = checkpoint.checkpointArtifact.canonicalUri;
  if (!identityCanonicalUri || !checkpointCanonicalUri) {
    throw new Error("capture import did not produce durable canonical lineage");
  }
  const requestArtifact = buildCnipaGazetteChunkAdmissionRequestArtifact({
    package: chunkPackage,
    datasetIdentityCanonicalUri: identityCanonicalUri,
    checkpointCanonicalUri,
    createdAt: capture.exportedAt,
  });

  return [
    captureArtifact,
    ...pageArtifacts,
    checkpoint.checkpointArtifact,
    datasetIdentity.artifact,
    requestArtifact,
  ];
}

function importConfigFromContext(context: ArtifactBackedExecutionContext): CaptureImportConfig {
  const source = context.job.sourceSnapshot;
  if (
    context.job.jobType !== "LOCAL_FILE_SCAN" ||
    source.sourceType !== "MANUAL_UPLOAD" ||
    source.connector.connectorId !== CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_ID ||
    source.connector.version !== CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_VERSION ||
    context.job.connector.connectorId !== CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_ID ||
    context.job.connector.version !== CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_VERSION ||
    source.canonicalUri !== CNIPA_GAZETTE_CAPTURE_IMPORT_SOURCE
  ) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_CAPTURE_IMPORT_SOURCE_BOUNDARY_INVALID",
      "Gazette capture import requires the governed MANUAL_UPLOAD source identity",
      false,
    );
  }
  if (!context.job.planSnapshot.output.artifactKinds.includes("JSON")) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_OUTPUT_KIND_INVALID",
      "Gazette capture import must authorize JSON artifacts",
      false,
    );
  }
  const config = record(source.connectorConfig, "connectorConfig");
  exactKeys(
    config,
    [
      "intent",
      "announcementIssue",
      "announcementDate",
      "captureFilePath",
      "captureSha256",
      "captureToolVersion",
    ],
    "connectorConfig",
  );
  if (config.intent !== "IMPORT_SMALL_COMPLETE_CAPTURE") {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_CAPTURE_IMPORT_CONFIG_INVALID",
      "connectorConfig.intent must be IMPORT_SMALL_COMPLETE_CAPTURE",
      false,
    );
  }
  const captureFilePath = text(config.captureFilePath, "captureFilePath", 2048);
  if (!path.isAbsolute(captureFilePath)) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_CAPTURE_IMPORT_CONFIG_INVALID",
      "captureFilePath must be absolute",
      false,
    );
  }
  const captureSha256 = text(config.captureSha256, "captureSha256", 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(captureSha256)) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_CAPTURE_IMPORT_CONFIG_INVALID",
      "captureSha256 must be 64 lowercase hexadecimal characters",
      false,
    );
  }
  return {
    announcementIssue: integer(config.announcementIssue, "announcementIssue", 1),
    announcementDate: isoDate(config.announcementDate, "announcementDate"),
    captureFilePath,
    captureSha256,
    captureToolVersion: text(config.captureToolVersion, "captureToolVersion", 32),
  };
}

export class CnipaGazetteCaptureImportJobAcquirer implements CollectionArtifactAcquirer {
  readonly executor = CNIPA_GAZETTE_CAPTURE_IMPORT_EXECUTOR;

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    try {
      return await importCnipaGazetteSmallCompleteCapture(importConfigFromContext(context));
    } catch (error) {
      if (error instanceof CollectionAcquisitionError) throw error;
      throw new CollectionAcquisitionError(
        "CNIPA_GAZETTE_CAPTURE_IMPORT_INVALID",
        error instanceof Error ? error.message : "Gazette capture import failed",
        false,
      );
    }
  }
}

export function cnipaGazetteCaptureImportRuntimeDescriptor() {
  return Object.freeze({
    connectorId: CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_ID,
    connectorVersion: CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_VERSION,
    sourceType: "MANUAL_UPLOAD" as const,
    jobType: "LOCAL_FILE_SCAN" as const,
    captureTool: "MO CNIPA Network Capture" as const,
    captureSchema: CNIPA_GAZETTE_SMALL_COMPLETE_SCHEMA,
    artifactBackedIngestionRequired: true as const,
    browserSessionMaterialForbiddenInJobSnapshot: true as const,
    performsCnipaNetworkRequests: false as const,
    historicalReplayActivated: false as const,
  });
}
