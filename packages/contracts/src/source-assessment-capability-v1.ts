export const SOURCE_ASSESSMENT_CAPABILITY_VERSION = "1.0" as const;
export const SOURCE_ASSESSMENT_CAPABILITY_ID = "source-assessment" as const;

export const SOURCE_ASSESSMENT_PRIORITIES = ["VERY_HIGH", "HIGH", "MEDIUM", "LOW"] as const;
export type SourceAssessmentPriority = (typeof SOURCE_ASSESSMENT_PRIORITIES)[number];

export const SOURCE_ASSESSMENT_CONFIDENCE = ["HIGH", "MEDIUM", "LOW"] as const;
export type SourceAssessmentConfidence = (typeof SOURCE_ASSESSMENT_CONFIDENCE)[number];

export type SourceAssessmentFactsV1 = {
  sourceId: string;
  name: string;
  sourceType: string;
  category: string;
  authorityLevel: string;
  status: string;
  canonicalUrl?: string;
  entrypoints: string[];
  jurisdictions: string[];
  languages: string[];
  tags: string[];
  acquisition: {
    graphNodeCount: number;
    contentNodeCount: number;
    provenanceNodeCount: number;
    rawArtifactCount: number;
    distinctArtifactHashCount: number;
    latestCapturedAt?: string;
  };
};

export type SourceAssessmentRequestV1 = {
  version: typeof SOURCE_ASSESSMENT_CAPABILITY_VERSION;
  capability: typeof SOURCE_ASSESSMENT_CAPABILITY_ID;
  locale: string;
  objective: string;
  source: SourceAssessmentFactsV1;
};

export type SourceAssessmentResponseV1 = {
  version: typeof SOURCE_ASSESSMENT_CAPABILITY_VERSION;
  capability: typeof SOURCE_ASSESSMENT_CAPABILITY_ID;
  provider: {
    providerId: string;
    model?: string;
    executionId?: string;
  };
  generatedAt: string;
  sourceValue: {
    score: number;
    priority: SourceAssessmentPriority;
    confidence: SourceAssessmentConfidence;
    summary: string;
    reason: string;
    valuePoints: string[];
    cautionPoints?: string[];
  };
  boundaries: {
    legalTruthVerified: false;
    professionalQualityVerified: false;
    grantsCollectionAuthority: false;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isSourceAssessmentResponseV1(value: unknown): value is SourceAssessmentResponseV1 {
  if (!isRecord(value) || !isRecord(value.provider) || !isRecord(value.sourceValue)) return false;
  if (!isRecord(value.boundaries)) return false;
  if (
    value.version !== SOURCE_ASSESSMENT_CAPABILITY_VERSION ||
    value.capability !== SOURCE_ASSESSMENT_CAPABILITY_ID ||
    typeof value.provider.providerId !== "string" ||
    typeof value.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.generatedAt))
  ) {
    return false;
  }

  const sourceValue = value.sourceValue;
  if (
    typeof sourceValue.score !== "number" ||
    !Number.isFinite(sourceValue.score) ||
    sourceValue.score < 0 ||
    sourceValue.score > 100 ||
    typeof sourceValue.priority !== "string" ||
    !SOURCE_ASSESSMENT_PRIORITIES.includes(sourceValue.priority as SourceAssessmentPriority) ||
    typeof sourceValue.confidence !== "string" ||
    !SOURCE_ASSESSMENT_CONFIDENCE.includes(sourceValue.confidence as SourceAssessmentConfidence) ||
    typeof sourceValue.summary !== "string" ||
    sourceValue.summary.trim().length === 0 ||
    typeof sourceValue.reason !== "string" ||
    !isStringArray(sourceValue.valuePoints) ||
    (sourceValue.cautionPoints !== undefined && !isStringArray(sourceValue.cautionPoints))
  ) {
    return false;
  }

  return (
    value.boundaries.legalTruthVerified === false &&
    value.boundaries.professionalQualityVerified === false &&
    value.boundaries.grantsCollectionAuthority === false
  );
}
