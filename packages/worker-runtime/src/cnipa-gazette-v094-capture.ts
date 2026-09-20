import { createHash } from "node:crypto";
import { CNIPA_GAZETTE_ENDPOINTS } from "./cnipa-trademark-gazette";
import { CNIPA_GAZETTE_PAGE_SIZE } from "./cnipa-gazette-checkpoint-runtime";
import {
  CNIPA_GAZETTE_PUBLIC_ORIGIN,
  type CnipaGazetteJsonTransport,
  type CnipaGazetteJsonTransportResponse,
} from "./cnipa-gazette-page-acquirer";

export const CNIPA_GAZETTE_V094_SMALL_COMPLETE_SCHEMA =
  "mo-cnipa-gazette-small-complete-v1" as const;
export const CNIPA_GAZETTE_V094_TOOL = "MO CNIPA Network Capture" as const;
export const CNIPA_GAZETTE_V094_VERSION = "0.9.4" as const;

export type CnipaGazetteV094SmallCompleteCapture = {
  exportedSchema: typeof CNIPA_GAZETTE_V094_SMALL_COMPLETE_SCHEMA;
  tool: typeof CNIPA_GAZETTE_V094_TOOL;
  version: typeof CNIPA_GAZETTE_V094_VERSION;
  kind: "gazette_small_issue_complete";
  exportedAt: string;
  announcementIssue: string;
  announcementDate: string;
  query: Readonly<Record<string, string | number>>;
  sourceUrl: string;
  sourceTotal: number;
  sourcePages: number;
  pageSize: number;
  collectedCount: number;
  uniqueOfficialRowIds: number;
  expectedLastPageLength: number;
  observedLastPageLength: number;
  completeness: "COMPLETE";
  records: ReadonlyArray<Readonly<Record<string, unknown>>>;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function own(value: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
function text(value: unknown, label: string, maximum = 4096): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new TypeError(`${label} must be text/number`);
  }
  const normalized = String(value).trim();
  if (!normalized || normalized.length > maximum) {
    throw new TypeError(`${label} must be non-empty and at most ${maximum} characters`);
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
    throw new TypeError(`${label} must be an integer >= ${minimum}`);
  }
  return parsed;
}

function isoInstant(value: unknown, label: string): string {
  const resolved = text(value, label, 128);
  if (Number.isNaN(Date.parse(resolved))) throw new TypeError(`${label} must be ISO-8601`);
  return resolved;
}
function sourceUrl(value: unknown): string {
  const resolved = text(value, "capture.sourceUrl");
  const url = new URL(resolved);
  if (
    url.origin !== CNIPA_GAZETTE_PUBLIC_ORIGIN ||
    url.pathname !== CNIPA_GAZETTE_ENDPOINTS.list ||
    url.search ||
    url.hash
  ) {
    throw new TypeError("capture.sourceUrl must be the canonical CNIPA Gazette LIST endpoint");
  }
  return resolved;
}

