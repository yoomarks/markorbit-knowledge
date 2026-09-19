export const CNIPA_GAZETTE_RUNTIME_CONTRACT_VERSION =
  "CNIPA_GAZETTE_CHECKPOINT_RUNTIME_V1" as const;
export const CNIPA_GAZETTE_DATA_ENGINE_ADMISSION_VERSION =
  "CN_TRADEMARK_GAZETTE_ADMISSION_V1" as const;
export const CNIPA_GAZETTE_PAGE_SIZE = 100 as const;
export const CNIPA_GAZETTE_MAX_PAGES_PER_CHECKPOINT = 100 as const;

export type CnipaGazettePageRange = {
  startPage: number;
  endPage: number;
};

export type CnipaGazetteRuntimeRow = {
  sourceRowId: string;
  sourceSearchId: string;
  registrationNumber: string;
  announcementIssue: number;
  announcementTypeCode: string;
  announcementTypeName: string;
  detailPageNo: number | null;
  announcementPageCount: number | null;
  detailFileId: string;
  detailAssetPath: string;
  announcementDetailUrl: string;
};

export type CnipaGazettePageResult = {
  pageIndex: number;
  pageSize: 100;
  sourceTotal: number;
  sourcePages: number;
  announcementDate: string | null;
  rows: readonly CnipaGazetteRuntimeRow[];
};

export type CnipaGazetteCheckpoint = {
  contractVersion: typeof CNIPA_GAZETTE_RUNTIME_CONTRACT_VERSION;
  announcementIssue: number;
  sourceTotal: number;
  sourcePages: number;
  announcementDate: string | null;
  pageSize: 100;
  range: CnipaGazettePageRange;
  pages: readonly CnipaGazettePageResult[];
  rowCount: number;
  uniqueOfficialRowIds: number;
  completeness: "RANGE_COMPLETE";
};

export type CnipaGazetteAdmissionRow = {
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

export type CnipaGazetteAdmissionPackage = {
  contract_version: typeof CNIPA_GAZETTE_DATA_ENGINE_ADMISSION_VERSION;
  source_authority: "CNIPA";
  completeness: "COMPLETE";
  announcement_issue: number;
  announcement_date: string | null;
  record_count: number;
  page_count: number;
  page_size: 100;
  source_capture_schema: string;
  source_dataset_sha256: string;
  source_uri: string;
  collected_at: string;
  records: readonly CnipaGazetteAdmissionRow[];
};

export type AssembleCnipaGazetteAdmissionInput = {
  announcementIssue: number;
  announcementDate: string | null;
  sourceCaptureSchema: string;
  sourceDatasetSha256: string;
  sourceUri: string;
  collectedAt: string;
  checkpoints: readonly CnipaGazetteCheckpoint[];
};

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

function text(value: string, label: string, maximum = 4096): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`${label} must be non-empty and at most ${maximum} characters`);
  }
  return normalized;
}

function optionalText(value: string, label: string, maximum = 4096): string {
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new Error(`${label} must be at most ${maximum} characters`);
  }
  return normalized;
}

function assertSha256(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("sourceDatasetSha256 must be 64 hexadecimal characters");
  }
  return normalized;
}

function assertIsoDateOrNull(value: string | null): string | null {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error("announcementDate must be YYYY-MM-DD or null");
  }
  return value;
}

function assertInstant(value: string): string {
  const normalized = text(value, "collectedAt", 64);
  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error("collectedAt must be an ISO-8601 instant");
  }
  return normalized;
}

function normalizeRow(
  row: CnipaGazetteRuntimeRow,
  expectedIssue: number,
  label: string,
): CnipaGazetteRuntimeRow {
  const sourceRowId = text(row.sourceRowId, `${label}.sourceRowId`, 256);
  const sourceSearchId = optionalText(row.sourceSearchId, `${label}.sourceSearchId`, 256);
  if (sourceSearchId && sourceSearchId !== sourceRowId) {
    throw new Error(`${label}.sourceSearchId must match sourceRowId`);
  }
  if (row.announcementIssue !== expectedIssue) {
    throw new Error(
      `${label}.announcementIssue=${row.announcementIssue} does not match target issue ${expectedIssue}`,
    );
  }
  return {
    sourceRowId,
    sourceSearchId,
    registrationNumber: text(row.registrationNumber, `${label}.registrationNumber`, 128),
    announcementIssue: expectedIssue,
    announcementTypeCode: text(row.announcementTypeCode, `${label}.announcementTypeCode`, 128),
    announcementTypeName: optionalText(
      row.announcementTypeName,
      `${label}.announcementTypeName`,
      512,
    ),
    detailPageNo:
      row.detailPageNo === null ? null : positiveInteger(row.detailPageNo, `${label}.detailPageNo`),
    announcementPageCount:
      row.announcementPageCount === null
        ? null
        : positiveInteger(row.announcementPageCount, `${label}.announcementPageCount`),
    detailFileId: optionalText(row.detailFileId, `${label}.detailFileId`, 256),
    detailAssetPath: optionalText(row.detailAssetPath, `${label}.detailAssetPath`),
    announcementDetailUrl: optionalText(
      row.announcementDetailUrl,
      `${label}.announcementDetailUrl`,
    ),
  };
}

