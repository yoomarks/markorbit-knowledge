export const WIPO_MGS_SOURCE_ID = "WIPO_MGS" as const;
export const WIPO_MGS_SNAPSHOT_SCHEMA_VERSION = "WIPO_MGS_SNAPSHOT_V1" as const;

export type WipoMgsLanguage = {
  localeCode: string;
  requestLanguage: string;
  displayName: string;
};

export type WipoMgsJurisdictionStatus = {
  jurisdictionCode: string;
  status: "accepted" | "rejected" | "conflict";
};

export type WipoMgsLocalizedTerm = {
  sourceTermId: string;
  niceClass: number;
  language: string;
  termText: string;
  seq: unknown;
  src: unknown;
  prf: unknown;
  accRaw: unknown;
  rejRaw: unknown;
  acceptedJurisdictions: string[];
  rejectedJurisdictions: string[];
  jurisdictionStatuses: WipoMgsJurisdictionStatus[];
  contentHash: string;
  rawPayload: Record<string, unknown>;
};

export type WipoMgsSnapshotAnomaly = {
  code: "COUNT_CHANGED" | "ACCEPTANCE_FORMAT_UNKNOWN" | "REJECTION_FORMAT_UNKNOWN";
  message: string;
  sourceTermId?: string;
};

export type WipoMgsSnapshot = {
  schemaVersion: typeof WIPO_MGS_SNAPSHOT_SCHEMA_VERSION;
  source: typeof WIPO_MGS_SOURCE_ID;
  requestLanguage: string;
  localeCode: string;
  niceClass: number;
  sourceVersion: string | null;
  responseSha256: string;
  recordCount: number;
  records: WipoMgsLocalizedTerm[];
  anomalies: WipoMgsSnapshotAnomaly[];
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isJurisdictionStatus(value: unknown): value is WipoMgsJurisdictionStatus {
  const item = record(value);
  return Boolean(
    item &&
    typeof item.jurisdictionCode === "string" &&
    (item.status === "accepted" || item.status === "rejected" || item.status === "conflict"),
  );
}

function isLocalizedTerm(value: unknown): value is WipoMgsLocalizedTerm {
  const item = record(value);
  return Boolean(
    item &&
    typeof item.sourceTermId === "string" &&
    Number.isInteger(item.niceClass) &&
    typeof item.language === "string" &&
    typeof item.termText === "string" &&
    stringArray(item.acceptedJurisdictions) &&
    stringArray(item.rejectedJurisdictions) &&
    Array.isArray(item.jurisdictionStatuses) &&
    item.jurisdictionStatuses.every(isJurisdictionStatus) &&
    typeof item.contentHash === "string" &&
    /^[a-f0-9]{64}$/u.test(item.contentHash) &&
    record(item.rawPayload),
  );
}

function isSnapshotAnomaly(value: unknown): value is WipoMgsSnapshotAnomaly {
  const item = record(value);
  return Boolean(
    item &&
    (item.code === "COUNT_CHANGED" ||
      item.code === "ACCEPTANCE_FORMAT_UNKNOWN" ||
      item.code === "REJECTION_FORMAT_UNKNOWN") &&
    typeof item.message === "string" &&
    (item.sourceTermId === undefined || typeof item.sourceTermId === "string"),
  );
}

export function isWipoMgsSnapshot(value: unknown): value is WipoMgsSnapshot {
  const item = record(value);
  const languageCode = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/u;
  if (
    !item ||
    item.schemaVersion !== WIPO_MGS_SNAPSHOT_SCHEMA_VERSION ||
    item.source !== WIPO_MGS_SOURCE_ID ||
    typeof item.requestLanguage !== "string" ||
    !languageCode.test(item.requestLanguage) ||
    typeof item.localeCode !== "string" ||
    !languageCode.test(item.localeCode) ||
    !Number.isInteger(item.niceClass) ||
    (item.niceClass as number) < 1 ||
    (item.niceClass as number) > 45 ||
    (item.sourceVersion !== null && typeof item.sourceVersion !== "string") ||
    typeof item.responseSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(item.responseSha256) ||
    !Number.isInteger(item.recordCount) ||
    (item.recordCount as number) < 1 ||
    (item.recordCount as number) > 100_000 ||
    !Array.isArray(item.records) ||
    !Array.isArray(item.anomalies) ||
    item.recordCount !== item.records.length
  ) {
    return false;
  }
  if (!item.anomalies.every(isSnapshotAnomaly) || !item.records.every(isLocalizedTerm))
    return false;
  const records = item.records as WipoMgsLocalizedTerm[];
  return (
    records.every(
      (term) => term.niceClass === item.niceClass && term.language === item.localeCode,
    ) && new Set(records.map((term) => term.sourceTermId)).size === records.length
  );
}