function captureQuery(value: unknown, announcementIssue: string, pageSize: number) {
  const raw = record(value, "capture.query");
  const result: Record<string, string | number> = {};
  for (const [key, child] of Object.entries(raw)) {
    if (typeof child !== "string" && typeof child !== "number") {
      throw new TypeError(`capture.query.${key} must be string/number`);
    }
    result[key] = child;
  }
  if (
    String(result.anncIssue ?? "").trim() !== announcementIssue ||
    result.anncType !== "" ||
    result.pageIndex !== 1 ||
    result.pageSize !== pageSize
  ) {
    throw new TypeError("capture.query must be issue + ALL + pageIndex 1 + captured pageSize");
  }
  return result;
}
function assertRows(input: {
  records: readonly Readonly<JsonRecord>[];
  announcementIssue: string;
  sourceTotal: number;
}) {
  if (input.records.length !== input.sourceTotal) {
    throw new TypeError("capture.records length must equal sourceTotal");
  }
  const ids = new Set<string>();
  let observedDate: string | null = null;
  for (let index = 0; index < input.records.length; index += 1) {
    const row = input.records[index]!;
    for (const key of [
      "id",
      "searchId",
      "anncIssue",
      "anncDate",
      "anncType",
      "anncTypeName",
      "regNo",
    ]) {
      if (!own(row, key)) throw new TypeError(`capture.records[${index}] missing ${key}`);
    }
    const id = text(row.id, `capture.records[${index}].id`, 256);
    if (ids.has(id)) throw new TypeError(`capture contains duplicate official id ${id}`);
    ids.add(id);
    if (text(row.searchId, `capture.records[${index}].searchId`, 256) !== id) {
      throw new TypeError(`capture.records[${index}].searchId must equal id`);
    }
    if (text(row.anncIssue, `capture.records[${index}].anncIssue`) !== input.announcementIssue) {
      throw new TypeError(`capture.records[${index}] belongs to another issue`);
    }
    const date = text(row.anncDate, `capture.records[${index}].anncDate`, 32);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
      throw new TypeError(`capture.records[${index}].anncDate must be YYYY-MM-DD`);
    }
    if (observedDate === null) observedDate = date;
    else if (observedDate !== date) {
      throw new TypeError("capture records contain multiple announcement dates");
    }
    text(row.anncType, `capture.records[${index}].anncType`, 128);
    if (
      row.anncTypeName !== null &&
      row.anncTypeName !== undefined &&
      String(row.anncTypeName).length > 512
    ) {
      throw new TypeError(`capture.records[${index}].anncTypeName is too long`);
    }
    text(row.regNo, `capture.records[${index}].regNo`, 128);
  }
  return { uniqueOfficialRowIds: ids.size, announcementDate: observedDate };
}

export function parseCnipaGazetteV094SmallCompleteCapture(
  value: unknown,
): CnipaGazetteV094SmallCompleteCapture {
  const root = record(value, "capture");
  if (root.exportedSchema !== CNIPA_GAZETTE_V094_SMALL_COMPLETE_SCHEMA) {
    throw new TypeError(
      `capture.exportedSchema must equal ${CNIPA_GAZETTE_V094_SMALL_COMPLETE_SCHEMA}`,
    );
  }
  if (root.tool !== CNIPA_GAZETTE_V094_TOOL || root.version !== CNIPA_GAZETTE_V094_VERSION) {
    throw new TypeError("capture must come from MO CNIPA Network Capture v0.9.4");
  }
  if (root.kind !== "gazette_small_issue_complete" || root.completeness !== "COMPLETE") {
    throw new TypeError("capture must be a COMPLETE gazette_small_issue_complete export");
  }
  const announcementIssue = text(root.announcementIssue, "capture.announcementIssue", 32);
  const sourceTotal = integer(root.sourceTotal, "capture.sourceTotal");
  const sourcePages = integer(root.sourcePages, "capture.sourcePages", 1);
  const pageSize = integer(root.pageSize, "capture.pageSize", 1);
  if (pageSize > CNIPA_GAZETTE_PAGE_SIZE) {
    throw new TypeError("capture.pageSize must be between 1 and 100");
  }
  const calculatedPages = Math.max(1, Math.ceil(sourceTotal / pageSize));
  if (sourcePages !== calculatedPages) {
    throw new TypeError("capture.sourcePages does not match sourceTotal/pageSize");
  }
  const expectedLastPageLength = sourceTotal === 0 ? 0 : sourceTotal % pageSize || pageSize;
  if (
    integer(root.expectedLastPageLength, "capture.expectedLastPageLength") !==
      expectedLastPageLength ||
    integer(root.observedLastPageLength, "capture.observedLastPageLength") !==
      expectedLastPageLength
  ) {
    throw new TypeError("capture last-page length is inconsistent");
  }
  const records = Array.isArray(root.records)
    ? root.records.map((item, index) => record(item, `capture.records[${index}]`))
    : (() => {
        throw new TypeError("capture.records must be an array");
      })();
  const rows = assertRows({ records, announcementIssue, sourceTotal });
  const collectedCount = integer(root.collectedCount, "capture.collectedCount");
  const uniqueOfficialRowIds = integer(root.uniqueOfficialRowIds, "capture.uniqueOfficialRowIds");
  if (
    collectedCount !== sourceTotal ||
    uniqueOfficialRowIds !== sourceTotal ||
    rows.uniqueOfficialRowIds !== sourceTotal
  ) {
    throw new TypeError("capture completeness counters must all equal sourceTotal");
  }
  return {
    exportedSchema: CNIPA_GAZETTE_V094_SMALL_COMPLETE_SCHEMA,
    tool: CNIPA_GAZETTE_V094_TOOL,
    version: CNIPA_GAZETTE_V094_VERSION,
    kind: "gazette_small_issue_complete",
    exportedAt: isoInstant(root.exportedAt, "capture.exportedAt"),
    announcementIssue,
    announcementDate:
      rows.announcementDate ??
      (() => {
        throw new TypeError("capture contains no announcement date");
      })(),
    query: captureQuery(root.query, announcementIssue, pageSize),
    sourceUrl: sourceUrl(root.sourceUrl),
    sourceTotal,
    sourcePages,
    pageSize,
    collectedCount,
    uniqueOfficialRowIds,
    expectedLastPageLength,
    observedLastPageLength: expectedLastPageLength,
    completeness: "COMPLETE",
    records,
  };
}