export function planCnipaGazettePageRanges(input: {
  sourcePages: number;
  pagesPerCheckpoint: number;
}): readonly CnipaGazettePageRange[] {
  const sourcePages = positiveInteger(input.sourcePages, "sourcePages");
  const chunk = positiveInteger(input.pagesPerCheckpoint, "pagesPerCheckpoint");
  if (chunk > CNIPA_GAZETTE_MAX_PAGES_PER_CHECKPOINT) {
    throw new Error(`pagesPerCheckpoint must be <= ${CNIPA_GAZETTE_MAX_PAGES_PER_CHECKPOINT}`);
  }

  const ranges: CnipaGazettePageRange[] = [];
  for (let startPage = 1; startPage <= sourcePages; startPage += chunk) {
    ranges.push({
      startPage,
      endPage: Math.min(sourcePages, startPage + chunk - 1),
    });
  }
  return ranges;
}

export function buildCnipaGazetteCheckpoint(input: {
  announcementIssue: number;
  range: CnipaGazettePageRange;
  pages: readonly CnipaGazettePageResult[];
}): CnipaGazetteCheckpoint {
  const issue = positiveInteger(input.announcementIssue, "announcementIssue");
  const startPage = positiveInteger(input.range.startPage, "range.startPage");
  const endPage = positiveInteger(input.range.endPage, "range.endPage");
  if (endPage < startPage) throw new Error("range.endPage must be >= range.startPage");

  const expectedPageCount = endPage - startPage + 1;
  if (input.pages.length !== expectedPageCount) {
    throw new Error("checkpoint pages do not fully cover the requested range");
  }

  let sourceTotal: number | null = null;
  let sourcePages: number | null = null;
  let announcementDate: string | null | undefined;
  let rowCount = 0;
  const ids = new Set<string>();

  input.pages.forEach((page, offset) => {
    const expectedPage = startPage + offset;
    if (page.pageIndex !== expectedPage) {
      throw new Error(
        `checkpoint page sequence mismatch: expected ${expectedPage}, got ${page.pageIndex}`,
      );
    }
    if (page.pageSize !== CNIPA_GAZETTE_PAGE_SIZE) {
      throw new Error(`page ${page.pageIndex} must use pageSize=100`);
    }
    const total = nonNegativeInteger(page.sourceTotal, `page ${page.pageIndex}.sourceTotal`);
    const pages = positiveInteger(page.sourcePages, `page ${page.pageIndex}.sourcePages`);
    if (sourceTotal === null) sourceTotal = total;
    if (sourcePages === null) sourcePages = pages;
    if (sourceTotal !== total || sourcePages !== pages) {
      throw new Error("source total/pages drifted within checkpoint");
    }
    const pageAnnouncementDate = assertIsoDateOrNull(page.announcementDate);
    if (total > 0 && pageAnnouncementDate === null) {
      throw new Error("non-empty Gazette page requires announcementDate");
    }
    if (announcementDate === undefined) announcementDate = pageAnnouncementDate;
    if (announcementDate !== pageAnnouncementDate) {
      throw new Error("announcementDate drifted within checkpoint");
    }
    if (page.pageIndex > pages) {
      throw new Error(`page ${page.pageIndex} exceeds sourcePages=${pages}`);
    }

    page.rows.forEach((row, rowIndex) => {
      const normalized = normalizeRow(row, issue, `page ${page.pageIndex}.rows[${rowIndex}]`);
      if (ids.has(normalized.sourceRowId)) {
        throw new Error(`duplicate official row id within checkpoint: ${normalized.sourceRowId}`);
      }
      ids.add(normalized.sourceRowId);
      rowCount += 1;
    });

    if (page.pageIndex < pages && page.rows.length !== CNIPA_GAZETTE_PAGE_SIZE) {
      throw new Error(
        `non-terminal page ${page.pageIndex} must contain exactly ${CNIPA_GAZETTE_PAGE_SIZE} rows`,
      );
    }
    if (page.pageIndex === pages) {
      const expectedLastLength = total === 0 ? 0 : total % CNIPA_GAZETTE_PAGE_SIZE || 100;
      if (page.rows.length !== expectedLastLength) {
        throw new Error(
          `terminal page length mismatch: expected ${expectedLastLength}, got ${page.rows.length}`,
        );
      }
    }
  });

  if (sourceTotal === null || sourcePages === null || announcementDate === undefined) {
    throw new Error("checkpoint requires at least one page");
  }

  return {
    contractVersion: CNIPA_GAZETTE_RUNTIME_CONTRACT_VERSION,
    announcementIssue: issue,
    sourceTotal,
    sourcePages,
    announcementDate,
    pageSize: CNIPA_GAZETTE_PAGE_SIZE,
    range: { startPage, endPage },
    pages: input.pages,
    rowCount,
    uniqueOfficialRowIds: ids.size,
    completeness: "RANGE_COMPLETE",
  };
}

