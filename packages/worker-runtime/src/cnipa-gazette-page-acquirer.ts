import type { AcquiredCollectionArtifact } from "./artifact-backed-collection-executor";
import {
  buildCnipaGazetteIssueAllPageRequest,
  CNIPA_GAZETTE_ENDPOINTS,
} from "./cnipa-trademark-gazette";
import {
  CNIPA_GAZETTE_PAGE_SIZE,
  type CnipaGazettePageResult,
  type CnipaGazetteRuntimeRow,
} from "./cnipa-gazette-checkpoint-runtime";

export const CNIPA_GAZETTE_PUBLIC_ORIGIN = "https://pub.sbj.cnipa.gov.cn" as const;
export const CNIPA_GAZETTE_PAGE_EVIDENCE_SCHEMA = "CNIPA_GAZETTE_PAGE_EVIDENCE_V1" as const;

export type CnipaGazetteJsonTransportResponse = {
  httpStatus: number;
  rawBody: Uint8Array;
  observedAt: string;
  contentType?: string;
};

export interface CnipaGazetteJsonTransport {
  postJson(input: {
    path: string;
    body: Readonly<Record<string, string | number>>;
  }): Promise<CnipaGazetteJsonTransportResponse>;
}

export type CnipaGazetteSourceErrorCode =
  | "CNIPA_GAZETTE_HTTP_ERROR"
  | "CNIPA_GAZETTE_AUTH_EXPIRED"
  | "CNIPA_GAZETTE_TRANSIENT_SOURCE_ERROR"
  | "CNIPA_GAZETTE_SOURCE_REJECTED"
  | "CNIPA_GAZETTE_RESPONSE_INVALID"
  | "CNIPA_GAZETTE_ROW_INVALID";

export class CnipaGazetteSourceError extends Error {
  constructor(
    public readonly code: CnipaGazetteSourceErrorCode,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "CnipaGazetteSourceError";
  }
}

export type CnipaGazetteEvidenceBackedPage = {
  page: CnipaGazettePageResult;
  rawArtifact: AcquiredCollectionArtifact;
  projectionArtifact: AcquiredCollectionArtifact;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_RESPONSE_INVALID",
      `${label} must be an object`,
      false,
    );
  }
  return value as JsonRecord;
}

function requiredText(value: unknown, label: string, maximum = 4096): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_ROW_INVALID",
      `${label} must be text/number`,
      false,
    );
  }
  const normalized = String(value).trim();
  if (!normalized || normalized.length > maximum) {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_ROW_INVALID",
      `${label} must be non-empty and at most ${maximum} characters`,
      false,
    );
  }
  return normalized;
}

function optionalText(value: unknown, label: string, maximum = 4096): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string" && typeof value !== "number") {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_ROW_INVALID",
      `${label} must be text/number when supplied`,
      false,
    );
  }
  const normalized = String(value).trim();
  if (normalized.length > maximum) {
    throw new CnipaGazetteSourceError("CNIPA_GAZETTE_ROW_INVALID", `${label} is too long`, false);
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
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_RESPONSE_INVALID",
      `${label} must be an integer >= ${minimum}`,
      false,
    );
  }
  return parsed;
}

function optionalPositiveInteger(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  return integer(value, label, 1);
}

function sourceCode(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/u.test(value.trim())) return Number(value.trim());
  throw new CnipaGazetteSourceError(
    "CNIPA_GAZETTE_RESPONSE_INVALID",
    "response.code must be numeric",
    false,
  );
}

function observedInstant(value: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_RESPONSE_INVALID",
      "transport observedAt must be an ISO-8601 instant",
      false,
    );
  }
  return value;
}

function parseRawJson(rawBody: Uint8Array): unknown {
  if (!(rawBody instanceof Uint8Array) || rawBody.byteLength === 0) {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_RESPONSE_INVALID",
      "Gazette transport must return non-empty raw response bytes",
      false,
    );
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
  } catch {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_RESPONSE_INVALID",
      "Gazette raw response is not valid UTF-8",
      false,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_RESPONSE_INVALID",
      "Gazette raw response is not valid JSON",
      false,
    );
  }
}

