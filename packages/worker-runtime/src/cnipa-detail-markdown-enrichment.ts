import { CnipaAcquisitionError, type CnipaDocumentKind } from "./cnipa-trademark-judgment";

export const CNIPA_DETAIL_MARKDOWN_ENRICHMENT_VERSION =
  "cnipa-detail-markdown-enrichment-v1" as const;

const MAX_DEPTH = 8;
const MAX_FACTS = 250;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 20_000;
const TOP_LEVEL_CONTROL_FIELDS = new Set(["code", "message", "msg", "success", "timestamp"]);

export type CnipaDetailMarkdownFactV1 = {
  path: string;
  value: string | number | boolean;
};

export type CnipaDetailMarkdownEnrichmentV1 = {
  schemaVersion: typeof CNIPA_DETAIL_MARKDOWN_ENRICHMENT_VERSION;
  documentKind: CnipaDocumentKind;
  sourceRecordId: string;
  logicalDocumentUri: string;
  detailFactCount: number;
  facts: readonly CnipaDetailMarkdownFactV1[];
  markdownBody: string;
};

type Scalar = string | number | boolean;

function fail(message: string): never {
  throw new CnipaAcquisitionError("CNIPA_SCHEMA_CHANGED", message, false);
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) return fail(label + " is required");
  return normalized;
}

function logicalDocumentUri(documentKind: CnipaDocumentKind, sourceRecordId: string): string {
  return "cnipa://judgment/" + documentKind + "/" + encodeURIComponent(sourceRecordId);
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");
}

function scalarText(value: Scalar): string {
  if (typeof value === "string") return value;
  return String(value);
}

function valueAlreadyRepresented(baseNormalized: string, value: Scalar): boolean {
  const text = normalizeText(scalarText(value));
  if (!text) return true;
  if (typeof value === "string") {
    return text.length >= 3 && baseNormalized.includes(text);
  }
  const escaped = text.replace(/[.*+?^$()|[\]\\]/gu, "\\$&");
  return new RegExp("(^|[^0-9a-z])" + escaped + "([^0-9a-z]|$)", "u").test(baseNormalized);
}

function safeString(value: string, path: string): string {
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  if (!normalized) return "";
  if (normalized.length > MAX_STRING_LENGTH) {
    return fail("CNIPA DETAIL field " + path + " exceeds the enrichment bound");
  }
  return normalized;
}

function pushFact(facts: CnipaDetailMarkdownFactV1[], path: string, value: unknown): void {
  if (facts.length >= MAX_FACTS) {
    fail("CNIPA DETAIL enrichment exceeds " + MAX_FACTS + " scalar facts");
  }
  if (typeof value === "string") {
    const normalized = safeString(value, path);
    if (normalized) facts.push({ path, value: normalized });
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("CNIPA DETAIL field " + path + " is not finite");
    facts.push({ path, value });
    return;
  }
  if (typeof value === "boolean") facts.push({ path, value });
}

function flatten(
  value: unknown,
  path: string,
  facts: CnipaDetailMarkdownFactV1[],
  depth: number,
): void {
  if (depth > MAX_DEPTH) {
    fail("CNIPA DETAIL field " + (path || "<root>") + " exceeds nesting bound");
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (path) pushFact(facts, path, value);
    return;
  }
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      fail("CNIPA DETAIL array " + (path || "<root>") + " exceeds item bound");
    }
    value.forEach((child, index) => flatten(child, path + "[" + index + "]", facts, depth + 1));
    return;
  }
  if (typeof value !== "object") {
    fail("CNIPA DETAIL field " + (path || "<root>") + " has unsupported value type");
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const childPath = path ? path + "." + key : key;
    flatten(child, childPath, facts, depth + 1);
  }
}

function sourcePayload(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail("CNIPA DETAIL response must be an object");
  }
  const root = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(root, "data")) return root.data;
  return Object.fromEntries(
    Object.entries(root).filter(([key]) => !TOP_LEVEL_CONTROL_FIELDS.has(key)),
  );
}

function markdownScalar(value: Scalar): string {
  if (typeof value !== "string") return String(value);
  return value.replace(/\\/gu, "\\\\").replace(/`/gu, "\\`").replace(/\n/gu, "<br>");
}

function render(baseMarkdown: string, facts: readonly CnipaDetailMarkdownFactV1[]): string {
  const base = baseMarkdown.replace(/\r\n?/gu, "\n").replace(/\s+$/u, "");
  const tick = String.fromCharCode(96);
  const lines = [
    base,
    "",
    "## DETAIL enrichment",
    "",
    "The following source facts were observed only in the CNIPA DETAIL evidence:",
    "",
    ...facts.map((fact) => "- " + tick + fact.path + tick + ": " + markdownScalar(fact.value)),
    "",
  ];
  return lines.join("\n");
}

export function materializeCnipaDetailMarkdownEnrichment(input: {
  documentKind: CnipaDocumentKind;
  sourceRecordId: string;
  listMarkdownBody: string;
  detailValue: unknown;
}): CnipaDetailMarkdownEnrichmentV1 | null {
  const sourceRecordId = required(input.sourceRecordId, "sourceRecordId");
  const listMarkdownBody = required(input.listMarkdownBody, "listMarkdownBody");
  const allFacts: CnipaDetailMarkdownFactV1[] = [];
  flatten(sourcePayload(input.detailValue), "", allFacts, 0);

  const baseNormalized = normalizeText(listMarkdownBody);
  const seen = new Set<string>();
  const materialFacts = allFacts.filter((fact) => {
    if (valueAlreadyRepresented(baseNormalized, fact.value)) return false;
    const identity = fact.path + "\u0000" + JSON.stringify(fact.value);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  if (materialFacts.length === 0) return null;

  return {
    schemaVersion: CNIPA_DETAIL_MARKDOWN_ENRICHMENT_VERSION,
    documentKind: input.documentKind,
    sourceRecordId,
    logicalDocumentUri: logicalDocumentUri(input.documentKind, sourceRecordId),
    detailFactCount: materialFacts.length,
    facts: materialFacts,
    markdownBody: render(listMarkdownBody, materialFacts),
  };
}

export function materializeCnipaDetailMarkdownEnrichmentBytes(input: {
  documentKind: CnipaDocumentKind;
  sourceRecordId: string;
  listMarkdownContent: Uint8Array;
  detailContent: Uint8Array;
}): CnipaDetailMarkdownEnrichmentV1 | null {
  let listMarkdownBody: string;
  let detailValue: unknown;
  try {
    listMarkdownBody = new TextDecoder("utf-8", { fatal: true }).decode(input.listMarkdownContent);
    detailValue = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.detailContent));
  } catch (error) {
    throw new CnipaAcquisitionError(
      "CNIPA_SCHEMA_CHANGED",
      "CNIPA DETAIL enrichment input was not valid UTF-8 Markdown/JSON",
      false,
      undefined,
      error instanceof Error ? { cause: error } : undefined,
    );
  }
  return materializeCnipaDetailMarkdownEnrichment({
    documentKind: input.documentKind,
    sourceRecordId: input.sourceRecordId,
    listMarkdownBody,
    detailValue,
  });
}
