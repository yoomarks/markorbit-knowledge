export const PAGE_VALUE_CAPABILITY_VERSION = "1.0" as const;
export const PAGE_VALUE_CAPABILITY_ID = "page-value-screening" as const;

export const PAGE_VALUE_PRIORITIES = ["HIGH", "MEDIUM", "LOW", "SKIP"] as const;
export type PageValuePriority = (typeof PAGE_VALUE_PRIORITIES)[number];

export type PageValueCandidateInput = {
  candidateId: string;
  url: string;
  title?: string;
  structuralSignals?: {
    discoveryMethod?: string;
    depth?: number;
    topic?: string;
    kind?: string;
    structuralScore?: number;
    reasonCodes?: string[];
  };
};

export type PageValueScreeningRequestV1 = {
  version: typeof PAGE_VALUE_CAPABILITY_VERSION;
  capability: typeof PAGE_VALUE_CAPABILITY_ID;
  locale: string;
  objective: string;
  candidates: PageValueCandidateInput[];
};

export type PageValueScreeningItemV1 = {
  candidateId: string;
  title: string;
  summary: string;
  pageType: string;
  valuePoints: string[];
  score: number;
  priority: PageValuePriority;
};

export type PageValueScreeningResponseV1 = {
  version: typeof PAGE_VALUE_CAPABILITY_VERSION;
  capability: typeof PAGE_VALUE_CAPABILITY_ID;
  provider: {
    providerId: string;
    model?: string;
    executionId?: string;
  };
  generatedAt: string;
  items: PageValueScreeningItemV1[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPageValueScreeningResponseV1(
  value: unknown,
): value is PageValueScreeningResponseV1 {
  if (!isRecord(value)) return false;
  if (
    value.version !== PAGE_VALUE_CAPABILITY_VERSION ||
    value.capability !== PAGE_VALUE_CAPABILITY_ID ||
    typeof value.generatedAt !== "string" ||
    !isRecord(value.provider) ||
    typeof value.provider.providerId !== "string" ||
    !Array.isArray(value.items)
  ) {
    return false;
  }
  return value.items.every((item) => {
    if (!isRecord(item)) return false;
    return (
      typeof item.candidateId === "string" &&
      typeof item.title === "string" &&
      typeof item.summary === "string" &&
      typeof item.pageType === "string" &&
      Array.isArray(item.valuePoints) &&
      item.valuePoints.every((point) => typeof point === "string") &&
      typeof item.score === "number" &&
      Number.isFinite(item.score) &&
      item.score >= 0 &&
      item.score <= 100 &&
      typeof item.priority === "string" &&
      PAGE_VALUE_PRIORITIES.includes(item.priority as PageValuePriority)
    );
  });
}
