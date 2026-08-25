export const CASE_LIVE_ACCEPTANCE_PROTOCOL_VERSION = "1.0" as const;
export const CASE_LIVE_ACCEPTANCE_OBJECT_TYPE = "CASE_LIVE_ACCEPTANCE_RECEIPT" as const;

export const CASE_LIVE_ACCEPTANCE_RUN_MODES = ["TEST", "LIVE"] as const;
export type CaseLiveAcceptanceRunMode = (typeof CASE_LIVE_ACCEPTANCE_RUN_MODES)[number];

export const CASE_LIVE_ACCEPTANCE_TRANSPORT_MODES = ["DEFAULT_HTTP", "INJECTED_TEST"] as const;
export type CaseLiveAcceptanceTransportMode =
  (typeof CASE_LIVE_ACCEPTANCE_TRANSPORT_MODES)[number];

export const CASE_LIVE_ACCEPTANCE_STATES = [
  "STARTED",
  "WAITING_SOURCE",
  "PRIVACY_REVIEW_REQUIRED",
  "FINALIZED",
  "FAILED",
] as const;
export type CaseLiveAcceptanceState = (typeof CASE_LIVE_ACCEPTANCE_STATES)[number];

export const CASE_LIVE_ACCEPTANCE_FAILURE_STAGES = [
  "INTAKE",
  "COLLECTION",
  "ASSEMBLY",
  "PRIVACY",
] as const;
export type CaseLiveAcceptanceFailureStage =
  (typeof CASE_LIVE_ACCEPTANCE_FAILURE_STAGES)[number];

export type CaseLiveAcceptanceCandidateIdentityV1 = {
  candidateId: string;
  sourceSystem: "MARKREG";
  sourceMatterId: string;
  sourceMatterVersion: number;
  sourceSnapshotSha256: string;
  sourceWorkspaceId: string;
  sourceAccessClassification: "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
};

export type CaseLiveAcceptancePrivacyPlanV1 = {
  reviewId: string;
  reviewerRef: string;
};

export type CaseLiveAcceptanceEvidenceReceiptV1 = {
  collectionId: string;
  documentSha256: string;
};

export type CaseLiveAcceptanceDossierReceiptV1 = {
  dossierId: string;
  version: number;
  documentSha256: string;
};

export type CaseLiveAcceptancePrivacyReceiptV1 = {
  reviewId: string;
  state: "REVIEW_REQUIRED" | "NEEDS_REDACTION" | "FINALIZED" | "REJECTED";
};

export type CaseLiveAcceptanceFinalizedReceiptV1 = {
  derivativeId: string;
  derivativeSha256: string;
  dossierId: string;
  dossierVersion: number;
  dossierSha256: string;
};

export type CaseLiveAcceptanceFailureV1 = {
  stage: CaseLiveAcceptanceFailureStage;
  code: string;
  retryable: boolean;
};

/**
 * Durable, auditable receipt for the K-CASE-008 execution path.
 *
 * This receipt deliberately distinguishes TEST from LIVE execution. A TEST run
 * can exercise the full code path but can never become eligible for K-CASE-008
 * review. LIVE eligibility also requires an opaque producerPromotionRef from
 * the future K-CASE-002 MarkReg one-click handoff; Knowledge does not invent or
 * interpret that producer reference.
 *
 * The privacy review identity is frozen from STARTED so WAITING_SOURCE retries
 * cannot silently change reviewer identity. The acceptance harness deliberately
 * opens privacy review at the Candidate source access classification; audience
 * broadening, when needed, remains an explicit K-CASE-007 operation.
 *
 * `eligibleForKCase008Review` is not an acceptance decision. It only means the
 * technical prerequisites recorded here are complete enough for an operator to
 * review the run as K-CASE-008 evidence.
 */
export type CaseLiveAcceptanceReceiptV1 = {
  protocolVersion: typeof CASE_LIVE_ACCEPTANCE_PROTOCOL_VERSION;
  objectType: typeof CASE_LIVE_ACCEPTANCE_OBJECT_TYPE;
  runId: string;
  runMode: CaseLiveAcceptanceRunMode;
  transportMode: CaseLiveAcceptanceTransportMode;
  state: CaseLiveAcceptanceState;
  candidate: CaseLiveAcceptanceCandidateIdentityV1;
  privacyPlan: CaseLiveAcceptancePrivacyPlanV1;
  producerPromotionRef?: string;
  evidence?: CaseLiveAcceptanceEvidenceReceiptV1;
  assembledDossier?: CaseLiveAcceptanceDossierReceiptV1;
  privacyReview?: CaseLiveAcceptancePrivacyReceiptV1;
  finalized?: CaseLiveAcceptanceFinalizedReceiptV1;
  failure?: CaseLiveAcceptanceFailureV1;
  eligibleForKCase008Review: boolean;
  publicationAuthorized: false;
  startedAt: string;
  updatedAt: string;
};

