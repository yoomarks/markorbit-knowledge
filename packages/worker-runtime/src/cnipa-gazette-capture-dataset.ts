export const CNIPA_GAZETTE_CAPTURE_DATASET_SCHEMA = "mo-cnipa-gazette-dataset-v1" as const;

export type CnipaGazetteCapturePage = {
  requestedPageIndex: number;
  requestedPageSize: 100;
  attempts: number;
  httpStatus: number;
  code?: number;
  responseTotal?: unknown;
  responsePageIndex?: unknown;
  responsePageSize?: unknown;
  listLength: number;
  newUnique: number;
  overlapWithSeenBeforePage: number;
  pageSignatureSha256?: string;
};

export type CnipaGazetteCaptureDataset = {
  exportedSchema: typeof CNIPA_GAZETTE_CAPTURE_DATASET_SCHEMA;
  tool: "MO CNIPA Network Capture";
  version: string;
  kind: "gazette_issue";
  exportedAt: string;
  completedAt: string;
  announcementIssue: string;
  announcementDatesObserved: string[];
  query: Readonly<Record<string, unknown>>;
  sourceUrl: string;
  count: number;
  records: ReadonlyArray<Readonly<Record<string, unknown>>>;
  pages: readonly CnipaGazetteCapturePage[];
  stopReason: string;
  rowIdentityStrategy: string;
};

export type CnipaGazetteCaptureAssessment = {
  schema: "mo-cnipa-gazette-capture-assessment-v1";
  announcementIssue: string;
  sourceUrlMatches: boolean;
  queryIsIssueAllPage100: boolean;
  countMatchesRecords: boolean;
  pagesContiguousFromOne: boolean;
  allPagesRequestedAt100: boolean;
  allRowsMatchAnnouncementIssue: boolean;
  officialRowIdsPresentAndUnique: boolean;
  searchIdsMatchOfficialRowIds: boolean;
  requiredFieldsPresentOnEveryRow: string[];
  requiredFieldsMissingFromAnyRow: string[];
  detailLocatorFieldsPresentOnEveryRow: string[];
  detailLocatorFieldsMissingFromAnyRow: string[];
  terminalObserved: boolean;
  readyForIssueCatalogProjection: boolean;
  readyForAnnouncementEntryProjection: boolean;
  readyForDetailCandidateProjection: boolean;
  reasons: string[];
};

const EXPECTED_SOURCE_PATH = "/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg";

const REQUIRED_ENTRY_FIELDS = Object.freeze([
  "id",
  "searchId",
  "anncIssue",
  "anncDate",
  "anncType",
  "anncTypeName",
  "regNo",
] as const);

const DETAIL_LOCATOR_FIELDS = Object.freeze([
  "anncIssue",
  "anncType",
  "pageNo",
  "fileId",
  "imgDir",
] as const);

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
  return value as number;
}

function positiveInteger(value: unknown, label: string): number {
  const resolved = nonNegativeInteger(value, label);
  if (resolved < 1) throw new TypeError(`${label} must be at least 1`);
  return resolved;
}

