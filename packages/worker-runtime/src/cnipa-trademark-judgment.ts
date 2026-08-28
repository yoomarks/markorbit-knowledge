import { createHash } from "node:crypto";

export const CNIPA_JUDGMENT_SCHEMA_STATUS = "OPERATOR_SUPPLIED_UNVERIFIED" as const;
export const CNIPA_JUDGMENT_SCHEMA_REVISION = "candidate-2026-08-29" as const;

export type CnipaDocumentKind =
  | "REGISTRATION_EXAMINATION"
  | "OPPOSITION_DECISION"
  | "REVIEW_ADJUDICATION";

export type CnipaPartyRole =
  | "APPLICANT"
  | "RESPONDENT"
  | "OPPOSER"
  | "OPPOSED_PARTY"
  | "UNVERIFIED";

export type CnipaCoverageStatus = "COMPLETE" | "PARTIAL" | "UNKNOWN";

export type CnipaParty = {
  role: CnipaPartyRole;
  name: string;
  sourceField?: string;
};

export type CnipaRegistrationNumberQuery = {
  mode: "REGISTRATION_NUMBER";
  registrationNumber: string;
  documentKinds?: readonly CnipaDocumentKind[];
};

export type CnipaPartyNameQuery = {
  mode: "PARTY_NAME";
  partyName: string;
  documentKinds?: readonly CnipaDocumentKind[];
};

export type CnipaDateRangeQuery = {
  mode: "DATE_RANGE";
  fromDate: string;
  toDate: string;
  documentKinds?: readonly CnipaDocumentKind[];
};

export type CnipaTrademarkJudgmentQuery =
  | CnipaRegistrationNumberQuery
  | CnipaPartyNameQuery
  | CnipaDateRangeQuery;

export type CnipaCandidateEndpointSpec = {
  documentKind: CnipaDocumentKind;
  listPath: string;
  detailPath: string;
  candidatePartyFields: readonly string[];
  schemaStatus: typeof CNIPA_JUDGMENT_SCHEMA_STATUS;
};

/**
 * Operator-observed candidates only. These paths/fields are deliberately not
 * described as verified until an authenticated live probe freezes the schema.
 */
export const CNIPA_CANDIDATE_ENDPOINTS: Readonly<Record<CnipaDocumentKind, CnipaCandidateEndpointSpec>> = {
  REGISTRATION_EXAMINATION: {
    documentKind: "REGISTRATION_EXAMINATION",
    listPath: "/pubnotice/portal/tmscJudgment/queryPageList",
    detailPath: "/tmscJudgment/queryInfo",
    candidatePartyFields: ["applicantCnName"],
    schemaStatus: CNIPA_JUDGMENT_SCHEMA_STATUS,
  },
  OPPOSITION_DECISION: {
    documentKind: "OPPOSITION_DECISION",
    listPath: "/pubnotice/portal/tmyyJudgment/queryPageList",
    detailPath: "/tmyyJudgment/queryInfo",
    candidatePartyFields: ["objenderCnName", "objeperCnName"],
    schemaStatus: CNIPA_JUDGMENT_SCHEMA_STATUS,
  },
  REVIEW_ADJUDICATION: {
    documentKind: "REVIEW_ADJUDICATION",
    listPath: "/pubnotice/portal/tmpsJudgment/queryPageList",
    detailPath: "/tmpsJudgment/queryInfo",
    candidatePartyFields: ["applicantName", "respondentName"],
    schemaStatus: CNIPA_JUDGMENT_SCHEMA_STATUS,
  },
};

export const CNIPA_DOCUMENT_KINDS = Object.freeze([
  "REGISTRATION_EXAMINATION",
  "OPPOSITION_DECISION",
  "REVIEW_ADJUDICATION",
] as const satisfies readonly CnipaDocumentKind[]);

export type CnipaAuthenticatedRequest = {
  method: "GET" | "POST";
  path: string;
  documentKind: CnipaDocumentKind;
  surface: "LIST" | "DETAIL";
  query?: Readonly<Record<string, string>>;
  jsonBody?: Readonly<Record<string, string | number>>;
};

export type CnipaSessionSecurityState =
  | "OK"
  | "REAUTH_REQUIRED"
  | "ACCESS_DENIED"
  | "RATE_LIMITED";

/**
 * A sealed browser/session execution result. Implementations may use cookies,
 * OAuth tokens or browser storage internally, but none of those values may cross
 * this port. `body` must contain only sanitized source-response bytes.
 */
export type CnipaAuthenticatedSessionResponse = {
  status: number;
  sourceUri: string;
  contentType: string;
  observedAt: string;
  body: Uint8Array;
  securityState: CnipaSessionSecurityState;
};

export interface CnipaAuthenticatedSessionExecutor {
  execute(request: CnipaAuthenticatedRequest): Promise<CnipaAuthenticatedSessionResponse>;
}

export type CnipaDecodedListPage = {
  sourceRecordIds: string[];
  total?: number;
  hasMore?: boolean;
};

