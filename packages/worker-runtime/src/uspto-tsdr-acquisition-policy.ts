export const USPTO_TSDR_ACQUISITION_POLICY_REVISION = "2026-09-18" as const;
export const USPTO_TSDR_API_ORIGIN = "https://tsdrapi.uspto.gov" as const;
export const USPTO_TSDR_API_KEY_HEADER = "USPTO-API-KEY" as const;
export const USPTO_TSDR_METADATA_MAX_REQUESTS_PER_MINUTE = 60 as const;
export const USPTO_TSDR_BINARY_MAX_REQUESTS_PER_MINUTE = 4 as const;

export type UsptoTsdrAcquisitionIntent = "CASE_DOCUMENT_INDEX" | "SELECTED_DOCUMENT_BINARY";

export type UsptoTsdrHighValueDocumentFamily =
  | "OFFICE_ACTION"
  | "APPLICANT_RESPONSE"
  | "NEXT_ACTION_NOTICE"
  | "OUTCOME_DOCUMENT"
  | "REGISTRATION_CERTIFICATE"
  | "POST_REGISTRATION_ACTION"
  | "PETITION_DECISION";

export type UsptoTsdrMetadataOnlyDocumentFamily =
  "APPLICATION_FILING" | "SPECIMEN" | "ROUTINE_CORRESPONDENCE" | "OTHER";

export type UsptoTsdrDocumentFamily =
  UsptoTsdrHighValueDocumentFamily | UsptoTsdrMetadataOnlyDocumentFamily;

export type UsptoTsdrDocumentSelection = {
  sourceIndexArtifactId: string;
  sourceDocumentId: string;
  sourceDocumentType: string;
  sourceDescription: string;
  family: UsptoTsdrDocumentFamily;
  classifierIdentity: string;
  classifierVersion: string;
};

export type UsptoTsdrDocumentIndexRequest = {
  intent: "CASE_DOCUMENT_INDEX";
  serialNumber: string;
  secretRef: string;
  requestsPerMinute: number;
  coverageClaim: "TARGET_SERIAL_ONLY";
  legalEffectClaim: false;
};

export type UsptoTsdrSelectedDocumentRequest = {
  intent: "SELECTED_DOCUMENT_BINARY";
  serialNumber: string;
  secretRef: string;
  requestsPerMinute: number;
  coverageClaim: "TARGET_SERIAL_ONLY";
  legalEffectClaim: false;
  format: "PDF" | "ZIP";
  document: UsptoTsdrDocumentSelection;
};

export type UsptoTsdrAcquisitionRequest =
  UsptoTsdrDocumentIndexRequest | UsptoTsdrSelectedDocumentRequest;

export type UsptoTsdrAcquisitionAdmission = {
  policyRevision: typeof USPTO_TSDR_ACQUISITION_POLICY_REVISION;
  apiOrigin: typeof USPTO_TSDR_API_ORIGIN;
  apiKeyHeader: typeof USPTO_TSDR_API_KEY_HEADER;
  intent: UsptoTsdrAcquisitionIntent;
  serialNumber: string;
  secretRef: string;
  requestBudgetPerMinute: number;
  sourceTruthAuthority: "USPTO_TSDR_EVIDENCE_ONLY";
  coverageScope: "TARGET_SERIAL_ONLY";
  populationCompleteClaimAllowed: false;
  legalEffectConclusionAllowed: false;
  artifactAdmission: "IMMUTABLE_INDEX_RESPONSE_REQUIRED" | "IMMUTABLE_RAW_BINARY_REQUIRED";
  document?: UsptoTsdrDocumentSelection;
  format?: "PDF" | "ZIP";
};

export type UsptoTsdrPolicyErrorCode =
  | "TSDR_REQUEST_INVALID"
  | "TSDR_SECRET_REFERENCE_REQUIRED"
  | "TSDR_RATE_LIMIT_EXCEEDED"
  | "TSDR_DOCUMENT_CLASSIFICATION_REQUIRED"
  | "TSDR_DOCUMENT_DOWNLOAD_NOT_ADMITTED"
  | "TSDR_AUTHORITY_CLAIM_FORBIDDEN";

export class UsptoTsdrPolicyError extends Error {
  constructor(
    public readonly code: UsptoTsdrPolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "UsptoTsdrPolicyError";
  }
}

