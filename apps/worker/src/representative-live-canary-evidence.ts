export const REPRESENTATIVE_CANARY_PAGE_EVIDENCE_KINDS = ["HTML", "MARKDOWN"] as const;

export type RepresentativeCanaryArtifactAssessment = {
  pageEvidenceComplete: boolean;
  targetArtifactContractComplete: boolean;
  missingPageEvidenceKinds: string[];
  missingExpectedArtifactKinds: string[];
};

function normalizedKinds(kinds: readonly string[]): string[] {
  return [...new Set(kinds)].sort();
}

export function assessRepresentativeCanaryArtifacts(input: {
  observedArtifactKinds: readonly string[];
  expectedArtifactKinds: readonly string[];
}): RepresentativeCanaryArtifactAssessment {
  const observed = new Set(normalizedKinds(input.observedArtifactKinds));
  const missingPageEvidenceKinds = REPRESENTATIVE_CANARY_PAGE_EVIDENCE_KINDS.filter(
    (kind) => !observed.has(kind),
  );
  const missingExpectedArtifactKinds = normalizedKinds(input.expectedArtifactKinds).filter(
    (kind) => !observed.has(kind),
  );
  return {
    pageEvidenceComplete: missingPageEvidenceKinds.length === 0,
    targetArtifactContractComplete: missingExpectedArtifactKinds.length === 0,
    missingPageEvidenceKinds,
    missingExpectedArtifactKinds,
  };
}
