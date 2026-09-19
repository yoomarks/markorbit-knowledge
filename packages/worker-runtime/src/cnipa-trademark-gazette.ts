export const CNIPA_GAZETTE_SCHEMA_STATUS = "OFFICIAL_FRONTEND_STATIC_CODE_OBSERVED" as const;

export const CNIPA_GAZETTE_SOURCE_FAMILY = "CNIPA_TRADEMARK_GAZETTE" as const;

export const CNIPA_GAZETTE_ENDPOINTS = Object.freeze({
  latestIssue: "/toas-pub-prod/pub-prod-api/public/web/anncInfo/maxIssue",
  typeDictionary: "/toas-pub-prod/pub-prod-api/public/web/anncInfo/queryTmggTypeDict",
  list: "/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
  pageFile: "/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmggFile",
  fileAddress: "/toas-pub-prod/pub-prod-api/public/web/portal/fileAddr",
});

export const CNIPA_GAZETTE_FRONTEND_STATIC_EVIDENCE = Object.freeze({
  status: CNIPA_GAZETTE_SCHEMA_STATUS,
  observedDate: "2026-09-19",
  evidenceKind: "OPERATOR_RETRIEVED_OFFICIAL_STATIC_APPLICATION_CODE",
  publicPage: "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/portalui-pub-prod/brandNotice",
  publicApiBasePath: "/toas-pub-prod/pub-prod-api",
  sso: Object.freeze({
    clientId: "trademark_three_public",
    authorizationPath: "https://sso.cnipa.gov.cn/oauth2/authorize",
    redirectUri: "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/pubauth/login",
    stateRoute: "portalui-pub-prod/brandNotice",
  }),
  frontendInitialPageIndex: 1,
  frontendInitialPageSize: 10,
  frontendPageSizeOptions: Object.freeze([10, 20, 50, 100]),
  frontendListFields: Object.freeze([
    "anncIssue",
    "anncDate",
    "anncTypeName",
    "regNo",
    "registerCnName",
    "tmName",
  ]),
  listRequestFields: Object.freeze([
    "anncIssue",
    "anncType",
    "regNo",
    "tmName",
    "intlCls",
    "registerCnName",
    "coowner",
    "agentName",
    "tmType",
    "tmDescType",
    "startDate",
    "endDate",
    "pageIndex",
    "pageSize",
  ]),
  uiAllAnnouncementTypeValue: "",
  pageFileRequestFields: Object.freeze([
    "anncIssue",
    "anncType",
    "pageNo",
    "pageIndex",
    "pageSize",
  ]),
  pageFileArtifactField: "imgDir",
  detailSemantics: Object.freeze({
    organization: "ISSUE_TYPE_PAGE",
    perListRowDecisionDocument: false,
    pageNavigationUsesIssueTypeAndPageNumber: true,
    pageArtifactMayBePdfOrImage: true,
  }),
  doesNotVerify: Object.freeze([
    "LIVE_RESPONSE_ENVELOPE_OR_SCHEMA",
    "LIVE_ROW_IDENTITY",
    "BACKEND_PAGINATION_COMPLETENESS",
    "ANNOUNCEMENT_DETAIL_URL_DERIVATION",
    "ANNOUNCEMENT_TYPE_CODE_SEMANTICS",
    "ISSUE_POPULATION_COMPLETENESS",
  ]),
});

export const CNIPA_GAZETTE_OPERATOR_PLANNING_BASELINE = Object.freeze({
  evidenceKind: "OPERATOR_SUPPLIED_SOURCE_HISTORY",
  observedDate: "2026-09-19",
  historicalFloor: Object.freeze({
    announcementIssue: 73,
    announcementDate: "1983-07-15",
  }),
  currentKnownUpperBound: Object.freeze({
    announcementIssue: 1999,
    announcementDate: "2026-09-13",
  }),
  historicalCadenceNote:
    "Earlier Gazette publication was generally semi-monthly, commonly two issues per month with some three-issue months.",
  currentExpectedPublicationDaysOfMonth: Object.freeze([6, 13, 20, 27]),
  currentCadenceNote: "Current Gazette publication is weekly.",
  planningOnly: true,
  synthesizeHistoricalPublicationDates: false,
});

