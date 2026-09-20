import { createHash } from "node:crypto";
import {
  CNIPA_GAZETTE_PAGE_SIZE,
  type CnipaGazettePageResult,
  type CnipaGazetteRuntimeRow,
} from "./cnipa-gazette-checkpoint-runtime";
import {
  CNIPA_GAZETTE_PUBLIC_ORIGIN,
  CnipaGazetteSourceError,
} from "./cnipa-gazette-page-acquirer";
import { CNIPA_GAZETTE_ENDPOINTS } from "./cnipa-trademark-gazette";

export const CNIPA_GAZETTE_BROWSER_STREAM_SESSION_SCHEMA =
  "mo-cnipa-gazette-browser-stream-session-v1" as const;
export const CNIPA_GAZETTE_BROWSER_STREAM_STATE_SCHEMA =
  "mo-cnipa-gazette-browser-stream-state-v1" as const;

type JsonRecord = Record<string, unknown>;

export type CnipaGazetteBrowserStreamSession = {
  schema: typeof CNIPA_GAZETTE_BROWSER_STREAM_SESSION_SCHEMA;
  sessionId: string;
  announcementIssue: number;
  sourceUrl: string;
  sourcePageSize: number;
  sourceTotal: number;
  sourcePages: number;
  announcementDate: string | null;
  capturedQuery: Readonly<Record<string, string | number>>;
  startedAt: string;
};
export type CnipaGazetteBrowserSourcePage = {
  sessionId: string;
  sourcePageIndex: number;
  sourcePageSize: number;
  sourceTotal: number;
  sourcePages: number;
  announcementDate: string | null;
  observedAt: string;
  pageSignatureSha256: string;
  rows: readonly CnipaGazetteRuntimeRow[];
};

export type CnipaGazetteBrowserLogicalPage = CnipaGazettePageResult & {
  sourcePageIndices: readonly number[];
  observedAt: string;
};

export type CnipaGazetteBrowserStreamState = {
  schema: typeof CNIPA_GAZETTE_BROWSER_STREAM_STATE_SCHEMA;
  sessionId: string;
  sessionFingerprintSha256: string;
  nextSourcePageIndex: number;
  nextLogicalPageIndex: number;
  rowsSeen: number;
  tailRows: readonly CnipaGazetteRuntimeRow[];
  tailSourcePageIndices: readonly number[];
  previousSourceRowIds: readonly string[];
  previousSourcePageSignatureSha256: string | null;
  completed: boolean;
};

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as JsonRecord;
}
function integer(value: unknown, label: string, minimum = 0): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/u.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new TypeError(`${label} must be an integer >= ${minimum}`);
  }
  return parsed;
}

function requiredText(value: unknown, label: string, maximum = 4096): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new TypeError(`${label} must be text/number`);
  }
  const normalized = String(value).trim();
  if (!normalized || normalized.length > maximum) {
    throw new TypeError(`${label} must be non-empty and at most ${maximum} characters`);
  }
  return normalized;
}

function optionalText(value: unknown, label: string, maximum = 4096): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string" && typeof value !== "number") {
    throw new TypeError(`${label} must be text/number when supplied`);
  }
  const normalized = String(value).trim();
  if (normalized.length > maximum) throw new TypeError(`${label} is too long`);
  return normalized;
}

function positiveIntegerOrNull(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  return integer(value, label, 1);
}

function isoInstant(value: unknown, label: string): string {
  const normalized = requiredText(value, label, 128);
  if (Number.isNaN(Date.parse(normalized))) throw new TypeError(`${label} must be ISO-8601`);
  return normalized;
}

function isoDateOrNull(value: unknown, label: string): string | null {
  if (value === null) return null;
  const normalized = requiredText(value, label, 32);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(normalized) ||
    Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))
  ) {
    throw new TypeError(`${label} must be YYYY-MM-DD or null`);
  }
  return normalized;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as JsonRecord)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as JsonRecord)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function canonicalSourceUrl(value: unknown): string {
  const normalized = requiredText(value, "sourceUrl");
  const url = new URL(normalized);
  if (
    url.origin !== CNIPA_GAZETTE_PUBLIC_ORIGIN ||
    url.pathname !== CNIPA_GAZETTE_ENDPOINTS.list ||
    url.search ||
    url.hash
  ) {
    throw new TypeError(
      "sourceUrl must be the canonical CNIPA Gazette LIST endpoint without query/hash",
    );
  }
  return normalized;
}