export function parseCnipaGazetteV094SmallCompleteCaptureBytes(
  bytes: Uint8Array,
): CnipaGazetteV094SmallCompleteCapture {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new TypeError("capture bytes must contain valid UTF-8 JSON");
  }
  return parseCnipaGazetteV094SmallCompleteCapture(parsed);
}

export function cnipaGazetteCaptureSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export class CnipaGazetteV094CaptureTransport implements CnipaGazetteJsonTransport {
  constructor(private readonly capture: CnipaGazetteV094SmallCompleteCapture) {}

  async postJson(input: {
    path: string;
    body: Readonly<Record<string, string | number>>;
  }): Promise<CnipaGazetteJsonTransportResponse> {
    if (input.path !== CNIPA_GAZETTE_ENDPOINTS.list) {
      throw new TypeError("capture transport only serves the canonical Gazette LIST path");
    }
    const pageIndex = integer(input.body.pageIndex, "request.pageIndex", 1);
    const normalizedPages = Math.max(
      1,
      Math.ceil(this.capture.sourceTotal / CNIPA_GAZETTE_PAGE_SIZE),
    );
    if (
      pageIndex > normalizedPages ||
      input.body.pageSize !== 100 ||
      input.body.anncType !== "" ||
      String(input.body.anncIssue ?? "").trim() !== this.capture.announcementIssue
    ) {
      throw new TypeError(
        "capture transport request escaped the captured issue/all/page-100 scope",
      );
    }
    for (const [key, value] of Object.entries(this.capture.query)) {
      if (key === "pageIndex" || key === "pageSize") continue;
      if (input.body[key] !== value) {
        throw new TypeError(
          `capture transport request field ${key} drifted from the captured query`,
        );
      }
    }
    const start = (pageIndex - 1) * CNIPA_GAZETTE_PAGE_SIZE;
    const list = this.capture.records.slice(start, start + CNIPA_GAZETTE_PAGE_SIZE);
    const envelope = {
      code: 0,
      message: "captured by MO CNIPA Network Capture v0.9.4",
      type: "success",
      data: {
        pageIndex,
        pageSize: CNIPA_GAZETTE_PAGE_SIZE,
        total: this.capture.sourceTotal,
        pages: normalizedPages,
        list,
      },
    };
    return {
      httpStatus: 200,
      rawBody: new TextEncoder().encode(JSON.stringify(envelope)),
      observedAt: this.capture.exportedAt,
      contentType: "application/json;charset=UTF-8",
    };
  }
}
