import type { Job } from "@markorbit/contracts";
import {
  CNIPA_DOCUMENT_KINDS,
  CnipaAcquisitionError,
  parseCnipaTrademarkJudgmentQuery,
  type CnipaDocumentKind,
  type CnipaTrademarkJudgmentQuery,
} from "./cnipa-trademark-judgment";

export const CNIPA_QUERY_OVERRIDE_EXTENSION_KEY = "x-markorbit.cnipa-query" as const;
export const CNIPA_QUERY_TEMPLATE_EXTENSION_KEY = "x-markorbit.cnipa-query-template" as const;
export const SCHEDULE_SLOT_EXTENSION_KEY = "x-markorbit.schedule-slot-at" as const;

type CnipaScheduleSlotDateRangeTemplate = {
  mode: "SCHEDULE_SLOT_DATE_RANGE";
  documentKinds: readonly CnipaDocumentKind[];
  fromDayOffset: number;
  toDayOffset: number;
  timezone: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function templateError(message: string): never {
  throw new CnipaAcquisitionError("CNIPA_QUERY_TEMPLATE_INVALID", message, false);
}

function integerOffset(value: unknown, label: string): number {
  if (!Number.isInteger(value)) templateError(`${label} must be an integer`);
  const resolved = value as number;
  if (resolved < -31 || resolved > 0) {
    templateError(`${label} must be between -31 and 0`);
  }
  return resolved;
}

function singleDocumentKind(value: unknown): readonly CnipaDocumentKind[] {
  if (!Array.isArray(value) || value.length !== 1) {
    templateError("documentKinds must contain exactly one CNIPA document kind");
  }
  const kind = value[0];
  if (typeof kind !== "string" || !(CNIPA_DOCUMENT_KINDS as readonly string[]).includes(kind)) {
    templateError(`unsupported CNIPA document kind: ${String(kind)}`);
  }
  return [kind as CnipaDocumentKind];
}

function validTimezone(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    templateError("timezone must be a non-empty IANA timezone");
  }
  const timezone = value.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
  } catch {
    templateError(`invalid IANA timezone: ${timezone}`);
  }
  return timezone;
}

function defaultTemplateTimezone(job: Job): string | undefined {
  const schedule = job.planSnapshot.schedule;
  return schedule.mode === "CRON" ? schedule.timezone : undefined;
}

function parseTemplate(value: unknown, job: Job): CnipaScheduleSlotDateRangeTemplate {
  const input = record(value);
  if (!input || input.mode !== "SCHEDULE_SLOT_DATE_RANGE") {
    templateError("query template mode must be SCHEDULE_SLOT_DATE_RANGE");
  }
  const fromDayOffset = integerOffset(input.fromDayOffset ?? -1, "fromDayOffset");
  const toDayOffset = integerOffset(input.toDayOffset ?? -1, "toDayOffset");
  if (fromDayOffset > toDayOffset) {
    templateError("fromDayOffset must be less than or equal to toDayOffset");
  }
  const timezone = validTimezone(input.timezone ?? defaultTemplateTimezone(job));
  return {
    mode: "SCHEDULE_SLOT_DATE_RANGE",
    documentKinds: singleDocumentKind(input.documentKinds),
    fromDayOffset,
    toDayOffset,
    timezone,
  };
}

function scheduleSlot(job: Job): Date {
  const raw = job.extensions?.[SCHEDULE_SLOT_EXTENSION_KEY];
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    throw new CnipaAcquisitionError(
      "CNIPA_QUERY_SLOT_MISSING",
      "scheduled CNIPA query template requires x-markorbit.schedule-slot-at",
      false,
    );
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new CnipaAcquisitionError(
      "CNIPA_QUERY_SLOT_MISSING",
      "x-markorbit.schedule-slot-at must be an RFC3339 timestamp",
      false,
    );
  }
  return parsed;
}

function dateOnlyAt(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
      .map((part) => [part.type, part.value]),
  );
  if (!values.year || !values.month || !values.day) {
    templateError("failed to resolve schedule slot calendar date");
  }
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDateOnly(value: string, dayOffset: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + dayOffset));
  return shifted.toISOString().slice(0, 10);
}

function resolveTemplateQuery(job: Job, value: unknown): CnipaTrademarkJudgmentQuery {
  const template = parseTemplate(value, job);
  const slotDate = dateOnlyAt(scheduleSlot(job), template.timezone);
  return parseCnipaTrademarkJudgmentQuery({
    mode: "DATE_RANGE",
    fromDate: shiftDateOnly(slotDate, template.fromDayOffset),
    toDate: shiftDateOnly(slotDate, template.toDayOffset),
    documentKinds: template.documentKinds,
  });
}

export function resolveCnipaExecutionQuery(
  job: Job,
  staticQuery: unknown,
): CnipaTrademarkJudgmentQuery {
  const explicit = job.extensions?.[CNIPA_QUERY_OVERRIDE_EXTENSION_KEY];
  if (explicit !== undefined) {
    return parseCnipaTrademarkJudgmentQuery(explicit);
  }

  const template = job.planSnapshot.extensions?.[CNIPA_QUERY_TEMPLATE_EXTENSION_KEY];
  if (template !== undefined) {
    return resolveTemplateQuery(job, template);
  }

  return parseCnipaTrademarkJudgmentQuery(staticQuery);
}
