export const AI_ACQUISITION_EVIDENCE_PROTOCOL_VERSION = "1.0" as const;
export const AI_ACQUISITION_EVIDENCE_OBJECT_TYPE = "AI_ACQUISITION_EVIDENCE" as const;

export const AI_EVIDENCE_PLANE_ACTIVE_PROVIDERS = ["DEEPSEEK", "OPENAI"] as const;
export type AiEvidencePlaneActiveProvider = (typeof AI_EVIDENCE_PLANE_ACTIVE_PROVIDERS)[number];

export type AiAcquisitionEvidenceProvenanceV1 = {
  sourceKind: "SYNTHETIC_AI";
  exactProviderResponsePreserved: true;
  legalTruthVerified: false;
  semanticMeaningAssigned: false;
  providerQualityRanked: false;
  candidateAutoActivationAuthorized: false;
  downstreamExecutionAuthorityGranted: false;
};

export type AiAcquisitionEvidenceV1 = {
  protocolVersion: typeof AI_ACQUISITION_EVIDENCE_PROTOCOL_VERSION;
  objectType: typeof AI_ACQUISITION_EVIDENCE_OBJECT_TYPE;
  evidenceId: string;
  workspaceId: string;
  requestId: string;
  authorizationRef: string;
  executionInputSha256: string;
  provider: AiEvidencePlaneActiveProvider;
  model: string;
  requestedAt: string;
  completedAt: string;
  rawResponseSha256: string;
  rawResponseSizeBytes: number;
  rawResponseMediaType: string;
  rawResponseContentAddressedRef: string;
  providerRequestId?: string;
  provenance: AiAcquisitionEvidenceProvenanceV1;
};

const SHA256 = /^[a-f0-9]{64}$/u;
const EVIDENCE_ID = /^aie_[a-f0-9]{32}$/u;
const WORKSPACE_ID = /^wsp_[0-9A-HJKMNP-TV-Z]{26}$/u;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function rfc3339(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isProvenance(value: unknown): value is AiAcquisitionEvidenceProvenanceV1 {
  const item = record(value);
  return Boolean(
    item &&
    exactKeys(item, [
      "sourceKind",
      "exactProviderResponsePreserved",
      "legalTruthVerified",
      "semanticMeaningAssigned",
      "providerQualityRanked",
      "candidateAutoActivationAuthorized",
      "downstreamExecutionAuthorityGranted",
    ]) &&
    item.sourceKind === "SYNTHETIC_AI" &&
    item.exactProviderResponsePreserved === true &&
    item.legalTruthVerified === false &&
    item.semanticMeaningAssigned === false &&
    item.providerQualityRanked === false &&
    item.candidateAutoActivationAuthorized === false &&
    item.downstreamExecutionAuthorityGranted === false,
  );
}

export function isAiAcquisitionEvidenceV1(value: unknown): value is AiAcquisitionEvidenceV1 {
  const item = record(value);
  if (!item) return false;
  const expected = [
    "protocolVersion",
    "objectType",
    "evidenceId",
    "workspaceId",
    "requestId",
    "authorizationRef",
    "executionInputSha256",
    "provider",
    "model",
    "requestedAt",
    "completedAt",
    "rawResponseSha256",
    "rawResponseSizeBytes",
    "rawResponseMediaType",
    "rawResponseContentAddressedRef",
    "provenance",
  ];
  if ("providerRequestId" in item) expected.push("providerRequestId");
  if (!exactKeys(item, expected) || !isProvenance(item.provenance)) return false;

  const requestedAt = typeof item.requestedAt === "string" ? Date.parse(item.requestedAt) : NaN;
  const completedAt = typeof item.completedAt === "string" ? Date.parse(item.completedAt) : NaN;
  return (
    item.protocolVersion === AI_ACQUISITION_EVIDENCE_PROTOCOL_VERSION &&
    item.objectType === AI_ACQUISITION_EVIDENCE_OBJECT_TYPE &&
    typeof item.evidenceId === "string" &&
    EVIDENCE_ID.test(item.evidenceId) &&
    typeof item.workspaceId === "string" &&
    WORKSPACE_ID.test(item.workspaceId) &&
    nonEmpty(item.requestId) &&
    nonEmpty(item.authorizationRef) &&
    typeof item.executionInputSha256 === "string" &&
    SHA256.test(item.executionInputSha256) &&
    typeof item.provider === "string" &&
    (AI_EVIDENCE_PLANE_ACTIVE_PROVIDERS as readonly string[]).includes(item.provider) &&
    nonEmpty(item.model) &&
    rfc3339(item.requestedAt) &&
    rfc3339(item.completedAt) &&
    completedAt >= requestedAt &&
    typeof item.rawResponseSha256 === "string" &&
    SHA256.test(item.rawResponseSha256) &&
    Number.isSafeInteger(item.rawResponseSizeBytes) &&
    (item.rawResponseSizeBytes as number) > 0 &&
    nonEmpty(item.rawResponseMediaType) &&
    item.rawResponseContentAddressedRef === `cas:sha256:${item.rawResponseSha256}` &&
    (item.providerRequestId === undefined || nonEmpty(item.providerRequestId))
  );
}

export function assertAiAcquisitionEvidenceV1(
  value: unknown,
): asserts value is AiAcquisitionEvidenceV1 {
  if (!isAiAcquisitionEvidenceV1(value)) {
    throw new TypeError("Invalid AiAcquisitionEvidenceV1");
  }
}