const FORBIDDEN_QUERY_KEY = /fecu|cookie|credential|bearer|token|captcha|sso/iu;

function capturedQuery(
  value: unknown,
  announcementIssue: number,
): Readonly<Record<string, string | number>> {
  const raw = record(value, "capturedQuery");
  const query: Record<string, string | number> = {};
  for (const [key, child] of Object.entries(raw)) {
    if (FORBIDDEN_QUERY_KEY.test(key)) {
      throw new TypeError(`capturedQuery.${key} is forbidden in durable browser-stream evidence`);
    }
    if (typeof child !== "string" && typeof child !== "number") {
      throw new TypeError(`capturedQuery.${key} must be string/number`);
    }
    query[key] = child;
  }
  if (String(query.anncIssue ?? "").trim() !== String(announcementIssue) || query.anncType !== "") {
    throw new TypeError("capturedQuery must target the session issue with announcement type ALL");
  }
  if (query.pageIndex !== 1) throw new TypeError("capturedQuery.pageIndex must equal 1");
  const pageSize = integer(query.pageSize, "capturedQuery.pageSize", 1);
  if (pageSize > 100) {
    throw new TypeError("capturedQuery.pageSize must be between 1 and 100");
  }
  return query;
}
export function createCnipaGazetteBrowserStreamSession(input: {
  sessionId: string;
  announcementIssue: number;
  sourceUrl: string;
  capturedQuery: unknown;
  sourceTotal: number;
  sourcePages: number;
  announcementDate: string | null;
  startedAt: string;
}): CnipaGazetteBrowserStreamSession {
  const sessionId = requiredText(input.sessionId, "sessionId", 128);
  if (!/^[A-Za-z0-9._:-]+$/u.test(sessionId)) {
    throw new TypeError("sessionId contains unsupported characters");
  }
  const announcementIssue = integer(input.announcementIssue, "announcementIssue", 1);
  const query = capturedQuery(input.capturedQuery, announcementIssue);
  const sourcePageSize = integer(query.pageSize, "capturedQuery.pageSize", 1);
  const sourceTotal = integer(input.sourceTotal, "sourceTotal", 0);
  const sourcePages = integer(input.sourcePages, "sourcePages", 1);
  const expectedSourcePages = Math.max(1, Math.ceil(sourceTotal / sourcePageSize));
  if (sourcePages !== expectedSourcePages) {
    throw new TypeError("sourcePages does not match sourceTotal/captured pageSize");
  }
  const announcementDate = isoDateOrNull(input.announcementDate, "announcementDate");
  if (sourceTotal > 0 && announcementDate === null) {
    throw new TypeError("non-empty Gazette session requires announcementDate");
  }
  return {
    schema: CNIPA_GAZETTE_BROWSER_STREAM_SESSION_SCHEMA,
    sessionId,
    announcementIssue,
    sourceUrl: canonicalSourceUrl(input.sourceUrl),
    sourcePageSize,
    sourceTotal,
    sourcePages,
    announcementDate,
    capturedQuery: query,
    startedAt: isoInstant(input.startedAt, "startedAt"),
  };
}

export function cnipaGazetteBrowserStreamSessionFingerprint(
  session: CnipaGazetteBrowserStreamSession,
): string {
  return sha256(session);
}

function normalizeRow(
  value: unknown,
  session: CnipaGazetteBrowserStreamSession,
  pageIndex: number,
  rowIndex: number,
): CnipaGazetteRuntimeRow {
  const row = record(value, `page ${pageIndex}.list[${rowIndex}]`);
  const sourceRowId = requiredText(row.id, `page ${pageIndex}.list[${rowIndex}].id`, 256);
  const sourceSearchId = optionalText(
    row.searchId,
    `page ${pageIndex}.list[${rowIndex}].searchId`,
    256,
  );
  if (sourceSearchId && sourceSearchId !== sourceRowId) {
    throw new TypeError(`page ${pageIndex}.list[${rowIndex}].searchId does not match id`);
  }
  const rowIssue = integer(row.anncIssue, `page ${pageIndex}.list[${rowIndex}].anncIssue`, 1);
  if (rowIssue !== session.announcementIssue) {
    throw new TypeError(`page ${pageIndex}.list[${rowIndex}] belongs to issue ${rowIssue}`);
  }
  const rowDate = isoDateOrNull(row.anncDate, `page ${pageIndex}.list[${rowIndex}].anncDate`);
  if (rowDate !== session.announcementDate) {
    throw new TypeError(`page ${pageIndex}.list[${rowIndex}].anncDate drifted from session`);
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
    detailPageNo: positiveIntegerOrNull(row.pageNo, `page ${pageIndex}.list[${rowIndex}].pageNo`),
    announcementPageCount: positiveIntegerOrNull(
      row.anncPageNum,
      `page ${pageIndex}.list[${rowIndex}].anncPageNum`,
    ),
    detailFileId: optionalText(row.fileId, `page ${pageIndex}.list[${rowIndex}].fileId`, 256),
    detailAssetPath: optionalText(row.imgDir, `page ${pageIndex}.list[${rowIndex}].imgDir`),
    announcementDetailUrl: "",
  };
}

