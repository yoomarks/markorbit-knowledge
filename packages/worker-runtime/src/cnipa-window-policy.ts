import { CnipaAcquisitionError } from "./cnipa-trademark-judgment";

export const CNIPA_DEFAULT_HISTORICAL_FLOOR = "2016-01-01" as const;
export const CNIPA_MAX_DATE_RANGE_DAYS = 30 as const;
export const CNIPA_DEFAULT_TARGET_PAGES_PER_WINDOW = 20 as const;

export type CnipaHistoricalWindowDays = 30 | 7 | 1;

export type CnipaDateWindow = {
  fromDate: string;
  toDate: string;
};

export type CnipaHistoricalWindowPlan = CnipaDateWindow & {
  windowDays: CnipaHistoricalWindowDays;
};

export type CnipaHistoricalWindowObservation = CnipaDateWindow & {
  requestedWindowDays: CnipaHistoricalWindowDays;
  pageCount: number;
  uniqueRecordCount: number;
  reachedSafetyCeiling: boolean;
};

export type CnipaHistoricalWindowDecision =
  | {
      action: "ADVANCE";
      nextWindowDays: CnipaHistoricalWindowDays;
    }
  | {
      action: "REPLAY_SMALLER";
      nextWindowDays: Exclude<CnipaHistoricalWindowDays, 30> | 1;
    }
  | {
      action: "BLOCKED_AT_DAILY_CEILING";
      nextWindowDays: 1;
    };

function policyError(message: string): never {
  throw new CnipaAcquisitionError("CNIPA_QUERY_TEMPLATE_INVALID", message, false);
}

function parseDateOnly(value: string, label: string): Date {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    policyError(`${label} must use YYYY-MM-DD`);
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    policyError(`${label} must be a real calendar date in YYYY-MM-DD`);
  }
  return parsed;
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const parsed = parseDateOnly(value, "date");
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return formatDateOnly(parsed);
}

export function cnipaInclusiveCalendarDays(fromDate: string, toDate: string): number {
  const from = parseDateOnly(fromDate, "fromDate");
  const to = parseDateOnly(toDate, "toDate");
  if (from.getTime() > to.getTime()) {
    policyError("fromDate must be earlier than or equal to toDate");
  }
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

export function planCnipaHistoricalWindow(input: {
  cursorDate: string;
  throughDate: string;
  windowDays: CnipaHistoricalWindowDays;
}): CnipaHistoricalWindowPlan | null {
  const cursor = parseDateOnly(input.cursorDate, "cursorDate");
  const through = parseDateOnly(input.throughDate, "throughDate");
  if (cursor.getTime() > through.getTime()) return null;

  const requestedEnd = new Date(cursor.getTime());
  requestedEnd.setUTCDate(requestedEnd.getUTCDate() + input.windowDays - 1);
  const end = requestedEnd.getTime() > through.getTime() ? through : requestedEnd;

  return {
    fromDate: formatDateOnly(cursor),
    toDate: formatDateOnly(end),
    windowDays: input.windowDays,
  };
}

function smallerWindow(days: CnipaHistoricalWindowDays): CnipaHistoricalWindowDays {
  return days === 30 ? 7 : 1;
}

function validateObservation(observation: CnipaHistoricalWindowObservation): number {
  if (!Number.isSafeInteger(observation.pageCount) || observation.pageCount < 1) {
    policyError("pageCount must be a positive integer");
  }
  if (!Number.isSafeInteger(observation.uniqueRecordCount) || observation.uniqueRecordCount < 0) {
    policyError("uniqueRecordCount must be a non-negative integer");
  }
  const actualDays = cnipaInclusiveCalendarDays(observation.fromDate, observation.toDate);
  if (actualDays > observation.requestedWindowDays) {
    policyError("observed window cannot exceed requestedWindowDays");
  }
  if (actualDays > CNIPA_MAX_DATE_RANGE_DAYS) {
    policyError(`CNIPA DATE_RANGE cannot exceed ${CNIPA_MAX_DATE_RANGE_DAYS} calendar days`);
  }
  return actualDays;
}

export function decideCnipaHistoricalWindow(input: {
  observation: CnipaHistoricalWindowObservation;
  targetPagesPerWindow?: number;
}): CnipaHistoricalWindowDecision {
  const actualDays = validateObservation(input.observation);
  const targetPages = input.targetPagesPerWindow ?? CNIPA_DEFAULT_TARGET_PAGES_PER_WINDOW;
  if (!Number.isSafeInteger(targetPages) || targetPages < 1 || targetPages > 49) {
    policyError("targetPagesPerWindow must be an integer between 1 and 49");
  }

  const current = input.observation.requestedWindowDays;
  if (input.observation.reachedSafetyCeiling) {
    if (current === 1) {
      return { action: "BLOCKED_AT_DAILY_CEILING", nextWindowDays: 1 };
    }
    return { action: "REPLAY_SMALLER", nextWindowDays: smallerWindow(current) as 7 | 1 };
  }

  if (current === 1 || input.observation.pageCount <= targetPages) {
    return { action: "ADVANCE", nextWindowDays: current };
  }

  const pagesPerDay = input.observation.pageCount / actualDays;
  if (current === 30) {
    const projectedSevenDayPages = Math.ceil(pagesPerDay * 7);
    return {
      action: "ADVANCE",
      nextWindowDays: projectedSevenDayPages <= targetPages ? 7 : 1,
    };
  }

  return { action: "ADVANCE", nextWindowDays: 1 };
}

function localDateAt(instant: Date, timezone: string): string {
  try {
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
      policyError("failed to resolve schedule slot calendar date");
    }
    return `${values.year}-${values.month}-${values.day}`;
  } catch (error) {
    if (error instanceof CnipaAcquisitionError) throw error;
    policyError(`invalid IANA timezone: ${timezone}`);
  }
}

export function resolveCnipaWeekdayIncrementalWindow(
  slot: Date,
  timezone: string,
): CnipaDateWindow {
  if (Number.isNaN(slot.getTime())) {
    policyError("schedule slot must be a valid instant");
  }

  const localDate = localDateAt(slot, timezone);
  const weekday = parseDateOnly(localDate, "localDate").getUTCDay();

  if (weekday === 0 || weekday === 6) {
    policyError("CNIPA weekday incremental collection must not run on Saturday or Sunday");
  }

  if (weekday === 1) {
    return {
      fromDate: addDays(localDate, -3),
      toDate: addDays(localDate, -1),
    };
  }

  const previousDay = addDays(localDate, -1);
  return { fromDate: previousDay, toDate: previousDay };
}