export function assembleCnipaGazetteAdmissionPackage(
  input: AssembleCnipaGazetteAdmissionInput,
): CnipaGazetteAdmissionPackage {
  const issue = positiveInteger(input.announcementIssue, "announcementIssue");
  if (input.checkpoints.length === 0) throw new Error("at least one checkpoint is required");

  const checkpoints = [...input.checkpoints].sort((a, b) => a.range.startPage - b.range.startPage);
  const first = checkpoints[0];
  if (!first) throw new Error("at least one checkpoint is required");

  const sourceTotal = nonNegativeInteger(first.sourceTotal, "sourceTotal");
  const sourcePages = positiveInteger(first.sourcePages, "sourcePages");
  const announcementDate = assertIsoDateOrNull(first.announcementDate);
  const requestedAnnouncementDate = assertIsoDateOrNull(input.announcementDate);
  if (requestedAnnouncementDate !== announcementDate) {
    throw new Error("input announcementDate does not match checkpoint announcementDate");
  }
  let nextPage = 1;
  const ids = new Set<string>();
  const records: CnipaGazetteAdmissionRow[] = [];

  checkpoints.forEach((checkpoint, checkpointIndex) => {
    if (checkpoint.contractVersion !== CNIPA_GAZETTE_RUNTIME_CONTRACT_VERSION) {
      throw new Error(`checkpoint[${checkpointIndex}] contract version is invalid`);
    }
    if (checkpoint.completeness !== "RANGE_COMPLETE") {
      throw new Error(`checkpoint[${checkpointIndex}] is not RANGE_COMPLETE`);
    }
    if (checkpoint.announcementIssue !== issue) {
      throw new Error(`checkpoint[${checkpointIndex}] belongs to a different issue`);
    }
    if (
      checkpoint.sourceTotal !== sourceTotal ||
      checkpoint.sourcePages !== sourcePages ||
      checkpoint.pageSize !== CNIPA_GAZETTE_PAGE_SIZE
    ) {
      throw new Error("source total/pages/pageSize drifted across checkpoints");
    }
    if (assertIsoDateOrNull(checkpoint.announcementDate) !== announcementDate) {
      throw new Error("announcementDate drifted across checkpoints");
    }
    if (checkpoint.range.startPage !== nextPage) {
      throw new Error(
        `checkpoint coverage gap/overlap: expected start page ${nextPage}, got ${checkpoint.range.startPage}`,
      );
    }
    nextPage = checkpoint.range.endPage + 1;

    checkpoint.pages.forEach((page) => {
      page.rows.forEach((row, rowIndex) => {
        const normalized = normalizeRow(row, issue, `page ${page.pageIndex}.rows[${rowIndex}]`);
        if (ids.has(normalized.sourceRowId)) {
          throw new Error(
            `duplicate official row id across checkpoints: ${normalized.sourceRowId}`,
          );
        }
        ids.add(normalized.sourceRowId);
        records.push({
          source_row_id: normalized.sourceRowId,
          source_search_id: normalized.sourceSearchId,
          registration_number: normalized.registrationNumber,
          announcement_issue: issue,
          announcement_type_code: normalized.announcementTypeCode,
          announcement_type_name: normalized.announcementTypeName,
          detail_page_no: normalized.detailPageNo,
          announcement_page_count: normalized.announcementPageCount,
          detail_file_id: normalized.detailFileId,
          detail_asset_path: normalized.detailAssetPath,
          announcement_detail_url: normalized.announcementDetailUrl,
        });
      });
    });
  });

  if (nextPage !== sourcePages + 1) {
    throw new Error(`checkpoint coverage is incomplete: ended before source page ${sourcePages}`);
  }
  if (records.length !== sourceTotal || ids.size !== sourceTotal) {
    throw new Error(
      `issue completeness mismatch: rows=${records.length}, uniqueIds=${ids.size}, sourceTotal=${sourceTotal}`,
    );
  }

  return {
    contract_version: CNIPA_GAZETTE_DATA_ENGINE_ADMISSION_VERSION,
    source_authority: "CNIPA",
    completeness: "COMPLETE",
    announcement_issue: issue,
    announcement_date: announcementDate,
    record_count: sourceTotal,
    page_count: sourcePages,
    page_size: CNIPA_GAZETTE_PAGE_SIZE,
    source_capture_schema: text(input.sourceCaptureSchema, "sourceCaptureSchema", 256),
    source_dataset_sha256: assertSha256(input.sourceDatasetSha256),
    source_uri: text(input.sourceUri, "sourceUri"),
    collected_at: assertInstant(input.collectedAt),
    records,
  };
}