export function parseCnipaGazetteBrowserSourcePage(input: {
  session: CnipaGazetteBrowserStreamSession;
  requestedPageIndex: number;
  observedAt: string;
  httpStatus: number;
  payload: unknown;
}): CnipaGazetteBrowserSourcePage {
  const requestedPageIndex = integer(input.requestedPageIndex, "requestedPageIndex", 1);
  if (requestedPageIndex > input.session.sourcePages) {
    throw new TypeError("requestedPageIndex exceeds session sourcePages");
  }
  if (!Number.isInteger(input.httpStatus) || input.httpStatus < 200 || input.httpStatus >= 300) {
    throw new CnipaGazetteSourceError(
      "CNIPA_GAZETTE_HTTP_ERROR",
      `CNIPA Gazette LIST HTTP ${input.httpStatus}`,
      input.httpStatus === 408 || input.httpStatus === 429 || input.httpStatus >= 500,
    );
  }
  const envelope = record(input.payload, "response");
  const rawCode = envelope.code;
  const code =
    typeof rawCode === "number"
      ? rawCode
      : typeof rawCode === "string" && /^-?\d+$/u.test(rawCode.trim())
        ? Number(rawCode.trim())
        : Number.NaN;
  if (!Number.isFinite(code)) {
    throw new TypeError("response.code must be numeric");
  }
  if (code !== 0) {
    if (code === 401) {
      throw new CnipaGazetteSourceError(
        "CNIPA_GAZETTE_AUTH_EXPIRED",
        "CNIPA Gazette browser session expired",
        false,
      );
    }
    const transient = code === -102 || code === -107;
    throw new CnipaGazetteSourceError(
      transient ? "CNIPA_GAZETTE_TRANSIENT_SOURCE_ERROR" : "CNIPA_GAZETTE_SOURCE_REJECTED",
      `CNIPA Gazette source returned business code ${code}`,
      transient,
    );
  }
  const data = record(envelope.data, "response.data");
  if (!Array.isArray(data.list)) {
    throw new TypeError("response.data.list must be an array");
  }
  const sourcePageIndex = integer(data.pageIndex, "response.data.pageIndex", 1);
  const sourcePageSize = integer(data.pageSize, "response.data.pageSize", 1);
  const sourceTotal = integer(data.total, "response.data.total", 0);
  const sourcePages = integer(data.pages, "response.data.pages", 1);
  if (sourcePageIndex !== requestedPageIndex) {
    throw new TypeError("response pageIndex drifted");
  }
  if (sourcePageSize !== input.session.sourcePageSize) {
    throw new TypeError("response pageSize drifted");
  }
  if (sourceTotal !== input.session.sourceTotal || sourcePages !== input.session.sourcePages) {
    throw new TypeError("response total/pages drifted from browser-stream session");
  }

  const expectedLength =
    sourceTotal === 0
      ? 0
      : sourcePageIndex < sourcePages
        ? sourcePageSize
        : sourceTotal % sourcePageSize || sourcePageSize;
  if (data.list.length !== expectedLength) {
    throw new TypeError(
      `source page ${sourcePageIndex} returned ${data.list.length} rows; expected ${expectedLength}`,
    );
  }
  const rows = data.list.map((row, rowIndex) =>
    normalizeRow(row, input.session, sourcePageIndex, rowIndex),
  );
  const ids = rows.map((row) => row.sourceRowId);
  if (new Set(ids).size !== ids.length) {
    throw new TypeError(`source page ${sourcePageIndex} contains duplicate official row ids`);
  }
  return {
    sessionId: input.session.sessionId,
    sourcePageIndex,
    sourcePageSize,
    sourceTotal,
    sourcePages,
    announcementDate: input.session.announcementDate,
    observedAt: isoInstant(input.observedAt, "observedAt"),
    pageSignatureSha256: sha256(ids),
    rows,
  };
}

