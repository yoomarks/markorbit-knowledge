import { createHash } from "node:crypto";
import {
  WIPO_MGS_SNAPSHOT_SCHEMA_VERSION,
  WIPO_MGS_SOURCE_ID,
  type WipoMgsJurisdictionStatus,
  type WipoMgsLanguage,
  type WipoMgsLocalizedTerm,
  type WipoMgsSnapshot,
  type WipoMgsSnapshotAnomaly,
} from "@markorbit/contracts";
import type { SourceAdapterPort } from "./source-adapter-port";

export {
  WIPO_MGS_SNAPSHOT_SCHEMA_VERSION,
  WIPO_MGS_SOURCE_ID,
  type WipoMgsJurisdictionStatus,
  type WipoMgsLanguage,
  type WipoMgsLocalizedTerm,
  type WipoMgsSnapshot,
  type WipoMgsSnapshotAnomaly,
} from "@markorbit/contracts";

const LANGUAGE_CODE = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const JURISDICTION_CODE = /^[A-Z][A-Z0-9-]{1,7}$/;
const MAX_RECORDS = 100_000;
const MAX_TERM_TEXT_LENGTH = 32_768;

export type WipoMgsSnapshotDiff = {
  added: WipoMgsLocalizedTerm[];
  changed: Array<{ before: WipoMgsLocalizedTerm; after: WipoMgsLocalizedTerm }>;
  notObserved: WipoMgsLocalizedTerm[];
  unchanged: WipoMgsLocalizedTerm[];
};

export type WipoMgsTermEntity = {
  sourceTermId: string;
  niceClass: number;
  localizedTerms: Record<string, WipoMgsLocalizedTerm>;
};

export type WipoMgsEntityBuildResult = {
  entities: WipoMgsTermEntity[];
  anomalies: Array<{
    code: "SOURCE_TERM_CLASS_CONFLICT";
    sourceTermId: string;
    niceClasses: number[];
  }>;
};

export class WipoMgsValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WipoMgsValidationError";
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  const container = record(value);
  if (!container) return value;
  return Object.fromEntries(
    Object.entries(container)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalValue(child)]),
  );
}

export function canonicalWipoMgsJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function decodeUtf8(value: string | Uint8Array): string {
  if (typeof value === "string") return value;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    throw new WipoMgsValidationError("MGS_INVALID_UTF8", "MGS response is not valid UTF-8");
  }
}

function parseNiceClass(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d{1,2}$/.test(value.trim())
        ? Number(value)
        : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 45 ? parsed : null;
}

function sourceTermId(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 128 ? normalized : null;
}

function jurisdictionCodes(value: unknown): { codes: string[]; recognized: boolean } {
  if (value === undefined || value === null || value === "") return { codes: [], recognized: true };
  const rawItems = Array.isArray(value) ? value : [value];
  const codes: string[] = [];
  for (const rawItem of rawItems) {
    if (typeof rawItem !== "string") return { codes: [], recognized: false };
    const trimmed = rawItem.trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/[\s,;|/]+/u).filter(Boolean);
    if (tokens.length === 0 || tokens.some((token) => !JURISDICTION_CODE.test(token))) {
      return { codes: [], recognized: false };
    }
    codes.push(...tokens);
  }
  return { codes: [...new Set(codes)].sort(), recognized: true };
}

function jurisdictionStatuses(
  accepted: readonly string[],
  rejected: readonly string[],
): WipoMgsJurisdictionStatus[] {
  const acceptedSet = new Set(accepted);
  const rejectedSet = new Set(rejected);
  return [...new Set([...accepted, ...rejected])].sort().map((jurisdictionCode) => ({
    jurisdictionCode,
    status:
      acceptedSet.has(jurisdictionCode) && rejectedSet.has(jurisdictionCode)
        ? "conflict"
        : acceptedSet.has(jurisdictionCode)
          ? "accepted"
          : "rejected",
  }));
}

