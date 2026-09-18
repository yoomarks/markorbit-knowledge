import type { Extensions } from "@markorbit/contracts";
import { CNIPA_QUERY_OVERRIDE_EXTENSION_KEY } from "./cnipa-execution-query";
import {
  CNIPA_DOCUMENT_KINDS,
  CnipaAcquisitionError,
  type CnipaDocumentKind,
} from "./cnipa-trademark-judgment";

export const CNIPA_BACKFILL_MAX_DAYS = 31;

export type CnipaBackfillInput = {
  planId: string;
  documentKind: CnipaDocumentKind;
  fromDate: string;
  toDate: string;
};

export type CnipaBackfillDispatch = {
  date: string;
  idempotencyKey: string;
  extensions: Extensions;
};

function dateOnly(value: string, label: string): string {
  const normalized = value.trim();
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(normalized) ||
    Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))
  ) {
    throw new CnipaAcquisitionError(
      "CNIPA_BACKFILL_INVALID",
      `${label} must use YYYY-MM-DD`,
      false,
    );
  }
  return normalized;
}

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function nextDay(value: Date): Date {
  return new Date(value.getTime() + 86_400_000);
}

function supportedKind(value: CnipaDocumentKind): CnipaDocumentKind {
  if (!(CNIPA_DOCUMENT_KINDS as readonly string[]).includes(value)) {
    throw new CnipaAcquisitionError(
      "CNIPA_BACKFILL_INVALID",
      `unsupported CNIPA document kind: ${String(value)}`,
      false,
    );
  }
  return value;
}

function normalizedPlanId(value: string): string {
  const planId = value.trim();
  if (!planId) {
    throw new CnipaAcquisitionError("CNIPA_BACKFILL_INVALID", "planId is required", false);
  }
  return planId;
}

function idempotencyKey(planId: string, documentKind: CnipaDocumentKind, date: string): string {
  const key = `cnipa-backfill:${planId}:${documentKind}:${date}`;
  if (key.length > 128) {
    throw new CnipaAcquisitionError(
      "CNIPA_BACKFILL_INVALID",
      "backfill idempotency key exceeds the Execution Contract limit",
      false,
    );
  }
  return key;
}

export function planCnipaBackfill(input: CnipaBackfillInput): CnipaBackfillDispatch[] {
  const planId = normalizedPlanId(input.planId);
  const documentKind = supportedKind(input.documentKind);
  const fromDate = dateOnly(input.fromDate, "fromDate");
  const toDate = dateOnly(input.toDate, "toDate");
  if (fromDate > toDate) {
    throw new CnipaAcquisitionError(
      "CNIPA_BACKFILL_INVALID",
      "fromDate must be earlier than or equal to toDate",
      false,
    );
  }

  const dispatches: CnipaBackfillDispatch[] = [];
  const end = utcDate(toDate);
  for (let cursor = utcDate(fromDate); cursor.getTime() <= end.getTime(); cursor = nextDay(cursor)) {
    if (dispatches.length >= CNIPA_BACKFILL_MAX_DAYS) {
      throw new CnipaAcquisitionError(
        "CNIPA_BACKFILL_RANGE_TOO_LARGE",
        `CNIPA backfill is limited to ${CNIPA_BACKFILL_MAX_DAYS} days per dispatch batch`,
        false,
      );
    }
    const date = formatDate(cursor);
    dispatches.push({
      date,
      idempotencyKey: idempotencyKey(planId, documentKind, date),
      extensions: {
        [CNIPA_QUERY_OVERRIDE_EXTENSION_KEY]: {
          mode: "DATE_RANGE",
          fromDate: date,
          toDate: date,
          documentKinds: [documentKind],
        },
      },
    });
  }
  return dispatches;
}