export type CnipaDecodedDetail = {
  sourceRecordId: string;
  registrationNumber?: string;
  trademarkName?: string;
  decisionDate?: string;
  documentNumber?: string;
  contentHtml?: string;
  contentText?: string;
  parties: CnipaParty[];
};

/**
 * Raw JSON shape is intentionally delegated until authenticated live evidence
 * verifies CNIPA's response envelope and field semantics.
 */
export interface CnipaJudgmentResponseDecoder {
  decodeList(documentKind: CnipaDocumentKind, value: unknown): CnipaDecodedListPage;
  decodeDetail(
    documentKind: CnipaDocumentKind,
    sourceRecordId: string,
    value: unknown,
  ): CnipaDecodedDetail;
}

export type CnipaJudgmentDocument = CnipaDecodedDetail & {
  identity: string;
  documentKind: CnipaDocumentKind;
  identityStatus: "PROVISIONAL_UNTIL_AUTHENTICATED_LIVE_VALIDATION";
  sourceUri: string;
  observedSchemaRevision: typeof CNIPA_JUDGMENT_SCHEMA_REVISION;
};

export type CnipaResponseEvidence = {
  evidenceKind: "LIST_JSON" | "DETAIL_JSON";
  documentKind: CnipaDocumentKind;
  sourceRecordId?: string;
  sourceUri: string;
  observedAt: string;
  mediaType: string;
  sha256: string;
  content: Uint8Array;
};

export type CnipaJudgmentCollection = {
  sourceId: "CNIPA";
  query: CnipaTrademarkJudgmentQuery;
  documents: CnipaJudgmentDocument[];
  evidence: CnipaResponseEvidence[];
  coverageStatus: CnipaCoverageStatus;
  coverageReasons: string[];
  schemaStatus: typeof CNIPA_JUDGMENT_SCHEMA_STATUS;
  schemaRevision: typeof CNIPA_JUDGMENT_SCHEMA_REVISION;
};

export type CnipaAcquisitionErrorCode =
  | "CNIPA_QUERY_INVALID"
  | "CNIPA_SCHEMA_UNVERIFIED"
  | "CNIPA_REAUTH_REQUIRED"
  | "CNIPA_ACCESS_DENIED"
  | "CNIPA_RATE_LIMITED"
  | "CNIPA_SCHEMA_CHANGED"
  | "CNIPA_COVERAGE_UNKNOWN"
  | "CNIPA_SOURCE_REJECTED"
  | "CNIPA_SOURCE_TEMPORARY_FAILURE"
  | "CNIPA_DELIVERY_UNKNOWN"
  | "CNIPA_DETAIL_LIMIT_EXCEEDED";

export class CnipaAcquisitionError extends Error {
  constructor(
    readonly code: CnipaAcquisitionErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CnipaAcquisitionError";
  }
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CnipaAcquisitionError("CNIPA_QUERY_INVALID", `${label} is required`, false);
  }
  return value.trim();
}

function dateOnly(value: unknown, label: string): string {
  const result = nonEmpty(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) {
    throw new CnipaAcquisitionError(
      "CNIPA_QUERY_INVALID",
      `${label} must use YYYY-MM-DD`,
      false,
    );
  }
  return result;
}

function documentKinds(value: unknown): readonly CnipaDocumentKind[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new CnipaAcquisitionError(
      "CNIPA_QUERY_INVALID",
      "documentKinds must be a non-empty array when supplied",
      false,
    );
  }
  const allowed = new Set<string>(CNIPA_DOCUMENT_KINDS);
  const resolved = value.map((item) => {
    if (typeof item !== "string" || !allowed.has(item)) {
      throw new CnipaAcquisitionError(
        "CNIPA_QUERY_INVALID",
        `Unsupported CNIPA document kind: ${String(item)}`,
        false,
      );
    }
    return item as CnipaDocumentKind;
  });
  return [...new Set(resolved)];
}

export function parseCnipaTrademarkJudgmentQuery(value: unknown): CnipaTrademarkJudgmentQuery {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CnipaAcquisitionError("CNIPA_QUERY_INVALID", "CNIPA query must be an object", false);
  }
  const input = value as Record<string, unknown>;
  const kinds = documentKinds(input.documentKinds);
  if (input.mode === "REGISTRATION_NUMBER") {
    return {
      mode: "REGISTRATION_NUMBER",
      registrationNumber: nonEmpty(input.registrationNumber, "registrationNumber"),
      ...(kinds ? { documentKinds: kinds } : {}),
    };
  }
  if (input.mode === "PARTY_NAME") {
    return {
      mode: "PARTY_NAME",
      partyName: nonEmpty(input.partyName, "partyName"),
      ...(kinds ? { documentKinds: kinds } : {}),
    };
  }
  if (input.mode === "DATE_RANGE") {
    const fromDate = dateOnly(input.fromDate, "fromDate");
    const toDate = dateOnly(input.toDate, "toDate");
    if (fromDate > toDate) {
      throw new CnipaAcquisitionError(
        "CNIPA_QUERY_INVALID",
        "fromDate must be earlier than or equal to toDate",
        false,
      );
    }
    return {
      mode: "DATE_RANGE",
      fromDate,
      toDate,
      ...(kinds ? { documentKinds: kinds } : {}),
    };
  }
  throw new CnipaAcquisitionError(
    "CNIPA_QUERY_INVALID",
    "mode must be REGISTRATION_NUMBER, PARTY_NAME, or DATE_RANGE",
    false,
  );
}