export function createCnipaGazetteBrowserStreamState(
  session: CnipaGazetteBrowserStreamSession,
): CnipaGazetteBrowserStreamState {
  return {
    schema: CNIPA_GAZETTE_BROWSER_STREAM_STATE_SCHEMA,
    sessionId: session.sessionId,
    sessionFingerprintSha256: cnipaGazetteBrowserStreamSessionFingerprint(session),
    nextSourcePageIndex: 1,
    nextLogicalPageIndex: 1,
    rowsSeen: 0,
    tailRows: [],
    tailSourcePageIndices: [],
    previousSourceRowIds: [],
    previousSourcePageSignatureSha256: null,
    completed: false,
  };
}

function normalizePersistedRuntimeRow(
  value: unknown,
  session: CnipaGazetteBrowserStreamSession,
  label: string,
): CnipaGazetteRuntimeRow {
  const row = record(value, label);
  const sourceRowId = requiredText(row.sourceRowId, `${label}.sourceRowId`, 256);
  const sourceSearchId = optionalText(row.sourceSearchId, `${label}.sourceSearchId`, 256);
  if (sourceSearchId && sourceSearchId !== sourceRowId) {
    throw new TypeError(`${label}.sourceSearchId must match sourceRowId`);
  }
  const announcementIssue = integer(row.announcementIssue, `${label}.announcementIssue`, 1);
  if (announcementIssue !== session.announcementIssue) {
    throw new TypeError(`${label}.announcementIssue mismatch`);
  }
  return {
    sourceRowId,
    sourceSearchId,
    registrationNumber: requiredText(row.registrationNumber, `${label}.registrationNumber`, 128),
    announcementIssue,
    announcementTypeCode: requiredText(
      row.announcementTypeCode,
      `${label}.announcementTypeCode`,
      128,
    ),
    announcementTypeName: optionalText(
      row.announcementTypeName,
      `${label}.announcementTypeName`,
      512,
    ),
    detailPageNo: positiveIntegerOrNull(row.detailPageNo, `${label}.detailPageNo`),
    announcementPageCount: positiveIntegerOrNull(
      row.announcementPageCount,
      `${label}.announcementPageCount`,
    ),
    detailFileId: optionalText(row.detailFileId, `${label}.detailFileId`, 256),
    detailAssetPath: optionalText(row.detailAssetPath, `${label}.detailAssetPath`),
    announcementDetailUrl: optionalText(
      row.announcementDetailUrl,
      `${label}.announcementDetailUrl`,
    ),
  };
}

