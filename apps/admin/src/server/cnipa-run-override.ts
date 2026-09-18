import type { Extensions } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";

export const CNIPA_MANUAL_QUERY_OVERRIDE_KEY = "x-markorbit.cnipa-query" as const;
const CNIPA_TRAFFIC_CLASS_KEY = "x-markorbit.cnipa-traffic-class" as const;
const CNIPA_DOCUMENT_KIND_KEY = "x-markorbit.cnipa-document-kind" as const;

const DOCUMENT_KINDS = new Set([
  "REGISTRATION_EXAMINATION",
  "OPPOSITION_DECISION",
  "REVIEW_ADJUDICATION",
] as const);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validation(message: string): never {
  throw new RegistryValidationError(message);
}

function parseDateOnly(value: unknown, field: string): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return validation(`${field} must use YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return validation(`${field} must be a real calendar date`);
  }
  return parsed;
}

export function parseCnipaManualRunExtensions(input: {
  rawExtensions: unknown;
  planExtensions: unknown;
  idempotencyKey: string | null;
}): Extensions | undefined {
  if (input.rawExtensions === undefined) return undefined;

  const planExtensions = record(input.planExtensions);
  if (
    planExtensions?.[CNIPA_TRAFFIC_CLASS_KEY] !== "FAST_LIST" ||
    planExtensions?.[CNIPA_DOCUMENT_KIND_KEY] === undefined
  ) {
    return validation("Manual extensions are only allowed for CNIPA FAST LIST plans");
  }

  const expectedKind = planExtensions[CNIPA_DOCUMENT_KIND_KEY];
  if (typeof expectedKind !== "string" || !DOCUMENT_KINDS.has(expectedKind as never)) {
    return validation("CNIPA FAST plan has an invalid frozen document kind");
  }

  if (!input.idempotencyKey?.trim()) {
    return validation("CNIPA historical override requires Idempotency-Key");
  }

  const extensions = record(input.rawExtensions);
  if (!extensions) return validation("extensions must be an object");
  const extensionKeys = Object.keys(extensions);
  if (
    extensionKeys.length !== 1 ||
    extensionKeys[0] !== CNIPA_MANUAL_QUERY_OVERRIDE_KEY
  ) {
    return validation(
      `CNIPA historical override only permits ${CNIPA_MANUAL_QUERY_OVERRIDE_KEY}`,
    );
  }

  const query = record(extensions[CNIPA_MANUAL_QUERY_OVERRIDE_KEY]);
  if (!query) return validation("CNIPA historical query override must be an object");

  const allowedQueryKeys = new Set(["mode", "fromDate", "toDate", "documentKinds"]);
  if (Object.keys(query).some((key) => !allowedQueryKeys.has(key))) {
    return validation("CNIPA historical query override contains an unsupported field");
  }
  if (query.mode !== "DATE_RANGE") {
    return validation("CNIPA historical query override mode must be DATE_RANGE");
  }

  const from = parseDateOnly(query.fromDate, "fromDate");
  const to = parseDateOnly(query.toDate, "toDate");
  if (from.getTime() > to.getTime()) {
    return validation("fromDate must be earlier than or equal to toDate");
  }
  const inclusiveDays = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (inclusiveDays > 30) {
    return validation("CNIPA historical DATE_RANGE cannot exceed 30 calendar days");
  }

  if (
    !Array.isArray(query.documentKinds) ||
    query.documentKinds.length !== 1 ||
    query.documentKinds[0] !== expectedKind
  ) {
    return validation("CNIPA historical document kind must match the frozen FAST plan kind");
  }

  return {
    [CNIPA_MANUAL_QUERY_OVERRIDE_KEY]: {
      mode: "DATE_RANGE",
      fromDate: query.fromDate as string,
      toDate: query.toDate as string,
      documentKinds: [expectedKind],
    },
  };
}
