export type SourceGapType =
  | "HTTP_404"
  | "REDIRECT_LOOP"
  | "ACCESS_BLOCKED"
  | "CONTENT_REMOVED"
  | "UNKNOWN";

export type AcquisitionResolution =
  | "COMPLETE"
  | "DEGRADED_WITH_SOURCE_GAPS"
  | "FAILED";

export interface SourceGapObservation {
  url: string;
  gapType: SourceGapType;
  statusCode?: number;
  observedAt: string;
  evidenceRef?: string;
}

export interface AcquisitionResolutionInput {
  discovered: number;
  accepted: number;
  gaps: SourceGapObservation[];
}

export interface AcquisitionResolutionResult {
  resolution: AcquisitionResolution;
  explainableGapCount: number;
  artifactCoverage: number;
}

export function resolveAcquisitionOutcome(
  input: AcquisitionResolutionInput,
): AcquisitionResolutionResult {
  const artifactCoverage =
    input.discovered === 0 ? 0 : input.accepted / input.discovered;

  if (input.accepted === input.discovered) {
    return {
      resolution: "COMPLETE",
      explainableGapCount: 0,
      artifactCoverage,
    };
  }

  const explainableGapCount = input.gaps.filter(
    (gap) => gap.url.length > 0 && gap.gapType !== "UNKNOWN",
  ).length;

  if (
    input.accepted <= input.discovered &&
    explainableGapCount === input.discovered - input.accepted
  ) {
    return {
      resolution: "DEGRADED_WITH_SOURCE_GAPS",
      explainableGapCount,
      artifactCoverage,
    };
  }

  return {
    resolution: "FAILED",
    explainableGapCount,
    artifactCoverage,
  };
}