export function parseCnipaGazetteBrowserStreamState(
  value: unknown,
  session: CnipaGazetteBrowserStreamSession,
): CnipaGazetteBrowserStreamState {
  const state = record(value, "state");
  if (state.schema !== CNIPA_GAZETTE_BROWSER_STREAM_STATE_SCHEMA) {
    throw new TypeError("state schema is invalid");
  }
  if (state.sessionId !== session.sessionId) {
    throw new TypeError("state sessionId mismatch");
  }
  if (state.sessionFingerprintSha256 !== cnipaGazetteBrowserStreamSessionFingerprint(session)) {
    throw new TypeError("state session fingerprint mismatch");
  }
  const tailRows = Array.isArray(state.tailRows)
    ? state.tailRows.map((row, index) =>
        normalizePersistedRuntimeRow(row, session, `state.tailRows[${index}]`),
      )
    : (() => {
        throw new TypeError("state.tailRows must be an array");
      })();
  if (tailRows.length >= CNIPA_GAZETTE_PAGE_SIZE) {
    throw new TypeError("state.tailRows must stay below one logical page");
  }
  const tailSourcePageIndices = Array.isArray(state.tailSourcePageIndices)
    ? state.tailSourcePageIndices.map((value, index) =>
        integer(value, `state.tailSourcePageIndices[${index}]`, 1),
      )
    : (() => {
        throw new TypeError("state.tailSourcePageIndices must be an array");
      })();
  if (
    tailSourcePageIndices.length !== tailRows.length ||
    tailSourcePageIndices.some((pageIndex) => pageIndex > session.sourcePages)
  ) {
    throw new TypeError("state tail provenance is internally inconsistent");
  }
  const previousSourceRowIds = Array.isArray(state.previousSourceRowIds)
    ? state.previousSourceRowIds.map((value, index) =>
        requiredText(value, `state.previousSourceRowIds[${index}]`, 256),
      )
    : (() => {
        throw new TypeError("state.previousSourceRowIds must be an array");
      })();
  if (previousSourceRowIds.length > session.sourcePageSize) {
    throw new TypeError("state.previousSourceRowIds exceeds source page size");
  }
  const signature =
    state.previousSourcePageSignatureSha256 === null
      ? null
      : requiredText(
          state.previousSourcePageSignatureSha256,
          "state.previousSourcePageSignatureSha256",
          64,
        );
  if (signature !== null && !/^[a-f0-9]{64}$/u.test(signature)) {
    throw new TypeError("state.previousSourcePageSignatureSha256 must be sha256 or null");
  }
  if (typeof state.completed !== "boolean") {
    throw new TypeError("state.completed must be boolean");
  }
  const nextSourcePageIndex = integer(state.nextSourcePageIndex, "state.nextSourcePageIndex", 1);
  const nextLogicalPageIndex = integer(state.nextLogicalPageIndex, "state.nextLogicalPageIndex", 1);
  const rowsSeen = integer(state.rowsSeen, "state.rowsSeen", 0);
  if (
    nextSourcePageIndex > session.sourcePages + 1 ||
    nextLogicalPageIndex > logicalPageCount(session.sourceTotal) + 1 ||
    rowsSeen > session.sourceTotal ||
    tailSourcePageIndices.some((pageIndex) => pageIndex >= nextSourcePageIndex)
  ) {
    throw new TypeError("state progress exceeds the browser-stream session bounds");
  }

  if (state.completed) {
    const expectedLastLength =
      session.sourceTotal === 0
        ? 0
        : session.sourceTotal % session.sourcePageSize || session.sourcePageSize;
    if (
      nextSourcePageIndex !== session.sourcePages + 1 ||
      nextLogicalPageIndex !== logicalPageCount(session.sourceTotal) + 1 ||
      rowsSeen !== session.sourceTotal ||
      tailRows.length !== 0 ||
      tailSourcePageIndices.length !== 0 ||
      previousSourceRowIds.length !== expectedLastLength ||
      signature === null
    ) {
      throw new TypeError("completed state is internally inconsistent");
    }
  } else {
    const acceptedSourcePages = nextSourcePageIndex - 1;
    const expectedRowsSeen = acceptedSourcePages * session.sourcePageSize;
    if (
      nextSourcePageIndex > session.sourcePages ||
      rowsSeen !== expectedRowsSeen ||
      tailRows.length !== rowsSeen % CNIPA_GAZETTE_PAGE_SIZE ||
      nextLogicalPageIndex !== Math.floor(rowsSeen / CNIPA_GAZETTE_PAGE_SIZE) + 1 ||
      previousSourceRowIds.length !== (acceptedSourcePages === 0 ? 0 : session.sourcePageSize) ||
      (acceptedSourcePages === 0 ? signature !== null : signature === null)
    ) {
      throw new TypeError("incomplete state is internally inconsistent");
    }
  }

  return {
    schema: CNIPA_GAZETTE_BROWSER_STREAM_STATE_SCHEMA,
    sessionId: session.sessionId,
    sessionFingerprintSha256: cnipaGazetteBrowserStreamSessionFingerprint(session),
    nextSourcePageIndex,
    nextLogicalPageIndex,
    rowsSeen,
    tailRows,
    tailSourcePageIndices,
    previousSourceRowIds,
    previousSourcePageSignatureSha256: signature,
    completed: state.completed,
  };
}

function logicalPageCount(sourceTotal: number): number {
  return Math.max(1, Math.ceil(sourceTotal / CNIPA_GAZETTE_PAGE_SIZE));
}