function normalizeSourceRow(
  value: unknown,
  options: {
    announcementIssue: number;
    pageIndex: number;
    rowIndex: number;
  },
): CnipaGazetteRuntimeRow {
  const { announcementIssue, pageIndex, rowIndex } = options;
  const row = record(value, `page ${pageIndex}.list[${rowIndex}]`);
  const sourceRowId = requiredText(row.id, `page ${pageIndex}.list[${rowIndex}].id`, 256);
  const sourceSearchId = optionalText(
    row.searchId,
    `page ${pageIndex}.list[${rowIndex}].searchId`,
    256,
  );
  if (sourceSearchId && sourceSearchId !== sourceRowId) {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_ROW_INVALID",
      `page ${pageIndex}.list[${rowIndex}].searchId does not match id`,
      false,
    );
  }

  const rowIssue = integer(row.anncIssue, `page ${pageIndex}.list[${rowIndex}].anncIssue`, 1);
  if (rowIssue !== announcementIssue) {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_ROW_INVALID",
      `page ${pageIndex}.list[${rowIndex}] belongs to issue ${rowIssue}, expected ${announcementIssue}`,
      false,
    );
  }

  return {
    sourceRowId,
    sourceSearchId,
    registrationNumber: requiredText(row.regNo, `page ${pageIndex}.list[${rowIndex}].regNo`, 128),
    announcementIssue: rowIssue,
    announcementTypeCode: requiredText(
      row.anncType,
      `page ${pageIndex}.list[${rowIndex}].anncType`,
      128,
    ),
    announcementTypeName: optionalText(
      row.anncTypeName,
      `page ${pageIndex}.list[${rowIndex}].anncTypeName`,
      512,
    ),
    detailPageNo: optionalPositiveInteger(row.pageNo, `page ${pageIndex}.list[${rowIndex}].pageNo`),
    announcementPageCount: optionalPositiveInteger(
      row.anncPageNum,
      `page ${pageIndex}.list[${rowIndex}].anncPageNum`,
    ),
    detailFileId: optionalText(row.fileId, `page ${pageIndex}.list[${rowIndex}].fileId`, 256),
    detailAssetPath: optionalText(row.imgDir, `page ${pageIndex}.list[${rowIndex}].imgDir`),
    announcementDetailUrl: "",
  };
}

function validateAndNormalizePage(input: {
  announcementIssue: number;
  pageIndex: number;
  payload: unknown;
}): CnipaGazettePageResult {
  const envelope = record(input.payload, "response");
  const code = sourceCode(envelope.code);
  if (code === 401) {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_AUTH_EXPIRED",
      "CNIPA Gazette session/authentication expired; acquisition must stop and obtain a fresh authorized session",
      false,
    );
  }
  if (code === -102 || code === -107) {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_TRANSIENT_SOURCE_ERROR",
      `CNIPA Gazette transient source code ${code}`,
      true,
    );
  }
  if (code !== 0) {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_SOURCE_REJECTED",
      `CNIPA Gazette source rejected request with code ${code}`,
      false,
    );
  }

  const data = record(envelope.data, "response.data");
  if (!Array.isArray(data.list)) {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_RESPONSE_INVALID",
      "response.data.list must be an array",
      false,
    );
  }
  const sourceTotal = integer(data.total, "response.data.total", 0);
  const sourcePages = integer(data.pages, "response.data.pages", 1);
  const responsePageIndex = integer(data.pageIndex, "response.data.pageIndex", 1);
  const responsePageSize = integer(data.pageSize, "response.data.pageSize", 1);

  if (responsePageIndex !== input.pageIndex) {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_RESPONSE_INVALID",
      `response pageIndex=${responsePageIndex} does not match requested ${input.pageIndex}`,
      false,
    );
  }
  if (responsePageSize !== CNIPA_GAZETTE_PAGE_SIZE) {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_RESPONSE_INVALID",
      `response pageSize=${responsePageSize} does not match frozen pageSize=100`,
      false,
    );
  }
  if (input.pageIndex > sourcePages) {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_RESPONSE_INVALID",
      `requested page ${input.pageIndex} exceeds sourcePages=${sourcePages}`,
      false,
    );
  }

  const rows = data.list.map((row, index) =>
    normalizeSourceRow(row, {
      announcementIssue: input.announcementIssue,
      pageIndex: input.pageIndex,
      rowIndex: index,
    }),
  );

  if (input.pageIndex < sourcePages && rows.length !== CNIPA_GAZETTE_PAGE_SIZE) {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_RESPONSE_INVALID",
      `non-terminal page ${input.pageIndex} returned ${rows.length} rows instead of 100`,
      false,
    );
  }
  if (input.pageIndex === sourcePages) {
    const expected = sourceTotal === 0 ? 0 : sourceTotal % CNIPA_GAZETTE_PAGE_SIZE || 100;
    if (rows.length !== expected) {
      throw new CnipaGazetteSourceError(
        "CNIPA_GAZETTE_RESPONSE_INVALID",
        `terminal page ${input.pageIndex} returned ${rows.length} rows; expected ${expected}`,
        false,
      );
    }
  }

  return {
    pageIndex: input.pageIndex,
    pageSize: CNIPA_GAZETTE_PAGE_SIZE,
    sourceTotal,
    sourcePages,
    rows,
  };
}

