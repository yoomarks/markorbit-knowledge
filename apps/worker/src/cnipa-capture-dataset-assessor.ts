import { createHash } from "node:crypto";

export type CnipaCaptureDatasetKind =
  | "registration_list"
  | "opposition_list"
  | "review_list";

export type CnipaHiddenPaginationAssessment =
  | "VERIFIED"
  | "NOT_EXERCISED"
  | "INCONCLUSIVE";

export type CnipaCaptureDatasetAssessment = {
  schema: "mo-cnipa-capture-dataset-assessment-v1";
  inputSha256: string;
  datasetSchema: "mo-cnipa-query-dataset-v2";
  kind: CnipaCaptureDatasetKind;
  sourceUrlMatchesKind: boolean;
  queryShape: {
    pageIndexIsOne: boolean;
    pageSizeIsHundred: boolean;
    dateFieldsPresent: boolean;
    openFlagMatchesObservedShape: boolean;
  };
  recordStats: {
    declaredCount: number;
    recordsLength: number;
    countMatchesRecords: boolean;
    expectedIdField: "pubId" | "adjuOpenId";
    expectedIdCount: number;
    fallbackAdjuIdCount: number;
    missingCanonicalIdCount: number;
    uniqueResolvedIdCount: number;
    duplicateResolvedIdCount: number;
    nonEmptyFileContentCount: number;
    allRecordsContainFileContent: boolean;
  };
  pagingStats: {
    hiddenPagesObserved: number;
    pageIndicesContiguousFromTwo: boolean;
    baseUniqueCount: number;
    newUniqueFromHiddenPages: number;
    recoveredAfterRetryPages: number;
    stopReason: string;
    naturalTerminalObserved: boolean;
    hiddenPagination: CnipaHiddenPaginationAssessment;
  };
  promotion: {
    runtimeDateRangeReady: boolean;
    reasons: string[];
  };
};

type ObjectRecord = Record<string, unknown>;

type KindSpec = {
  expectedIdField: "pubId" | "adjuOpenId";
  expectedIdStrategy: string;
  dateStartField: string;
  dateEndField: string;
  sourcePath: string;
  requiresOpenFlagOne: boolean;
};

const KIND_SPECS: Readonly<Record<CnipaCaptureDatasetKind, KindSpec>> = {
  registration_list: {
    expectedIdField: "adjuOpenId",
    expectedIdStrategy: "adjuOpenId (adjuId fallback)",
    dateStartField: "returnDateStart",
    dateEndField: "returnDateEnd",
    sourcePath: "/pubnotice/portal/tmscJudgment/queryPageList",
    requiresOpenFlagOne: false,
  },
  opposition_list: {
    expectedIdField: "adjuOpenId",
    expectedIdStrategy: "adjuOpenId (adjuId fallback)",
    dateStartField: "returnDateStart",
    dateEndField: "returnDateEnd",
    sourcePath: "/pubnotice/portal/tmyyJudgment/queryPageList",
    requiresOpenFlagOne: true,
  },
  review_list: {
    expectedIdField: "pubId",
    expectedIdStrategy: "pubId",
    dateStartField: "judgeDateStart",
    dateEndField: "judgeDateEnd",
    sourcePath: "/pubnotice/portal/tmpsJudgment/queryPageList",
    requiresOpenFlagOne: true,
  },
};

function asObject(value: unknown, label: string): ObjectRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as ObjectRecord;
}

function asNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value as number;
}