const SHA256 = /^[a-f0-9]{64}$/u;
const FORBIDDEN_SEMANTIC_KEYS = new Set([
  "lesson",
  "lessons",
  "recommendation",
  "recommendations",
  "bestPractice",
  "successProbability",
  "legalTruthVerified",
  "truthScore",
  "prediction",
  "predictions",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function timestamp(value: unknown): value is string {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

function positiveVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 1;
}

function onlyAllowedKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function hasForbiddenSemanticKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenSemanticKey);
  const item = record(value);
  if (!item) return false;
  return Object.entries(item).some(
    ([key, child]) => FORBIDDEN_SEMANTIC_KEYS.has(key) || hasForbiddenSemanticKey(child),
  );
}

function isCandidate(value: unknown): value is CaseLiveAcceptanceCandidateIdentityV1 {
  const item = record(value);
  return Boolean(
    item &&
      onlyAllowedKeys(item, [
        "candidateId",
        "sourceSystem",
        "sourceMatterId",
        "sourceMatterVersion",
        "sourceSnapshotSha256",
        "sourceWorkspaceId",
        "sourceAccessClassification",
      ]) &&
      nonEmpty(item.candidateId) &&
      item.sourceSystem === "MARKREG" &&
      nonEmpty(item.sourceMatterId) &&
      positiveVersion(item.sourceMatterVersion) &&
      typeof item.sourceSnapshotSha256 === "string" &&
      SHA256.test(item.sourceSnapshotSha256) &&
      nonEmpty(item.sourceWorkspaceId) &&
      (item.sourceAccessClassification === "INTERNAL" ||
        item.sourceAccessClassification === "CONFIDENTIAL" ||
        item.sourceAccessClassification === "RESTRICTED"),
  );
}

function isPrivacyPlan(value: unknown): value is CaseLiveAcceptancePrivacyPlanV1 {
  const item = record(value);
  return Boolean(
    item &&
      onlyAllowedKeys(item, ["reviewId", "reviewerRef"]) &&
      nonEmpty(item.reviewId) &&
      nonEmpty(item.reviewerRef),
  );
}

function isEvidence(value: unknown): value is CaseLiveAcceptanceEvidenceReceiptV1 {
  const item = record(value);
  return Boolean(
    item &&
      onlyAllowedKeys(item, ["collectionId", "documentSha256"]) &&
      nonEmpty(item.collectionId) &&
      typeof item.documentSha256 === "string" &&
      SHA256.test(item.documentSha256),
  );
}

function isDossier(value: unknown): value is CaseLiveAcceptanceDossierReceiptV1 {
  const item = record(value);
  return Boolean(
    item &&
      onlyAllowedKeys(item, ["dossierId", "version", "documentSha256"]) &&
      nonEmpty(item.dossierId) &&
      positiveVersion(item.version) &&
      typeof item.documentSha256 === "string" &&
      SHA256.test(item.documentSha256),
  );
}

function isPrivacy(value: unknown): value is CaseLiveAcceptancePrivacyReceiptV1 {
  const item = record(value);
  return Boolean(
    item &&
      onlyAllowedKeys(item, ["reviewId", "state"]) &&
      nonEmpty(item.reviewId) &&
      (item.state === "REVIEW_REQUIRED" ||
        item.state === "NEEDS_REDACTION" ||
        item.state === "FINALIZED" ||
        item.state === "REJECTED"),
  );
}

function isFinalized(value: unknown): value is CaseLiveAcceptanceFinalizedReceiptV1 {
  const item = record(value);
  return Boolean(
    item &&
      onlyAllowedKeys(item, [
        "derivativeId",
        "derivativeSha256",
        "dossierId",
        "dossierVersion",
        "dossierSha256",
      ]) &&
      nonEmpty(item.derivativeId) &&
      typeof item.derivativeSha256 === "string" &&
      SHA256.test(item.derivativeSha256) &&
      nonEmpty(item.dossierId) &&
      positiveVersion(item.dossierVersion) &&
      typeof item.dossierSha256 === "string" &&
      SHA256.test(item.dossierSha256),
  );
}

function isFailure(value: unknown): value is CaseLiveAcceptanceFailureV1 {
  const item = record(value);
  return Boolean(
    item &&
      onlyAllowedKeys(item, ["stage", "code", "retryable"]) &&
      CASE_LIVE_ACCEPTANCE_FAILURE_STAGES.includes(
        item.stage as CaseLiveAcceptanceFailureStage,
      ) &&
      nonEmpty(item.code) &&
      typeof item.retryable === "boolean",
  );
}

