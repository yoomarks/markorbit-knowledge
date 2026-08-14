export const CANDIDATE_OBSERVATION_VERSION = "1.0" as const;

export const CANDIDATE_OBSERVATION_EVIDENCE_KINDS = [
  "CONTENT_SHA256",
  "HTTP_METADATA",
  "STRUCTURAL",
] as const;
export type CandidateObservationEvidenceKind =
  (typeof CANDIDATE_OBSERVATION_EVIDENCE_KINDS)[number];

export const CANDIDATE_OBSERVATION_DELTAS = [
  "NEW",
  "KNOWN",
  "CHANGED",
  "REJECTED_CHANGED",
] as const;
export type CandidateObservationDelta = (typeof CANDIDATE_OBSERVATION_DELTAS)[number];

/**
 * Mechanically observed discovery state. This is an acquisition/provenance
 * record only; `CHANGED` means the objective fingerprint changed and does not
 * claim that the change is important, legally relevant, or worth re-review.
 */
export type CandidateChangeObservationV1 = {
  version: typeof CANDIDATE_OBSERVATION_VERSION;
  observationId: string;
  candidateId: string;
  locator: string;
  batchId: string;
  observedAt: string;
  evidenceKind: CandidateObservationEvidenceKind;
  fingerprint: string;
  delta: CandidateObservationDelta;
  previousObservationId?: string;
  candidateStatusAtObservation: "DISCOVERED" | "REVIEWED" | "ACCEPTED" | "REJECTED";
  facts: {
    title?: string;
    kind?: string;
    host?: string;
    robotsAllowed?: boolean;
    contentSha256?: string;
    httpEtag?: string;
    httpLastModified?: string;
    httpContentType?: string;
  };
};

export type CandidateObservationBatchSummaryV1 = {
  batchId: string;
  observedAt: string;
  total: number;
  newCount: number;
  knownCount: number;
  changedCount: number;
  rejectedChangedCount: number;
};