const HIGH_VALUE_FAMILIES = new Set<UsptoTsdrDocumentFamily>([
  "OFFICE_ACTION",
  "APPLICANT_RESPONSE",
  "NEXT_ACTION_NOTICE",
  "OUTCOME_DOCUMENT",
  "REGISTRATION_CERTIFICATE",
  "POST_REGISTRATION_ACTION",
  "PETITION_DECISION",
]);

const DOCUMENT_FAMILIES = new Set<UsptoTsdrDocumentFamily>([
  ...HIGH_VALUE_FAMILIES,
  "APPLICATION_FILING",
  "SPECIMEN",
  "ROUTINE_CORRESPONDENCE",
  "OTHER",
]);

const SECRET_REFERENCE = /^sec_[0-9A-HJKMNP-TV-Z]{26}$/;
const ARTIFACT_ID = /^art_[0-9A-HJKMNP-TV-Z]{26}$/;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new UsptoTsdrPolicyError("TSDR_REQUEST_INVALID", `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  label: string,
): void {
  const accepted = new Set(required);
  const unknown = Object.keys(value).filter((key) => !accepted.has(key));
  const missing = required.filter((key) => !(key in value));
  if (unknown.length > 0 || missing.length > 0) {
    throw new UsptoTsdrPolicyError(
      "TSDR_REQUEST_INVALID",
      `${label} fields are invalid; missing=[${missing.join(",")}], unknown=[${unknown.join(",")}]`,
    );
  }
}

function text(value: unknown, label: string, maxLength = 512): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new UsptoTsdrPolicyError("TSDR_REQUEST_INVALID", `${label} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new UsptoTsdrPolicyError("TSDR_REQUEST_INVALID", `${label} is too long`);
  }
  return normalized;
}

function serialNumber(value: unknown): string {
  const serial = text(value, "serialNumber", 8);
  if (!/^\d{8}$/.test(serial)) {
    throw new UsptoTsdrPolicyError(
      "TSDR_REQUEST_INVALID",
      "serialNumber must contain exactly 8 digits",
    );
  }
  return serial;
}

function secretReference(value: unknown): string {
  const reference = text(value, "secretRef", 30);
  if (!SECRET_REFERENCE.test(reference)) {
    throw new UsptoTsdrPolicyError(
      "TSDR_SECRET_REFERENCE_REQUIRED",
      "TSDR acquisition requires a Schema v1 secretRef; raw API keys are forbidden",
    );
  }
  return reference;
}

function requestBudget(value: unknown, ceiling: number): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > ceiling) {
    throw new UsptoTsdrPolicyError(
      "TSDR_RATE_LIMIT_EXCEEDED",
      `requestsPerMinute must be an integer from 1 to ${ceiling}`,
    );
  }
  return value as number;
}

function authorityBoundary(value: Record<string, unknown>): void {
  if (value.coverageClaim !== "TARGET_SERIAL_ONLY" || value.legalEffectClaim !== false) {
    throw new UsptoTsdrPolicyError(
      "TSDR_AUTHORITY_CLAIM_FORBIDDEN",
      "TSDR acquisition cannot claim population completeness or legal effect",
    );
  }
}

function documentSelection(value: unknown): UsptoTsdrDocumentSelection {
  const selection = record(value, "document");
  exactKeys(
    selection,
    [
      "sourceDocumentId",
      "sourceIndexArtifactId",
      "sourceDocumentType",
      "sourceDescription",
      "family",
      "classifierIdentity",
      "classifierVersion",
    ],
    "document",
  );
  const family = text(selection.family, "document.family", 64) as UsptoTsdrDocumentFamily;
  if (!DOCUMENT_FAMILIES.has(family)) {
    throw new UsptoTsdrPolicyError(
      "TSDR_DOCUMENT_CLASSIFICATION_REQUIRED",
      `unsupported TSDR document family: ${family}`,
    );
  }
  const normalized = {
    sourceIndexArtifactId: text(
      selection.sourceIndexArtifactId,
      "document.sourceIndexArtifactId",
      30,
    ),
    sourceDocumentId: text(selection.sourceDocumentId, "document.sourceDocumentId"),
    sourceDocumentType: text(selection.sourceDocumentType, "document.sourceDocumentType"),
    sourceDescription: text(selection.sourceDescription, "document.sourceDescription", 2_048),
    family,
    classifierIdentity: text(selection.classifierIdentity, "document.classifierIdentity"),
    classifierVersion: text(selection.classifierVersion, "document.classifierVersion", 128),
  };
  if (!ARTIFACT_ID.test(normalized.sourceIndexArtifactId)) {
    throw new UsptoTsdrPolicyError(
      "TSDR_DOCUMENT_CLASSIFICATION_REQUIRED",
      "selected document must reference the immutable TSDR index RawArtifact",
    );
  }
  if (!HIGH_VALUE_FAMILIES.has(family)) {
    throw new UsptoTsdrPolicyError(
      "TSDR_DOCUMENT_DOWNLOAD_NOT_ADMITTED",
      `${family} is metadata-only under the current value-based download policy`,
    );
  }
  return normalized;
}