function conditionalStateIsValid(item: Record<string, unknown>): boolean {
  const state = item.state as CaseLiveAcceptanceState;
  const hasEvidence = item.evidence !== undefined;
  const hasDossier = item.assembledDossier !== undefined;
  const hasPrivacy = item.privacyReview !== undefined;
  const hasFinalized = item.finalized !== undefined;
  const hasFailure = item.failure !== undefined;

  if (state === "STARTED") {
    return !hasEvidence && !hasDossier && !hasPrivacy && !hasFinalized && !hasFailure;
  }
  if (state === "WAITING_SOURCE") {
    return !hasEvidence && !hasDossier && !hasPrivacy && !hasFinalized && hasFailure;
  }
  if (state === "PRIVACY_REVIEW_REQUIRED") {
    return hasEvidence && hasDossier && hasPrivacy && !hasFinalized && !hasFailure;
  }
  if (state === "FINALIZED") {
    return hasEvidence && hasDossier && hasPrivacy && hasFinalized && !hasFailure;
  }
  if (state === "FAILED") {
    return !hasFinalized && hasFailure;
  }
  return false;
}

export function isCaseLiveAcceptanceReceiptV1(
  value: unknown,
): value is CaseLiveAcceptanceReceiptV1 {
  const item = record(value);
  if (
    !item ||
    !onlyAllowedKeys(item, [
      "protocolVersion",
      "objectType",
      "runId",
      "runMode",
      "transportMode",
      "state",
      "candidate",
      "privacyPlan",
      "producerPromotionRef",
      "evidence",
      "assembledDossier",
      "privacyReview",
      "finalized",
      "failure",
      "eligibleForKCase008Review",
      "publicationAuthorized",
      "startedAt",
      "updatedAt",
    ]) ||
    hasForbiddenSemanticKey(item) ||
    item.protocolVersion !== CASE_LIVE_ACCEPTANCE_PROTOCOL_VERSION ||
    item.objectType !== CASE_LIVE_ACCEPTANCE_OBJECT_TYPE ||
    !nonEmpty(item.runId) ||
    !CASE_LIVE_ACCEPTANCE_RUN_MODES.includes(item.runMode as CaseLiveAcceptanceRunMode) ||
    !CASE_LIVE_ACCEPTANCE_TRANSPORT_MODES.includes(
      item.transportMode as CaseLiveAcceptanceTransportMode,
    ) ||
    !CASE_LIVE_ACCEPTANCE_STATES.includes(item.state as CaseLiveAcceptanceState) ||
    !isCandidate(item.candidate) ||
    !isPrivacyPlan(item.privacyPlan) ||
    (item.producerPromotionRef !== undefined && !nonEmpty(item.producerPromotionRef)) ||
    (item.evidence !== undefined && !isEvidence(item.evidence)) ||
    (item.assembledDossier !== undefined && !isDossier(item.assembledDossier)) ||
    (item.privacyReview !== undefined && !isPrivacy(item.privacyReview)) ||
    (item.finalized !== undefined && !isFinalized(item.finalized)) ||
    (item.failure !== undefined && !isFailure(item.failure)) ||
    typeof item.eligibleForKCase008Review !== "boolean" ||
    item.publicationAuthorized !== false ||
    !timestamp(item.startedAt) ||
    !timestamp(item.updatedAt) ||
    Date.parse(item.updatedAt) < Date.parse(item.startedAt) ||
    !conditionalStateIsValid(item)
  ) {
    return false;
  }

  if (item.runMode === "LIVE" && item.transportMode !== "DEFAULT_HTTP") return false;
  if (item.transportMode === "INJECTED_TEST" && item.runMode !== "TEST") return false;

  if (item.state === "WAITING_SOURCE") {
    const failure = item.failure as CaseLiveAcceptanceFailureV1;
    if (!failure.retryable || failure.stage !== "COLLECTION") return false;
  }

  if (item.privacyReview) {
    const privacy = item.privacyReview as CaseLiveAcceptancePrivacyReceiptV1;
    const plan = item.privacyPlan as CaseLiveAcceptancePrivacyPlanV1;
    if (privacy.reviewId !== plan.reviewId) return false;
    if (privacy.state === "REJECTED" && item.state !== "FAILED") return false;
  }

  if (item.state === "FINALIZED") {
    const privacy = item.privacyReview as CaseLiveAcceptancePrivacyReceiptV1;
    if (privacy.state !== "FINALIZED") return false;
  }

  const expectedEligibility =
    item.runMode === "LIVE" &&
    item.transportMode === "DEFAULT_HTTP" &&
    item.state === "FINALIZED" &&
    nonEmpty(item.producerPromotionRef);
  return item.eligibleForKCase008Review === expectedEligibility;
}
