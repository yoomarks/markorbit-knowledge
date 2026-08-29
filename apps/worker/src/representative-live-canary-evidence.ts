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

export function unsupportedRepresentativeCanaryArtifactKinds(
  expectedArtifactKinds: readonly string[],
): string[] {
  const supported = new Set<string>(REPRESENTATIVE_CANARY_PAGE_EVIDENCE_KINDS);
  return normalizedKinds(expectedArtifactKinds).filter((kind) => !supported.has(kind));
}

export function assertRepresentativeCanaryArtifactContractSupported(
  expectedArtifactKinds: readonly string[],
): void {
  const unsupported = unsupportedRepresentativeCanaryArtifactKinds(expectedArtifactKinds);
  if (unsupported.length > 0) {
    throw new Error(
      `Representative WEB canary cannot produce expected artifact kinds with its Crawl4AI page executor: ${unsupported.join(", ")}`,
    );
  }
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