export function acceptCnipaGazetteBrowserSourcePage(input: {
  session: CnipaGazetteBrowserStreamSession;
  state: CnipaGazetteBrowserStreamState;
  page: CnipaGazetteBrowserSourcePage;
}): {
  state: CnipaGazetteBrowserStreamState;
  logicalPages: readonly CnipaGazetteBrowserLogicalPage[];
} {
  const state = parseCnipaGazetteBrowserStreamState(input.state, input.session);
  const page = input.page;
  if (state.completed) throw new TypeError("browser stream is already complete");
  if (page.sessionId !== input.session.sessionId) {
    throw new TypeError("source page session mismatch");
  }
  if (page.sourcePageIndex !== state.nextSourcePageIndex) {
    throw new TypeError(
      `source page sequence mismatch: expected ${state.nextSourcePageIndex}, got ${page.sourcePageIndex}`,
    );
  }
  if (
    page.sourcePageSize !== input.session.sourcePageSize ||
    page.sourceTotal !== input.session.sourceTotal ||
    page.sourcePages !== input.session.sourcePages ||
    page.announcementDate !== input.session.announcementDate
  ) {
    throw new TypeError("source page drifted from browser-stream session");
  }

  const priorIds = new Set(state.previousSourceRowIds);
  const overlap = page.rows.find((row) => priorIds.has(row.sourceRowId));
  if (overlap) {
    throw new TypeError(
      `source page ${page.sourcePageIndex} overlaps the prior source page at official id ${overlap.sourceRowId}`,
    );
  }
  if (
    state.previousSourcePageSignatureSha256 !== null &&
    page.pageSignatureSha256 === state.previousSourcePageSignatureSha256
  ) {
    throw new TypeError(`source page ${page.sourcePageIndex} repeats the prior source page`);
  }

  const combined = [...state.tailRows, ...page.rows];
  const combinedSourcePageIndices = [
    ...state.tailSourcePageIndices,
    ...page.rows.map(() => page.sourcePageIndex),
  ];
  const finalSourcePage = page.sourcePageIndex === input.session.sourcePages;
  const logicalPages: CnipaGazetteBrowserLogicalPage[] = [];
  const totalLogicalPages = logicalPageCount(input.session.sourceTotal);
  let nextLogicalPageIndex = state.nextLogicalPageIndex;
  while (combined.length >= CNIPA_GAZETTE_PAGE_SIZE) {
    const rows = combined.splice(0, CNIPA_GAZETTE_PAGE_SIZE);
    const sourcePageIndices = [
      ...new Set(combinedSourcePageIndices.splice(0, CNIPA_GAZETTE_PAGE_SIZE)),
    ].sort((left, right) => left - right);
    logicalPages.push({
      pageIndex: nextLogicalPageIndex,
      pageSize: CNIPA_GAZETTE_PAGE_SIZE,
      sourceTotal: input.session.sourceTotal,
      sourcePages: totalLogicalPages,
      announcementDate: input.session.announcementDate,
      rows,
      sourcePageIndices,
      observedAt: page.observedAt,
    });
    nextLogicalPageIndex += 1;
  }

  if (finalSourcePage && (combined.length > 0 || input.session.sourceTotal === 0)) {
    const sourcePageIndices = [...new Set(combinedSourcePageIndices.splice(0))].sort(
      (left, right) => left - right,
    );
    logicalPages.push({
      pageIndex: nextLogicalPageIndex,
      pageSize: CNIPA_GAZETTE_PAGE_SIZE,
      sourceTotal: input.session.sourceTotal,
      sourcePages: totalLogicalPages,
      announcementDate: input.session.announcementDate,
      rows: combined.splice(0),
      sourcePageIndices,
      observedAt: page.observedAt,
    });
    nextLogicalPageIndex += 1;
  }

  const rowsSeen = state.rowsSeen + page.rows.length;
  if (rowsSeen > input.session.sourceTotal) {
    throw new TypeError("browser stream observed more rows than sourceTotal");
  }
  if (finalSourcePage) {
    if (rowsSeen !== input.session.sourceTotal) {
      throw new TypeError(
        `browser stream terminal count mismatch: rows=${rowsSeen}, sourceTotal=${input.session.sourceTotal}`,
      );
    }
    if (
      combined.length !== 0 ||
      combinedSourcePageIndices.length !== 0 ||
      nextLogicalPageIndex !== totalLogicalPages + 1
    ) {
      throw new TypeError(
        "browser stream logical normalization did not finish exactly at sourceTotal",
      );
    }
  } else if (rowsSeen >= input.session.sourceTotal) {
    throw new TypeError("browser stream reached sourceTotal before the terminal source page");
  }

  return {
    state: {
      schema: CNIPA_GAZETTE_BROWSER_STREAM_STATE_SCHEMA,
      sessionId: input.session.sessionId,
      sessionFingerprintSha256: cnipaGazetteBrowserStreamSessionFingerprint(input.session),
      nextSourcePageIndex: page.sourcePageIndex + 1,
      nextLogicalPageIndex,
      rowsSeen,
      tailRows: combined,
      tailSourcePageIndices: combinedSourcePageIndices,
      previousSourceRowIds: page.rows.map((row) => row.sourceRowId),
      previousSourcePageSignatureSha256: page.pageSignatureSha256,
      completed: finalSourcePage,
    },
    logicalPages,
  };
}
