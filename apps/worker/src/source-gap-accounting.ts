npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.
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

function sourceGapType(
  reason: string,
  statusCode: number | undefined,
): SourceGapType {
  if (statusCode === 404 && reason === "SOURCE_UNAVAILABLE") return "HTTP_404";
  if ((statusCode === 401 || statusCode === 403) && reason === "FETCH_FAILED") {
    return "ACCESS_BLOCKED";
  }
  return "UNKNOWN";
}

export function sourceGapObservationsFromEvidenceRefs(
  evidenceRefs: readonly string[],
  observedAt: string,
): SourceGapObservation[] {
  return evidenceRefs
    .filter((reference) => reference.startsWith("source-gap:"))
    .map((reference) => {
      const parts = reference.split(":");
      const reason = parts[1] ?? "UNKNOWN";
      const rawStatus = parts[2] ?? "NO_STATUS";
      const encodedUrl = parts.slice(3).join(":");
      const parsedStatus = Number(rawStatus);
      const statusCode = Number.isSafeInteger(parsedStatus)
        ? parsedStatus
        : undefined;
      let url = "";
      try {
        url = decodeURIComponent(encodedUrl);
      } catch {
        url = "";
      }
      return {
        url,
        gapType: sourceGapType(reason, statusCode),
        ...(statusCode === undefined ? {} : { statusCode }),
        observedAt,
        evidenceRef: reference,
      } satisfies SourceGapObservation;
    });
}

export function resolveAcquisitionOutcome(
  input: AcquisitionResolutionInput,
): AcquisitionResolutionResult {
  const artifactCoverage =
    input.discovered === 0 ? 0 : input.accepted / input.discovered;

  if (
    input.discovered >= 0 &&
    input.accepted === input.discovered &&
    input.gaps.length === 0
  ) {
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
    input.discovered > 0 &&
    input.accepted > 0 &&
    input.accepted < input.discovered &&
    explainableGapCount === input.discovered - input.accepted &&
    input.gaps.length === explainableGapCount
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
