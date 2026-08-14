export const COVERAGE_ANALYSIS_CAPABILITY_VERSION = "1.0" as const;
export const COVERAGE_ANALYSIS_CAPABILITY_ID = "coverage-analysis" as const;

export const COVERAGE_ANALYSIS_STATUSES = ["HEALTHY", "ATTENTION", "BUILDING", "UNKNOWN"] as const;
export type CoverageAnalysisStatus = (typeof COVERAGE_ANALYSIS_STATUSES)[number];

export const COVERAGE_ANALYSIS_PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export type CoverageAnalysisPriority = (typeof COVERAGE_ANALYSIS_PRIORITIES)[number];

export type CoverageAnalysisCategoryV1 = {
  category: string;
  targetCount: number;
  coveredCount: number;
  missingLabels: string[];
};

export type CoverageAnalysisRequestV1 = {
  version: typeof COVERAGE_ANALYSIS_CAPABILITY_VERSION;
  capability: typeof COVERAGE_ANALYSIS_CAPABILITY_ID;
  locale: string;
  objective: string;
  scope: {
    scopeId: string;
    label: string;
    kind: "JURISDICTION" | "REGION" | "DOMAIN" | "COLLECTION";
  };
  facts: {
    sourceCount: number;
    activeSourceCount: number;
    targetCount: number;
    coveredTargetCount: number;
    foundationalTargetCount: number;
    coveredFoundationalTargetCount: number;
    completenessPercent: number | null;
    categories: CoverageAnalysisCategoryV1[];
  };
};

export type CoverageAnalysisActionV1 = {
  title: string;
  reason: string;
  priority: CoverageAnalysisPriority;
  category?: string;
};

export type CoverageAnalysisResponseV1 = {
  version: typeof COVERAGE_ANALYSIS_CAPABILITY_VERSION;
  capability: typeof COVERAGE_ANALYSIS_CAPABILITY_ID;
  provider: {
    providerId: string;
    model?: string;
    executionId?: string;
  };
  generatedAt: string;
  status: CoverageAnalysisStatus;
  summary: string;
  strengths: string[];
  gaps: string[];
  recommendedNextSteps: CoverageAnalysisActionV1[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isCoverageAnalysisResponseV1(value: unknown): value is CoverageAnalysisResponseV1 {
  if (!isRecord(value) || !isRecord(value.provider)) return false;
  if (
    value.version !== COVERAGE_ANALYSIS_CAPABILITY_VERSION ||
    value.capability !== COVERAGE_ANALYSIS_CAPABILITY_ID ||
    typeof value.provider.providerId !== "string" ||
    !value.provider.providerId.trim() ||
    typeof value.generatedAt !== "string" ||
    typeof value.status !== "string" ||
    !COVERAGE_ANALYSIS_STATUSES.includes(value.status as CoverageAnalysisStatus) ||
    typeof value.summary !== "string" ||
    !Array.isArray(value.strengths) ||
    !value.strengths.every((item) => typeof item === "string") ||
    !Array.isArray(value.gaps) ||
    !value.gaps.every((item) => typeof item === "string") ||
    !Array.isArray(value.recommendedNextSteps)
  ) {
    return false;
  }
  return value.recommendedNextSteps.every((item) => {
    if (!isRecord(item)) return false;
    return (
      typeof item.title === "string" &&
      typeof item.reason === "string" &&
      typeof item.priority === "string" &&
      COVERAGE_ANALYSIS_PRIORITIES.includes(item.priority as CoverageAnalysisPriority) &&
      (item.category === undefined || typeof item.category === "string")
    );
  });
}
