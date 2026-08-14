import type { CandidateChangeObservationV1 } from "./candidate-change-observation-v1";

export const CHANGE_SIGNIFICANCE_CAPABILITY_VERSION = "1.0" as const;
export const CHANGE_SIGNIFICANCE_CAPABILITY_ID = "change-significance" as const;

export const CHANGE_SIGNIFICANCE_LEVELS = ["SIGNIFICANT", "MINOR", "UNKNOWN"] as const;
export type ChangeSignificanceLevel = (typeof CHANGE_SIGNIFICANCE_LEVELS)[number];

export type ChangeSignificanceRequestV1 = {
  version: typeof CHANGE_SIGNIFICANCE_CAPABILITY_VERSION;
  capability: typeof CHANGE_SIGNIFICANCE_CAPABILITY_ID;
  locale: string;
  objective: string;
  before: CandidateChangeObservationV1;
  after: CandidateChangeObservationV1;
};

export type ChangeSignificanceResponseV1 = {
  version: typeof CHANGE_SIGNIFICANCE_CAPABILITY_VERSION;
  capability: typeof CHANGE_SIGNIFICANCE_CAPABILITY_ID;
  provider: {
    providerId: string;
    model?: string;
    executionId?: string;
  };
  generatedAt: string;
  level: ChangeSignificanceLevel;
  summary: string;
  reason: string;
  signals?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isChangeSignificanceResponseV1(
  value: unknown,
): value is ChangeSignificanceResponseV1 {
  if (!isRecord(value) || !isRecord(value.provider)) return false;
  return (
    value.version === CHANGE_SIGNIFICANCE_CAPABILITY_VERSION &&
    value.capability === CHANGE_SIGNIFICANCE_CAPABILITY_ID &&
    typeof value.provider.providerId === "string" &&
    value.provider.providerId.trim().length > 0 &&
    typeof value.generatedAt === "string" &&
    typeof value.level === "string" &&
    CHANGE_SIGNIFICANCE_LEVELS.includes(value.level as ChangeSignificanceLevel) &&
    typeof value.summary === "string" &&
    typeof value.reason === "string" &&
    (value.signals === undefined ||
      (Array.isArray(value.signals) && value.signals.every((item) => typeof item === "string")))
  );
}