export function parseWipoMgsLanguageRegistry(html: string): WipoMgsLanguage[] {
  const match = /\blanguageOptions\s*=\s*'(\[[\s\S]*?\])'/u.exec(html);
  if (!match) {
    throw new WipoMgsValidationError(
      "MGS_LANGUAGE_REGISTRY_NOT_FOUND",
      "MGS page did not expose its languageOptions registry",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]!);
  } catch {
    throw new WipoMgsValidationError(
      "MGS_LANGUAGE_REGISTRY_INVALID",
      "MGS languageOptions is not valid JSON",
    );
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 100) {
    throw new WipoMgsValidationError(
      "MGS_LANGUAGE_REGISTRY_INVALID",
      "MGS languageOptions must be a bounded non-empty array",
    );
  }

  const languages = parsed.map((value, index): WipoMgsLanguage => {
    const item = record(value);
    if (!item || typeof item.code !== "string" || typeof item.link !== "string") {
      throw new WipoMgsValidationError(
        "MGS_LANGUAGE_REGISTRY_INVALID",
        `MGS languageOptions entry ${index} is incomplete`,
      );
    }
    const localeCode = item.code.trim();
    let requestLanguage: string;
    try {
      requestLanguage =
        new URL(item.link, "https://webaccess.wipo.int/mgs/").searchParams.get("lang") ?? "";
    } catch {
      requestLanguage = "";
    }
    if (!LANGUAGE_CODE.test(localeCode) || !LANGUAGE_CODE.test(requestLanguage)) {
      throw new WipoMgsValidationError(
        "MGS_LANGUAGE_REGISTRY_INVALID",
        `MGS languageOptions entry ${index} has an invalid language code`,
      );
    }
    return {
      localeCode,
      requestLanguage,
      displayName:
        typeof item.name === "string" && item.name.trim() ? item.name.trim() : localeCode,
    };
  });

  if (
    new Set(languages.map((item) => item.localeCode)).size !== languages.length ||
    new Set(languages.map((item) => item.requestLanguage)).size !== languages.length
  ) {
    throw new WipoMgsValidationError(
      "MGS_LANGUAGE_REGISTRY_INVALID",
      "MGS languageOptions contains duplicate language mappings",
    );
  }
  return languages;
}

export type ParseWipoMgsSnapshotInput = {
  requestLanguage: string;
  localeCode?: string;
  niceClass: number;
  sourceVersion?: string | null;
  historicalExpectedCount?: number;
};