export const CNIPA_GAZETTE_CAPTURE_POLICY = Object.freeze({
  captureTool: "MO CNIPA Network Capture",
  captureMechanism: "CHROME_DEBUGGER_CDP",
  primaryHistoricalKey: "ANNOUNCEMENT_ISSUE",
  announcementTypeSelection: "ALL",
  capturedAnnouncementTypeValue: "",
  pageSize: 100,
  reuseCapturedSuccessfulListPostBody: true,
  mutateOnlyPagingFieldsDuringSweep: true,
  expectedExportSchema: "mo-cnipa-gazette-dataset-v1",
  detailAcquisitionMode: "CANDIDATE_ONLY",
});

export type CnipaGazetteRequest = {
  method: "GET" | "POST";
  path: string;
  surface: "LATEST_ISSUE" | "TYPE_DICTIONARY" | "LIST" | "PAGE_FILE" | "FILE_ADDRESS";
  jsonBody?: Readonly<Record<string, string | number>>;
};

type GazetteCapturedListBody = Readonly<Record<string, unknown>>;

function requiredText(value: unknown, label: string, maximum = 200): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) {
    throw new TypeError(`${label} must be a non-empty string of at most ${maximum} characters.`);
  }
  return value.trim();
}

function positiveInteger(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return resolved;
}

function scalarRequestBody(value: GazetteCapturedListBody): Record<string, string | number> {
  const body: Record<string, string | number> = {};
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string" || typeof child === "number") body[key] = child;
  }
  return body;
}

export function buildCnipaGazetteLatestIssueRequest(): CnipaGazetteRequest {
  return {
    method: "GET",
    path: CNIPA_GAZETTE_ENDPOINTS.latestIssue,
    surface: "LATEST_ISSUE",
  };
}

export function buildCnipaGazetteTypeDictionaryRequest(): CnipaGazetteRequest {
  return {
    method: "POST",
    path: CNIPA_GAZETTE_ENDPOINTS.typeDictionary,
    surface: "TYPE_DICTIONARY",
  };
}

export function buildCnipaGazetteFileAddressRequest(): CnipaGazetteRequest {
  return {
    method: "GET",
    path: CNIPA_GAZETTE_ENDPOINTS.fileAddress,
    surface: "FILE_ADDRESS",
  };
}

/**
 * Mirrors MO CNIPA Network Capture v0.7/v0.8 behavior: start from a successful
 * operator-browser LIST POST body and change only paging fields. For the Gazette
 * historical sweep we additionally require an issue query with announcement type = ALL.
 */
export function buildCnipaGazetteIssueAllPageRequest(input: {
  capturedListBody: GazetteCapturedListBody;
  pageIndex: number;
}): CnipaGazetteRequest {
  const base = scalarRequestBody(input.capturedListBody);
  const announcementIssue = requiredText(base.anncIssue, "capturedListBody.anncIssue");
  if (base.anncType !== "") {
    throw new TypeError(
      "capturedListBody.anncType must be the official frontend ALL value (empty string).",
    );
  }

  return {
    method: "POST",
    path: CNIPA_GAZETTE_ENDPOINTS.list,
    surface: "LIST",
    jsonBody: {
      ...base,
      anncIssue: announcementIssue,
      anncType: "",
      pageIndex: positiveInteger(input.pageIndex, 1, "pageIndex"),
      pageSize: CNIPA_GAZETTE_CAPTURE_POLICY.pageSize,
    },
  };
}

export function buildCnipaGazettePageFileRequest(input: {
  announcementIssue: string;
  announcementType: string;
  pageNumber: number;
}): CnipaGazetteRequest {
  return {
    method: "POST",
    path: CNIPA_GAZETTE_ENDPOINTS.pageFile,
    surface: "PAGE_FILE",
    jsonBody: {
      pageSize: 1,
      pageIndex: 1,
      pageNo: positiveInteger(input.pageNumber, 1, "pageNumber"),
      anncIssue: requiredText(input.announcementIssue, "announcementIssue"),
      anncType: requiredText(input.announcementType, "announcementType"),
    },
  };
}