export function admitUsptoTsdrAcquisition(input: unknown): UsptoTsdrAcquisitionAdmission {
  const request = record(input, "request");
  const rawIntent = request.intent;
  if (rawIntent !== "CASE_DOCUMENT_INDEX" && rawIntent !== "SELECTED_DOCUMENT_BINARY") {
    throw new UsptoTsdrPolicyError(
      "TSDR_REQUEST_INVALID",
      "intent must be CASE_DOCUMENT_INDEX or SELECTED_DOCUMENT_BINARY",
    );
  }
  const intent: UsptoTsdrAcquisitionIntent = rawIntent;

  exactKeys(
    request,
    intent === "CASE_DOCUMENT_INDEX"
      ? [
          "intent",
          "serialNumber",
          "secretRef",
          "requestsPerMinute",
          "coverageClaim",
          "legalEffectClaim",
        ]
      : [
          "intent",
          "serialNumber",
          "secretRef",
          "requestsPerMinute",
          "coverageClaim",
          "legalEffectClaim",
          "format",
          "document",
        ],
    "request",
  );
  authorityBoundary(request);

  const common = {
    policyRevision: USPTO_TSDR_ACQUISITION_POLICY_REVISION,
    apiOrigin: USPTO_TSDR_API_ORIGIN,
    apiKeyHeader: USPTO_TSDR_API_KEY_HEADER,
    intent,
    serialNumber: serialNumber(request.serialNumber),
    secretRef: secretReference(request.secretRef),
    sourceTruthAuthority: "USPTO_TSDR_EVIDENCE_ONLY" as const,
    coverageScope: "TARGET_SERIAL_ONLY" as const,
    populationCompleteClaimAllowed: false as const,
    legalEffectConclusionAllowed: false as const,
  };

  if (intent === "CASE_DOCUMENT_INDEX") {
    return {
      ...common,
      requestBudgetPerMinute: requestBudget(
        request.requestsPerMinute,
        USPTO_TSDR_METADATA_MAX_REQUESTS_PER_MINUTE,
      ),
      artifactAdmission: "IMMUTABLE_INDEX_RESPONSE_REQUIRED",
    };
  }

  if (request.format !== "PDF" && request.format !== "ZIP") {
    throw new UsptoTsdrPolicyError(
      "TSDR_REQUEST_INVALID",
      "selected document format must be PDF or ZIP",
    );
  }
  return {
    ...common,
    requestBudgetPerMinute: requestBudget(
      request.requestsPerMinute,
      USPTO_TSDR_BINARY_MAX_REQUESTS_PER_MINUTE,
    ),
    artifactAdmission: "IMMUTABLE_RAW_BINARY_REQUIRED",
    format: request.format,
    document: documentSelection(request.document),
  };
}

export function usptoTsdrAcquisitionPolicyDescriptor() {
  return Object.freeze({
    revision: USPTO_TSDR_ACQUISITION_POLICY_REVISION,
    apiOrigin: USPTO_TSDR_API_ORIGIN,
    apiKeyHeader: USPTO_TSDR_API_KEY_HEADER,
    intents: Object.freeze(["CASE_DOCUMENT_INDEX", "SELECTED_DOCUMENT_BINARY"] as const),
    highValueDocumentFamilies: Object.freeze([...HIGH_VALUE_FAMILIES].sort()),
    metadataOnlyDocumentFamilies: Object.freeze([
      "APPLICATION_FILING",
      "SPECIMEN",
      "ROUTINE_CORRESPONDENCE",
      "OTHER",
    ] as const),
    rateLimitsPerApiKeyPerMinute: Object.freeze({
      metadata: USPTO_TSDR_METADATA_MAX_REQUESTS_PER_MINUTE,
      pdfOrZip: USPTO_TSDR_BINARY_MAX_REQUESTS_PER_MINUTE,
    }),
    populationCompleteClaimAllowed: false as const,
    legalEffectConclusionAllowed: false as const,
    productionExecutionImplemented: false as const,
  });
}