function artifactUris(announcementIssue: number, pageIndex: number) {
  const base = `cnipa://trademark-gazette/issue/${announcementIssue}/list/page/${pageIndex}`;
  return {
    raw: `${base}/raw`,
    projection: `${base}/projection`,
    source: `${CNIPA_GAZETTE_PUBLIC_ORIGIN}${CNIPA_GAZETTE_ENDPOINTS.list}`,
  };
}

export async function acquireCnipaGazettePageWithEvidence(input: {
  announcementIssue: number;
  pageIndex: number;
  requestTemplate: Readonly<Record<string, unknown>>;
  transport: CnipaGazetteJsonTransport;
}): Promise<CnipaGazetteEvidenceBackedPage> {
  if (!Number.isSafeInteger(input.announcementIssue) || input.announcementIssue < 1) {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_RESPONSE_INVALID",
      "announcementIssue must be a positive safe integer",
      false,
    );
  }
  if (!Number.isSafeInteger(input.pageIndex) || input.pageIndex < 1) {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_RESPONSE_INVALID",
      "pageIndex must be a positive safe integer",
      false,
    );
  }

  const request = buildCnipaGazetteIssueAllPageRequest({
    capturedListBody: input.requestTemplate,
    pageIndex: input.pageIndex,
  });
  if (request.path !== CNIPA_GAZETTE_ENDPOINTS.list || request.method !== "POST") {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_RESPONSE_INVALID",
      "Gazette request builder escaped the canonical LIST endpoint",
      false,
    );
  }

  const response = await input.transport.postJson({
    path: request.path,
    body: request.jsonBody ?? {},
  });

  if (!Number.isInteger(response.httpStatus) || response.httpStatus < 100) {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_HTTP_ERROR",
      "Gazette transport returned an invalid HTTP status",
      false,
    );
  }
  if (response.httpStatus < 200 || response.httpStatus >= 300) {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_HTTP_ERROR",
      `Gazette LIST HTTP ${response.httpStatus}`,
      response.httpStatus === 408 || response.httpStatus === 429 || response.httpStatus >= 500,
    );
  }

  const observedAt = observedInstant(response.observedAt);
  const payload = parseRawJson(response.rawBody);
  const page = validateAndNormalizePage({
    announcementIssue: input.announcementIssue,
    pageIndex: input.pageIndex,
    payload,
  });
  const uris = artifactUris(input.announcementIssue, input.pageIndex);

  const rawArtifact: AcquiredCollectionArtifact = {
    artifactKind: "JSON",
    mimeType: response.contentType?.trim() || "application/json;charset=UTF-8",
    originalName: `cnipa-gazette-issue-${input.announcementIssue}-list-p${input.pageIndex}.json`,
    sourceUri: uris.source,
    canonicalUri: uris.raw,
    content: response.rawBody,
  };

  const projection = {
    schemaVersion: CNIPA_GAZETTE_PAGE_EVIDENCE_SCHEMA,
    sourceOwner: "MARKORBIT_KNOWLEDGE",
    sourceFamily: "CNIPA_TRADEMARK_GAZETTE",
    announcementIssue: input.announcementIssue,
    pageIndex: input.pageIndex,
    pageSize: CNIPA_GAZETTE_PAGE_SIZE,
    observedAt,
    request: {
      method: "POST",
      path: request.path,
      body: request.jsonBody ?? {},
    },
    sourceRawCanonicalUri: uris.raw,
    page,
  };
  const projectionArtifact: AcquiredCollectionArtifact = {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: `cnipa-gazette-issue-${input.announcementIssue}-projection-p${input.pageIndex}.json`,
    sourceUri: uris.source,
    canonicalUri: uris.projection,
    parentCanonicalUris: [uris.raw],
    content: new TextEncoder().encode(JSON.stringify(projection)),
  };

  return { page, rawArtifact, projectionArtifact };
}

export async function acquireCnipaGazettePage(input: {
  announcementIssue: number;
  pageIndex: number;
  requestTemplate: Readonly<Record<string, unknown>>;
  transport: CnipaGazetteJsonTransport;
}): Promise<CnipaGazettePageResult> {
  return (await acquireCnipaGazettePageWithEvidence(input)).page;
}