export function resolveCnipaDocumentKinds(
  query: CnipaTrademarkJudgmentQuery,
): readonly CnipaDocumentKind[] {
  return query.documentKinds?.length ? query.documentKinds : CNIPA_DOCUMENT_KINDS;
}

/**
 * Only registration-number request parameters have been supplied by the operator.
 * Party/date parameter names are intentionally not guessed before live validation.
 */
export function buildCnipaCandidateListRequest(
  documentKind: CnipaDocumentKind,
  query: CnipaTrademarkJudgmentQuery,
): CnipaAuthenticatedRequest {
  const endpoint = CNIPA_CANDIDATE_ENDPOINTS[documentKind];
  if (query.mode !== "REGISTRATION_NUMBER") {
    throw new CnipaAcquisitionError(
      "CNIPA_SCHEMA_UNVERIFIED",
      `${query.mode} request parameter names are not yet authenticated-live-verified`,
      false,
    );
  }
  return {
    method: "POST",
    path: endpoint.listPath,
    documentKind,
    surface: "LIST",
    jsonBody: {
      pageIndex: 1,
      pageSize: 10,
      regNo: query.registrationNumber,
    },
  };
}

export function buildCnipaCandidateDetailRequest(
  documentKind: CnipaDocumentKind,
  sourceRecordId: string,
): CnipaAuthenticatedRequest {
  const id = nonEmpty(sourceRecordId, "sourceRecordId");
  return {
    method: "GET",
    path: CNIPA_CANDIDATE_ENDPOINTS[documentKind].detailPath,
    documentKind,
    surface: "DETAIL",
    query: { id },
  };
}

export function provisionalCnipaDocumentIdentity(
  documentKind: CnipaDocumentKind,
  sourceRecordId: string,
): string {
  return `${documentKind}:${nonEmpty(sourceRecordId, "sourceRecordId")}`;
}

export function assertCnipaSessionResponse(
  response: CnipaAuthenticatedSessionResponse,
): CnipaAuthenticatedSessionResponse {
  if (response.securityState === "REAUTH_REQUIRED" || response.status === 401) {
    throw new CnipaAcquisitionError(
      "CNIPA_REAUTH_REQUIRED",
      "CNIPA authenticated browser session requires operator re-login",
      false,
      response.status,
    );
  }
  if (response.securityState === "ACCESS_DENIED" || response.status === 403) {
    throw new CnipaAcquisitionError(
      "CNIPA_ACCESS_DENIED",
      "CNIPA rejected the authenticated request",
      false,
      response.status,
    );
  }
  if (response.securityState === "RATE_LIMITED" || response.status === 429) {
    throw new CnipaAcquisitionError(
      "CNIPA_RATE_LIMITED",
      "CNIPA rate-limited the authenticated request",
      true,
      response.status,
    );
  }
  if (response.status >= 500) {
    throw new CnipaAcquisitionError(
      "CNIPA_SOURCE_TEMPORARY_FAILURE",
      `CNIPA returned HTTP ${response.status}`,
      true,
      response.status,
    );
  }
  if (response.status < 200 || response.status >= 300) {
    throw new CnipaAcquisitionError(
      "CNIPA_SOURCE_REJECTED",
      `CNIPA returned HTTP ${response.status}`,
      false,
      response.status,
    );
  }
  if (!response.contentType.toLowerCase().includes("json")) {
    throw new CnipaAcquisitionError(
      "CNIPA_SCHEMA_CHANGED",
      `Expected CNIPA JSON but received ${response.contentType}`,
      false,
      response.status,
    );
  }
  return response;
}

export function parseCnipaJson(response: CnipaAuthenticatedSessionResponse): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.body));
  } catch (error) {
    throw new CnipaAcquisitionError(
      "CNIPA_SCHEMA_CHANGED",
      "CNIPA response was not valid UTF-8 JSON",
      false,
      response.status,
      error instanceof Error ? { cause: error } : undefined,
    );
  }
  return parsed;
}

export function cnipaResponseEvidence(
  response: CnipaAuthenticatedSessionResponse,
  request: CnipaAuthenticatedRequest,
  sourceRecordId?: string,
): CnipaResponseEvidence {
  return {
    evidenceKind: request.surface === "LIST" ? "LIST_JSON" : "DETAIL_JSON",
    documentKind: request.documentKind,
    ...(sourceRecordId ? { sourceRecordId } : {}),
    sourceUri: response.sourceUri,
    observedAt: response.observedAt,
    mediaType: response.contentType,
    sha256: createHash("sha256").update(response.body).digest("hex"),
    content: response.body,
  };
}