export function parseWipoMgsSnapshot(
  body: string | Uint8Array,
  input: ParseWipoMgsSnapshotInput,
): WipoMgsSnapshot {
  if (!LANGUAGE_CODE.test(input.requestLanguage)) {
    throw new WipoMgsValidationError(
      "MGS_LANGUAGE_INVALID",
      "MGS request language must be a bounded language code",
    );
  }
  const localeCode = input.localeCode ?? input.requestLanguage;
  if (!LANGUAGE_CODE.test(localeCode)) {
    throw new WipoMgsValidationError(
      "MGS_LANGUAGE_INVALID",
      "MGS locale code must be a bounded language code",
    );
  }
  const niceClass = parseNiceClass(input.niceClass);
  if (niceClass === null) {
    throw new WipoMgsValidationError("MGS_CLASS_INVALID", "MGS Nice class must be from 1 to 45");
  }

  const text = decodeUtf8(body)
    .replace(/^\uFEFF/u, "")
    .trim();
  if (!text.startsWith("[")) {
    if (/^</u.test(text) || /captcha|access denied|forbidden|too many requests/iu.test(text)) {
      throw new WipoMgsValidationError(
        "MGS_ACCESS_RESTRICTED",
        "MGS returned an HTML or access-restriction response instead of a JSON array",
      );
    }
    throw new WipoMgsValidationError(
      "MGS_RESPONSE_NOT_JSON_ARRAY",
      "MGS response is not a JSON array",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new WipoMgsValidationError("MGS_INVALID_JSON", "MGS response body is invalid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new WipoMgsValidationError(
      "MGS_RESPONSE_NOT_JSON_ARRAY",
      "MGS response root must be a JSON array",
    );
  }
  if (parsed.length === 0) {
    throw new WipoMgsValidationError("MGS_EMPTY_RESULT", "MGS returned an empty class result");
  }
  if (parsed.length > MAX_RECORDS) {
    throw new WipoMgsValidationError(
      "MGS_COUNT_LIMIT_EXCEEDED",
      `MGS response exceeds the ${MAX_RECORDS}-record safety bound`,
    );
  }

  const anomalies: WipoMgsSnapshotAnomaly[] = [];
  const seen = new Set<string>();
  const acceptedLanguages = new Set([input.requestLanguage, localeCode]);
  const records = parsed.map((value, index): WipoMgsLocalizedTerm => {
    const rawPayload = record(value);
    if (!rawPayload) {
      throw new WipoMgsValidationError(
        "MGS_SCHEMA_CHANGED",
        `MGS record ${index} is not an object`,
      );
    }
    const id = sourceTermId(rawPayload.id);
    const rowClass = parseNiceClass(rawPayload.cls);
    const language = typeof rawPayload.lng === "string" ? rawPayload.lng.trim() : "";
    const termText = typeof rawPayload.txt === "string" ? rawPayload.txt : "";
    if (
      !id ||
      rowClass === null ||
      !language ||
      !termText ||
      termText.length > MAX_TERM_TEXT_LENGTH
    ) {
      throw new WipoMgsValidationError(
        "MGS_SCHEMA_CHANGED",
        `MGS record ${index} is missing a valid id, cls, lng, or txt field`,
      );
    }
    if (rowClass !== niceClass) {
      throw new WipoMgsValidationError(
        "MGS_CLASS_MISMATCH",
        `MGS record ${id} reports class ${rowClass}, expected ${niceClass}`,
      );
    }
    if (!acceptedLanguages.has(language)) {
      throw new WipoMgsValidationError(
        "MGS_LANGUAGE_MISMATCH",
        `MGS record ${id} reports language ${language}, expected ${[...acceptedLanguages].join(" or ")}`,
      );
    }
    if (seen.has(id)) {
      throw new WipoMgsValidationError(
        "MGS_DUPLICATE_ID",
        `MGS class snapshot contains duplicate source term id ${id}`,
      );
    }
    seen.add(id);

    const accepted = jurisdictionCodes(rawPayload.acc);
    const rejected = jurisdictionCodes(rawPayload.rej);
    if (!accepted.recognized) {
      anomalies.push({
        code: "ACCEPTANCE_FORMAT_UNKNOWN",
        sourceTermId: id,
        message: "acc was preserved but not parsed because its format is unknown",
      });
    }
    if (!rejected.recognized) {
      anomalies.push({
        code: "REJECTION_FORMAT_UNKNOWN",
        sourceTermId: id,
        message: "rej was preserved but not parsed because its format is unknown",
      });
    }
    return {
      sourceTermId: id,
      niceClass,
      language: localeCode,
      termText,
      seq: rawPayload.seq ?? null,
      src: rawPayload.src ?? null,
      prf: rawPayload.prf ?? null,
      accRaw: rawPayload.acc ?? null,
      rejRaw: rawPayload.rej ?? null,
      acceptedJurisdictions: accepted.codes,
      rejectedJurisdictions: rejected.codes,
      jurisdictionStatuses: jurisdictionStatuses(accepted.codes, rejected.codes),
      contentHash: sha256(canonicalWipoMgsJson(rawPayload)),
      rawPayload: structuredClone(rawPayload),
    };
  });

  if (
    input.historicalExpectedCount !== undefined &&
    input.historicalExpectedCount !== records.length
  ) {
    anomalies.push({
      code: "COUNT_CHANGED",
      message: `MGS returned ${records.length} records; historical comparison count is ${input.historicalExpectedCount}`,
    });
  }

  records.sort((left, right) =>
    left.sourceTermId.localeCompare(right.sourceTermId, "en", { numeric: true }),
  );
  return {
    schemaVersion: WIPO_MGS_SNAPSHOT_SCHEMA_VERSION,
    source: WIPO_MGS_SOURCE_ID,
    requestLanguage: input.requestLanguage,
    localeCode,
    niceClass,
    sourceVersion: input.sourceVersion ?? null,
    responseSha256: sha256(typeof body === "string" ? new TextEncoder().encode(body) : body),
    recordCount: records.length,
    records,
    anomalies,
  };
}

function localizedKey(term: WipoMgsLocalizedTerm): string {
  return `${term.niceClass}\u0000${term.sourceTermId}\u0000${term.language}`;
}

export function diffWipoMgsSnapshots(
  before: WipoMgsSnapshot,
  after: WipoMgsSnapshot,
): WipoMgsSnapshotDiff {
  if (
    before.requestLanguage !== after.requestLanguage ||
    before.localeCode !== after.localeCode ||
    before.niceClass !== after.niceClass
  ) {
    throw new WipoMgsValidationError(
      "MGS_DIFF_SCOPE_MISMATCH",
      "MGS snapshot diff requires the same language and Nice class",
    );
  }
  const beforeByKey = new Map(before.records.map((term) => [localizedKey(term), term]));
  const afterByKey = new Map(after.records.map((term) => [localizedKey(term), term]));
  const added: WipoMgsLocalizedTerm[] = [];
  const changed: WipoMgsSnapshotDiff["changed"] = [];
  const unchanged: WipoMgsLocalizedTerm[] = [];
  for (const [key, afterTerm] of afterByKey) {
    const beforeTerm = beforeByKey.get(key);
    if (!beforeTerm) added.push(afterTerm);
    else if (beforeTerm.contentHash === afterTerm.contentHash) unchanged.push(afterTerm);
    else changed.push({ before: beforeTerm, after: afterTerm });
  }
  const notObserved = [...beforeByKey]
    .filter(([key]) => !afterByKey.has(key))
    .map(([, term]) => term);
  return { added, changed, notObserved, unchanged };
}

export function buildWipoMgsTermEntities(
  snapshots: readonly WipoMgsSnapshot[],
): WipoMgsEntityBuildResult {
  const classesById = new Map<string, Set<number>>();
  const entities = new Map<string, WipoMgsTermEntity>();
  for (const snapshot of snapshots) {
    for (const term of snapshot.records) {
      const classes = classesById.get(term.sourceTermId) ?? new Set<number>();
      classes.add(term.niceClass);
      classesById.set(term.sourceTermId, classes);
      const key = `${term.niceClass}\u0000${term.sourceTermId}`;
      const entity = entities.get(key) ?? {
        sourceTermId: term.sourceTermId,
        niceClass: term.niceClass,
        localizedTerms: {},
      };
      const existing = entity.localizedTerms[term.language];
      if (existing && existing.contentHash !== term.contentHash) {
        throw new WipoMgsValidationError(
          "MGS_DUPLICATE_LOCALIZED_TERM",
          `Multiple different ${term.language} records were supplied for ${term.sourceTermId} in class ${term.niceClass}`,
        );
      }
      entity.localizedTerms[term.language] = term;
      entities.set(key, entity);
    }
  }
  const anomalies = [...classesById]
    .filter(([, classes]) => classes.size > 1)
    .map(([id, classes]) => ({
      code: "SOURCE_TERM_CLASS_CONFLICT" as const,
      sourceTermId: id,
      niceClasses: [...classes].sort((left, right) => left - right),
    }));
  return {
    entities: [...entities.values()].sort(
      (left, right) =>
        left.niceClass - right.niceClass ||
        left.sourceTermId.localeCompare(right.sourceTermId, "en", { numeric: true }),
    ),
    anomalies,
  };
}

export type WipoSourceAdapterRequest =
  | { operation: "LANGUAGE_REGISTRY"; html: string }
  | { operation: "PARSE_SNAPSHOT"; body: string | Uint8Array; input: ParseWipoMgsSnapshotInput };

/**
 * Pure WIPO MGS adapter. Network execution stays in the governed artifact acquirer so fixture
 * parsing, normalization, multilingual mapping, and diffing can be verified without live access.
 */
export class WipoSourceAdapter implements SourceAdapterPort {
  readonly sourceId = WIPO_MGS_SOURCE_ID;

  async fetch(request: unknown): Promise<unknown> {
    const input = record(request) as WipoSourceAdapterRequest | null;
    if (input?.operation === "LANGUAGE_REGISTRY" && typeof input.html === "string") {
      return parseWipoMgsLanguageRegistry(input.html);
    }
    if (input?.operation === "PARSE_SNAPSHOT" && "body" in input && "input" in input) {
      return parseWipoMgsSnapshot(input.body, input.input);
    }
    throw new WipoMgsValidationError(
      "MGS_ADAPTER_REQUEST_INVALID",
      "WIPO MGS adapter request is invalid",
    );
  }
}