function asPositiveInteger(value: unknown, label: string): number {
  const resolved = asNonNegativeInteger(value, label);
  if (resolved < 1) throw new Error(`${label} must be at least 1`);
  return resolved;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

function optionalScalarId(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function datasetKind(value: unknown): CnipaCaptureDatasetKind {
  if (value === "registration_list" || value === "opposition_list" || value === "review_list") {
    return value;
  }
  throw new Error("dataset.kind must be registration_list, opposition_list, or review_list");
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function nonEmptyText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function naturalTerminal(stopReason: string): boolean {
  return (
    stopReason === "遇到空页" ||
    /^遇到短页 \d+$/.test(stopReason) ||
    /^首页即为短页 \d+$/.test(stopReason)
  );
}

export function assessCnipaCaptureDatasetText(text: string): CnipaCaptureDatasetAssessment {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("CNIPA capture dataset must be valid JSON");
  }
  return assessCnipaCaptureDataset(parsed, sha256(text));
}

export function assessCnipaCaptureDataset(
  value: unknown,
  inputSha256 = sha256(JSON.stringify(value)),
): CnipaCaptureDatasetAssessment {
  const dataset = asObject(value, "dataset");
  if (dataset.exportedSchema !== "mo-cnipa-query-dataset-v2") {
    throw new Error("dataset.exportedSchema must equal mo-cnipa-query-dataset-v2");
  }

  const kind = datasetKind(dataset.kind);
  const spec = KIND_SPECS[kind];
  const declaredCount = asNonNegativeInteger(dataset.count, "dataset.count");
  const stopReason = asString(dataset.stopReason, "dataset.stopReason");
  const sourceUrl = asString(dataset.sourceUrl, "dataset.sourceUrl");
  const idStrategy = asString(dataset.idStrategy, "dataset.idStrategy");
  const query = asObject(dataset.query, "dataset.query");
  const records = Array.isArray(dataset.records)
    ? dataset.records
    : (() => {
        throw new Error("dataset.records must be an array");
      })();
  const pages = Array.isArray(dataset.pages)
    ? dataset.pages
    : (() => {
        throw new Error("dataset.pages must be an array");
      })();

  const resolvedIds = new Set<string>();
  let expectedIdCount = 0;
  let fallbackAdjuIdCount = 0;
  let missingCanonicalIdCount = 0;
  let duplicateResolvedIdCount = 0;
  let nonEmptyFileContentCount = 0;

  for (let index = 0; index < records.length; index += 1) {
    const row = asObject(records[index], `dataset.records[${index}]`);
    const expectedId = optionalScalarId(row[spec.expectedIdField]);
    const fallbackId =
      spec.expectedIdField === "adjuOpenId" ? optionalScalarId(row.adjuId) : undefined;
    const resolvedId = expectedId ?? fallbackId;

    if (expectedId) {
      expectedIdCount += 1;
    } else if (fallbackId) {
      fallbackAdjuIdCount += 1;
    } else {
      missingCanonicalIdCount += 1;
    }

    if (resolvedId) {
      if (resolvedIds.has(resolvedId)) duplicateResolvedIdCount += 1;
      resolvedIds.add(resolvedId);
    }
    if (nonEmptyText(row.fileContent)) nonEmptyFileContentCount += 1;
  }

  let newUniqueFromHiddenPages = 0;
  let recoveredAfterRetryPages = 0;
  let pageIndicesContiguousFromTwo = true;
  let hiddenPageProvesOffset = false;

  for (let index = 0; index < pages.length; index += 1) {
    const page = asObject(pages[index], `dataset.pages[${index}]`);
    const requestedPageIndex = asPositiveInteger(
      page.requestedPageIndex,
      `dataset.pages[${index}].requestedPageIndex`,
    );
    const listLength = asNonNegativeInteger(
      page.listLength,
      `dataset.pages[${index}].listLength`,
    );
    const newUnique = asNonNegativeInteger(
      page.newUnique,
      `dataset.pages[${index}].newUnique`,
    );
    const attempts = asPositiveInteger(page.attempts, `dataset.pages[${index}].attempts`);
    if (newUnique > listLength) {
      throw new Error(`dataset.pages[${index}].newUnique cannot exceed listLength`);
    }
    if (listLength > 100) {
      throw new Error(`dataset.pages[${index}].listLength cannot exceed 100`);
    }
    if (requestedPageIndex !== index + 2) pageIndicesContiguousFromTwo = false;
    if (requestedPageIndex >= 2 && newUnique > 0) hiddenPageProvesOffset = true;
    newUniqueFromHiddenPages += newUnique;
    if (page.recoveredAfterRetry === true || attempts > 1) recoveredAfterRetryPages += 1;
  }

  const baseUniqueCount = declaredCount - newUniqueFromHiddenPages;
  if (baseUniqueCount < 0) {
    throw new Error("hidden-page newUnique total cannot exceed dataset.count");
  }

  const pageIndexIsOne = query.pageIndex === 1;
  const pageSizeIsHundred = query.pageSize === 100;
  const dateFieldsPresent =
    nonEmptyText(query[spec.dateStartField]) && nonEmptyText(query[spec.dateEndField]);
  const openFlagMatchesObservedShape = spec.requiresOpenFlagOne
    ? query.openFlag === 1
    : query.openFlag === undefined || query.openFlag === null || query.openFlag === "";

  const sourceUrlMatchesKind = sourceUrl.includes(spec.sourcePath);
  const countMatchesRecords = declaredCount === records.length;
  const allRecordsContainFileContent =
    records.length > 0 && nonEmptyFileContentCount === records.length;
  const naturalTerminalObserved = naturalTerminal(stopReason);

  let hiddenPagination: CnipaHiddenPaginationAssessment = "INCONCLUSIVE";
  if (pages.length === 0 && /^首页即为短页 \d+$/.test(stopReason)) {
    hiddenPagination = "NOT_EXERCISED";
  } else if (
    pages.length > 0 &&
    baseUniqueCount === 100 &&
    pageIndicesContiguousFromTwo &&
    hiddenPageProvesOffset
  ) {
    hiddenPagination = "VERIFIED";
  }

  const reasons: string[] = [];
  if (!sourceUrlMatchesKind) reasons.push("source URL does not match the selected judgment library");
  if (!pageIndexIsOne || !pageSizeIsHundred) {
    reasons.push("base query must be exported as pageIndex=1 and pageSize=100");
  }
  if (!dateFieldsPresent) reasons.push("expected date-range fields are missing");
  if (!openFlagMatchesObservedShape) reasons.push("openFlag does not match the observed request shape");
  if (idStrategy !== spec.expectedIdStrategy) reasons.push("dataset idStrategy does not match the kind");
  if (!countMatchesRecords) reasons.push("dataset.count does not equal records.length");
  if (expectedIdCount !== records.length) {
    reasons.push(`not every record contains canonical ${spec.expectedIdField}`);
  }
  if (fallbackAdjuIdCount > 0) reasons.push("one or more records require adjuId fallback");
  if (missingCanonicalIdCount > 0) reasons.push("one or more records have no canonical source id");
  if (duplicateResolvedIdCount > 0) reasons.push("duplicate resolved source ids were found");
  if (!allRecordsContainFileContent) reasons.push("not every LIST record contains non-empty fileContent");
  if (!pageIndicesContiguousFromTwo) reasons.push("hidden requested page indices are not contiguous from 2");
  if (hiddenPagination !== "VERIFIED") {
    reasons.push("hidden pagination beyond the visible 100-row window was not fully demonstrated");
  }
  if (!naturalTerminalObserved) {
    reasons.push("capture did not stop on a natural empty/short-page terminal condition");
  }

  return {
    schema: "mo-cnipa-capture-dataset-assessment-v1",
    inputSha256,
    datasetSchema: "mo-cnipa-query-dataset-v2",
    kind,
    sourceUrlMatchesKind,
    queryShape: {
      pageIndexIsOne,
      pageSizeIsHundred,
      dateFieldsPresent,
      openFlagMatchesObservedShape,
    },
    recordStats: {
      declaredCount,
      recordsLength: records.length,
      countMatchesRecords,
      expectedIdField: spec.expectedIdField,
      expectedIdCount,
      fallbackAdjuIdCount,
      missingCanonicalIdCount,
      uniqueResolvedIdCount: resolvedIds.size,
      duplicateResolvedIdCount,
      nonEmptyFileContentCount,
      allRecordsContainFileContent,
    },
    pagingStats: {
      hiddenPagesObserved: pages.length,
      pageIndicesContiguousFromTwo,
      baseUniqueCount,
      newUniqueFromHiddenPages,
      recoveredAfterRetryPages,
      stopReason,
      naturalTerminalObserved,
      hiddenPagination,
    },
    promotion: {
      runtimeDateRangeReady: reasons.length === 0,
      reasons,
    },
  };
}
