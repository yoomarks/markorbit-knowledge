export type SourceCoverageBoundaryStatus = "COMPLETE" | "PARTIAL" | "UNKNOWN";

export type SourceCoverageBoundaryInput = {
  registrationState: "REGISTERED" | "UNREGISTERED";
  sourceStatuses: string[];
  supplyState: "READY" | "DEGRADED" | "BLOCKED";
  gaps: string[];
  acquisitionArtifactCount: number;
  observedArtifactKinds: string[];
  expectedArtifactKinds: string[];
  knownLimitation: boolean;
};

export type SourceCoverageBoundaryResult = {
  status: SourceCoverageBoundaryStatus;
  reasons: string[];
  missingExpectedArtifactKinds: string[];
};

/**
 * Derives only the evidence-supply boundary that durable runtime facts can prove.
 * COMPLETE does not mean legal, semantic, or jurisdictional completeness.
 */
export function deriveSourceCoverageBoundary(
  input: SourceCoverageBoundaryInput,
): SourceCoverageBoundaryResult {
  const missingExpectedArtifactKinds = input.expectedArtifactKinds.filter(
    (kind) => !input.observedArtifactKinds.includes(kind),
  );

  if (input.registrationState === "UNREGISTERED" || input.acquisitionArtifactCount === 0) {
    return {
      status: "UNKNOWN",
      reasons: [
        input.registrationState === "UNREGISTERED"
          ? "SOURCE_UNREGISTERED"
          : "NO_ACQUISITION_EVIDENCE",
      ],
      missingExpectedArtifactKinds,
    };
  }

  const reasons = new Set<string>();
  if (!input.sourceStatuses.includes("ACTIVE")) reasons.add("NO_ACTIVE_SOURCE");
  if (input.supplyState !== "READY") reasons.add(`SUPPLY_${input.supplyState}`);
  input.gaps.forEach((gap) => reasons.add(gap));
  missingExpectedArtifactKinds.forEach((kind) =>
    reasons.add(`EXPECTED_ARTIFACT_KIND_MISSING:${kind}`),
  );
  if (input.knownLimitation) reasons.add("KNOWN_LIMITATION");

  if (reasons.size > 0) {
    return {
      status: "PARTIAL",
      reasons: [...reasons],
      missingExpectedArtifactKinds,
    };
  }

  return { status: "COMPLETE", reasons: [], missingExpectedArtifactKinds: [] };
}

export function latestEvidenceTimestamp(
  ...values: Array<string | null | undefined>
): string | null {
  const available = values.filter((value): value is string => Boolean(value));
  return available.length === 0 ? null : available.sort().at(-1)!;
}