function own(value: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function parsePage(value: unknown, index: number): CnipaGazetteCapturePage {
  const page = record(value, `pages[${index}]`);
  const requestedPageSize = positiveInteger(
    page.requestedPageSize,
    `pages[${index}].requestedPageSize`,
  );
  if (requestedPageSize !== 100) {
    throw new TypeError(`pages[${index}].requestedPageSize must equal 100`);
  }
  const parsed: CnipaGazetteCapturePage = {
    requestedPageIndex: positiveInteger(
      page.requestedPageIndex,
      `pages[${index}].requestedPageIndex`,
    ),
    requestedPageSize: 100,
    attempts: nonNegativeInteger(page.attempts, `pages[${index}].attempts`),
    httpStatus: nonNegativeInteger(page.httpStatus, `pages[${index}].httpStatus`),
    listLength: nonNegativeInteger(page.listLength, `pages[${index}].listLength`),
    newUnique: nonNegativeInteger(page.newUnique, `pages[${index}].newUnique`),
    overlapWithSeenBeforePage: nonNegativeInteger(
      page.overlapWithSeenBeforePage,
      `pages[${index}].overlapWithSeenBeforePage`,
    ),
  };
  if (typeof page.code === "number") parsed.code = page.code;
  if (own(page, "responseTotal")) parsed.responseTotal = page.responseTotal;
  if (own(page, "responsePageIndex")) parsed.responsePageIndex = page.responsePageIndex;
  if (own(page, "responsePageSize")) parsed.responsePageSize = page.responsePageSize;
  if (typeof page.pageSignatureSha256 === "string") {
    parsed.pageSignatureSha256 = page.pageSignatureSha256;
  }
  return parsed;
}

export function parseCnipaGazetteCaptureDataset(value: unknown): CnipaGazetteCaptureDataset {
  const root = record(value, "dataset");
  if (root.exportedSchema !== CNIPA_GAZETTE_CAPTURE_DATASET_SCHEMA) {
    throw new TypeError(
      `dataset.exportedSchema must equal ${CNIPA_GAZETTE_CAPTURE_DATASET_SCHEMA}`,
    );
  }
  if (root.tool !== "MO CNIPA Network Capture") {
    throw new TypeError("dataset.tool must equal MO CNIPA Network Capture");
  }
  if (root.kind !== "gazette_issue") {
    throw new TypeError("dataset.kind must equal gazette_issue");
  }
  const announcementIssue = stringValue(root.announcementIssue, "dataset.announcementIssue");
  const query = record(root.query, "dataset.query");
  const records = Array.isArray(root.records)
    ? root.records.map((item, index) => record(item, `dataset.records[${index}]`))
    : (() => {
        throw new TypeError("dataset.records must be an array");
      })();
  const pages = Array.isArray(root.pages)
    ? root.pages.map(parsePage)
    : (() => {
        throw new TypeError("dataset.pages must be an array");
      })();
  const announcementDatesObserved = Array.isArray(root.announcementDatesObserved)
    ? root.announcementDatesObserved.map((item, index) =>
        stringValue(item, `dataset.announcementDatesObserved[${index}]`),
      )
    : [];

  return {
    exportedSchema: CNIPA_GAZETTE_CAPTURE_DATASET_SCHEMA,
    tool: "MO CNIPA Network Capture",
    version: stringValue(root.version, "dataset.version"),
    kind: "gazette_issue",
    exportedAt: stringValue(root.exportedAt, "dataset.exportedAt"),
    completedAt: stringValue(root.completedAt, "dataset.completedAt"),
    announcementIssue,
    announcementDatesObserved,
    query,
    sourceUrl: stringValue(root.sourceUrl, "dataset.sourceUrl"),
    count: nonNegativeInteger(root.count, "dataset.count"),
    records,
    pages,
    stopReason: stringValue(root.stopReason, "dataset.stopReason"),
    rowIdentityStrategy: stringValue(root.rowIdentityStrategy, "dataset.rowIdentityStrategy"),
  };
}

function terminalObserved(dataset: CnipaGazetteCaptureDataset): boolean {
  return (
    dataset.stopReason === "EMPTY_PAGE" ||
    /^SHORT_PAGE_\d+$/u.test(dataset.stopReason) ||
    dataset.stopReason === "THREE_CONSECUTIVE_PAGES_NO_NEW_ROW_FINGERPRINTS"
  );
}

function fieldsPresentOnEveryRow(
  records: CnipaGazetteCaptureDataset["records"],
  fields: readonly string[],
): { present: string[]; missing: string[] } {
  const present = fields.filter(
    (field) => records.length > 0 && records.every((row) => own(row, field)),
  );
  return { present, missing: fields.filter((field) => !present.includes(field)) };
}

export function assessCnipaGazetteCaptureDataset(value: unknown): CnipaGazetteCaptureAssessment {
  const dataset = parseCnipaGazetteCaptureDataset(value);
  let sourceUrlMatches = false;
  try {
    sourceUrlMatches = new URL(dataset.sourceUrl).pathname === EXPECTED_SOURCE_PATH;
  } catch {
    sourceUrlMatches = false;
  }

  const queryIssue =
    typeof dataset.query.anncIssue === "string" ? dataset.query.anncIssue.trim() : "";
  const queryIsIssueAllPage100 =
    queryIssue === dataset.announcementIssue &&
    dataset.query.anncType === "" &&
    dataset.query.pageIndex === 1 &&
    dataset.query.pageSize === 100;

  const countMatchesRecords = dataset.count === dataset.records.length;
  const pagesContiguousFromOne = dataset.pages.every(
    (page, index) => page.requestedPageIndex === index + 1,
  );
  const allPagesRequestedAt100 = dataset.pages.every((page) => page.requestedPageSize === 100);
  const allRowsMatchAnnouncementIssue =
    dataset.records.length > 0 &&
    dataset.records.every(
      (row) =>
        (typeof row.anncIssue === "string" || typeof row.anncIssue === "number") &&
        String(row.anncIssue).trim() === dataset.announcementIssue,
    );
  const required = fieldsPresentOnEveryRow(dataset.records, REQUIRED_ENTRY_FIELDS);
  const detail = fieldsPresentOnEveryRow(dataset.records, DETAIL_LOCATOR_FIELDS);
  const officialRowIds = dataset.records.map((row) =>
    typeof row.id === "string" || typeof row.id === "number" ? String(row.id).trim() : "",
  );
  const officialRowIdsPresentAndUnique =
    officialRowIds.length > 0 &&
    officialRowIds.every(Boolean) &&
    new Set(officialRowIds).size === officialRowIds.length;
  const searchIdsMatchOfficialRowIds =
    dataset.records.length > 0 &&
    dataset.records.every(
      (row) =>
        (typeof row.searchId === "string" || typeof row.searchId === "number") &&
        String(row.searchId).trim() === String(row.id ?? "").trim(),
    );
  const terminal = terminalObserved(dataset);

  const reasons: string[] = [];
  if (!sourceUrlMatches) reasons.push("source URL does not match the Gazette LIST endpoint");
  if (!queryIsIssueAllPage100)
    reasons.push("query is not issue + announcement-type ALL + pageSize 100");
  if (!countMatchesRecords) reasons.push("dataset.count does not equal records.length");
  if (!pagesContiguousFromOne) reasons.push("requested page indices are not contiguous from 1");
  if (!allPagesRequestedAt100) reasons.push("one or more pages were not requested at pageSize 100");
  if (!allRowsMatchAnnouncementIssue)
    reasons.push("one or more rows do not match the target announcement issue");
  if (required.missing.length)
    reasons.push(`required Gazette entry fields missing: ${required.missing.join(", ")}`);
  if (!officialRowIdsPresentAndUnique)
    reasons.push("official Gazette row ids are missing or duplicated");
  if (!searchIdsMatchOfficialRowIds)
    reasons.push("searchId does not match the official Gazette row id");
  if (!terminal) reasons.push("capture did not stop on a recognized terminal condition");

  const baseReady =
    sourceUrlMatches &&
    queryIsIssueAllPage100 &&
    countMatchesRecords &&
    pagesContiguousFromOne &&
    allPagesRequestedAt100 &&
    allRowsMatchAnnouncementIssue &&
    officialRowIdsPresentAndUnique &&
    searchIdsMatchOfficialRowIds &&
    required.missing.length === 0 &&
    terminal;

  return {
    schema: "mo-cnipa-gazette-capture-assessment-v1",
    announcementIssue: dataset.announcementIssue,
    sourceUrlMatches,
    queryIsIssueAllPage100,
    countMatchesRecords,
    pagesContiguousFromOne,
    allPagesRequestedAt100,
    allRowsMatchAnnouncementIssue,
    officialRowIdsPresentAndUnique,
    searchIdsMatchOfficialRowIds,
    requiredFieldsPresentOnEveryRow: required.present,
    requiredFieldsMissingFromAnyRow: required.missing,
    detailLocatorFieldsPresentOnEveryRow: detail.present,
    detailLocatorFieldsMissingFromAnyRow: detail.missing,
    terminalObserved: terminal,
    readyForIssueCatalogProjection: baseReady,
    readyForAnnouncementEntryProjection: baseReady,
    readyForDetailCandidateProjection: baseReady && detail.missing.length === 0,
    reasons,
  };
}
