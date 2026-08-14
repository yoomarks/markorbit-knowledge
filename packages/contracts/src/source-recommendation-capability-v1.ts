export const SOURCE_RECOMMENDATION_CAPABILITY_VERSION = "1.0" as const;
export const SOURCE_RECOMMENDATION_CAPABILITY_ID = "source-recommendation" as const;

export const SOURCE_RECOMMENDATION_PRIORITIES = ["HIGH", "MEDIUM", "LOW", "SKIP"] as const;
export type SourceRecommendationPriority = (typeof SOURCE_RECOMMENDATION_PRIORITIES)[number];

export const SOURCE_RECOMMENDATION_RELATION_HINTS = [
  "OFFICIAL_LINK",
  "RELATED_PUBLICATION",
  "SAME_ORGANIZATION",
  "REFERENCES",
  "OTHER",
] as const;
export type SourceRecommendationRelationHint =
  (typeof SOURCE_RECOMMENDATION_RELATION_HINTS)[number];

export type SourceRecommendationContextV1 = {
  sourceId: string;
  name: string;
  canonicalUrl: string;
  entrypoints: string[];
  jurisdictions: string[];
  languages: string[];
  category: string;
  authorityLevel: string;
};

export type SourceRecommendationRequestV1 = {
  version: typeof SOURCE_RECOMMENDATION_CAPABILITY_VERSION;
  capability: typeof SOURCE_RECOMMENDATION_CAPABILITY_ID;
  locale: string;
  objective: string;
  maxResults: number;
  source: SourceRecommendationContextV1;
  knownUrls: string[];
};

export type SourceRecommendationItemV1 = {
  url: string;
  title: string;
  summary: string;
  reason: string;
  relationshipHint: SourceRecommendationRelationHint;
  score: number;
  priority: SourceRecommendationPriority;
  evidenceUrls?: string[];
};

export type SourceRecommendationResponseV1 = {
  version: typeof SOURCE_RECOMMENDATION_CAPABILITY_VERSION;
  capability: typeof SOURCE_RECOMMENDATION_CAPABILITY_ID;
  provider: {
    providerId: string;
    model?: string;
    executionId?: string;
  };
  generatedAt: string;
  items: SourceRecommendationItemV1[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isSourceRecommendationResponseV1(
  value: unknown,
): value is SourceRecommendationResponseV1 {
  if (!isRecord(value)) return false;
  if (
    value.version !== SOURCE_RECOMMENDATION_CAPABILITY_VERSION ||
    value.capability !== SOURCE_RECOMMENDATION_CAPABILITY_ID ||
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
      isHttpUrl(item.url) &&
      typeof item.title === "string" &&
      item.title.trim().length > 0 &&
      typeof item.summary === "string" &&
      typeof item.reason === "string" &&
      typeof item.relationshipHint === "string" &&
      SOURCE_RECOMMENDATION_RELATION_HINTS.includes(
        item.relationshipHint as SourceRecommendationRelationHint,
      ) &&
      typeof item.score === "number" &&
      Number.isFinite(item.score) &&
      item.score >= 0 &&
      item.score <= 100 &&
      typeof item.priority === "string" &&
      SOURCE_RECOMMENDATION_PRIORITIES.includes(item.priority as SourceRecommendationPriority) &&
      (item.evidenceUrls === undefined ||
        (Array.isArray(item.evidenceUrls) && item.evidenceUrls.every(isHttpUrl)))
    );
  });
}
