import { RegistryValidationError } from "@markorbit/persistence";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export type KnowledgeSearchDateRange = {
  generatedFrom?: string;
  generatedTo?: string;
};

type SearchParamsReader = {
  get(name: string): string | null;
};

function parseDateOnly(value: string | null, field: string): { value?: string; timestamp?: number } {
  const normalized = value?.trim();
  if (!normalized) return {};
  if (!DATE_ONLY.test(normalized)) {
    throw new RegistryValidationError(`${field} must use YYYY-MM-DD`);
  }
  const timestamp = Date.parse(`${normalized}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== normalized) {
    throw new RegistryValidationError(`${field} must be a valid UTC calendar date`);
  }
  return { value: normalized, timestamp };
}

export function readKnowledgeSearchDateRange(
  searchParams: SearchParamsReader,
): KnowledgeSearchDateRange {
  const from = parseDateOnly(searchParams.get("generatedFrom"), "generatedFrom");
  const to = parseDateOnly(searchParams.get("generatedTo"), "generatedTo");
  if (from.timestamp !== undefined && to.timestamp !== undefined && from.timestamp > to.timestamp) {
    throw new RegistryValidationError("generatedFrom must be on or before generatedTo");
  }
  return {
    ...(from.value ? { generatedFrom: from.value } : {}),
    ...(to.value ? { generatedTo: to.value } : {}),
  };
}

export function filterKnowledgeSearchByGeneratedDate<T extends { generatedAt: string }>(
  items: readonly T[],
  range: KnowledgeSearchDateRange,
): T[] {
  const from = range.generatedFrom
    ? Date.parse(`${range.generatedFrom}T00:00:00.000Z`)
    : Number.NEGATIVE_INFINITY;
  const to = range.generatedTo
    ? Date.parse(`${range.generatedTo}T00:00:00.000Z`) + DAY_MS
    : Number.POSITIVE_INFINITY;

  return items.filter((item) => {
    const generatedAt = Date.parse(item.generatedAt);
    return Number.isFinite(generatedAt) && generatedAt >= from && generatedAt < to;
  });
}
