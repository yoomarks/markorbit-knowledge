export const AI_GROUNDED_PROVIDER_AUTHORIZATION_PROTOCOL_VERSION = "1.0" as const;
export const AI_GROUNDED_PROVIDER_AUTHORIZATION_OBJECT_TYPE =
  "AI_GROUNDED_PROVIDER_EXECUTION_AUTHORIZATION" as const;
export const AI_GROUNDED_PROVIDER_ADK06_ACCEPTANCE_REF =
  "github:yoomarks/markorbit-knowledge#405" as const;
export const AI_GROUNDED_PROVIDER_REPOSITORY_GOVERNANCE_REF =
  "github:yoomarks/markorbit-knowledge#429" as const;
export const AI_GROUNDED_PROVIDER_AUTHORIZATION_MAX_WINDOW_MS = 24 * 60 * 60 * 1_000;

export type AiGroundedProviderAuthorizationStatusV1 = "PENDING" | "GRANTED" | "REVOKED";
export type AiGroundedProviderAuthorizationProviderV1 = "DEEPSEEK" | "OPENAI";

export type AiGroundedProviderAuthorizationGateEvidenceV1 = {
  adk06AcceptanceRef: typeof AI_GROUNDED_PROVIDER_ADK06_ACCEPTANCE_REF;
  adk06AcceptanceSatisfied: boolean;
  repositoryGovernanceRef: typeof AI_GROUNDED_PROVIDER_REPOSITORY_GOVERNANCE_REF;
  repositoryGovernanceSatisfied: boolean;
};

export type AiGroundedProviderExecutionAuthorizationV1 = {
  protocolVersion: typeof AI_GROUNDED_PROVIDER_AUTHORIZATION_PROTOCOL_VERSION;
  objectType: typeof AI_GROUNDED_PROVIDER_AUTHORIZATION_OBJECT_TYPE;
  authorizationId: string;
  revision: number;
  status: AiGroundedProviderAuthorizationStatusV1;
  executionInputSha256: string;
  queueJobId: string;
  assignmentId: string;
  bindingId: string;
  sourcePackId: string;
  sourcePackRevision: number;
  renderedPromptSha256: string;
  provider: AiGroundedProviderAuthorizationProviderV1;
  model: string;
  repositoryCommitSha: string;
  approvalRef: string;
  gateEvidence: AiGroundedProviderAuthorizationGateEvidenceV1;
  requestedAt: string;
  decisionAt: string | null;
  expiresAt: string;
  maxProviderCalls: 1;
  providerCallAuthorized: boolean;
  executionAuthorityGranted: boolean;
  externalBrowsingAllowed: false;
  legalTruthVerified: false;
  semanticClaimCoverageVerified: false;
  candidateAutoActivationAuthorized: false;
  protectedActionsAuthorized: false;
};

const SHA256 = /^[a-f0-9]{64}$/u;
const REPOSITORY_COMMIT_SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const QUEUE_JOB_ID = /^akj_[a-f0-9]{32}$/u;
const ADK_ID = /^[a-z][a-z0-9_]{2,127}$/u;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function rfc3339(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function timestamp(value: unknown): number {
  return typeof value === "string" ? Date.parse(value) : Number.NaN;
}

function boundedText(value: unknown, max: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value
  );
}

function gateEvidence(value: unknown): value is AiGroundedProviderAuthorizationGateEvidenceV1 {
  const item = record(value);
  return Boolean(
    item &&
    exactKeys(item, [
      "adk06AcceptanceRef",
      "adk06AcceptanceSatisfied",
      "repositoryGovernanceRef",
      "repositoryGovernanceSatisfied",
    ]) &&
    item.adk06AcceptanceRef === AI_GROUNDED_PROVIDER_ADK06_ACCEPTANCE_REF &&
    typeof item.adk06AcceptanceSatisfied === "boolean" &&
    item.repositoryGovernanceRef === AI_GROUNDED_PROVIDER_REPOSITORY_GOVERNANCE_REF &&
    typeof item.repositoryGovernanceSatisfied === "boolean",
  );
}

function statusSemantics(item: Record<string, unknown>): boolean {
  const status = item.status;
  const decisionAt = item.decisionAt;
  const providerCallAuthorized = item.providerCallAuthorized;
  const executionAuthorityGranted = item.executionAuthorityGranted;
  const gates = item.gateEvidence as AiGroundedProviderAuthorizationGateEvidenceV1;

  if (status === "PENDING") {
    return (
      decisionAt === null && providerCallAuthorized === false && executionAuthorityGranted === false
    );
  }
  if (status === "GRANTED") {
    return (
      rfc3339(decisionAt) &&
      gates.adk06AcceptanceSatisfied === true &&
      gates.repositoryGovernanceSatisfied === true &&
      providerCallAuthorized === true &&
      executionAuthorityGranted === true
    );
  }
  if (status === "REVOKED") {
    return (
      rfc3339(decisionAt) && providerCallAuthorized === false && executionAuthorityGranted === false
    );
  }
  return false;
}

export function isAiGroundedProviderExecutionAuthorizationV1(
  value: unknown,
): value is AiGroundedProviderExecutionAuthorizationV1 {
  const item = record(value);
  if (
    !item ||
    !exactKeys(item, [
      "protocolVersion",
      "objectType",
      "authorizationId",
      "revision",
      "status",
      "executionInputSha256",
      "queueJobId",
      "assignmentId",
      "bindingId",
      "sourcePackId",
      "sourcePackRevision",
      "renderedPromptSha256",
      "provider",
      "model",
      "repositoryCommitSha",
      "approvalRef",
      "gateEvidence",
      "requestedAt",
      "decisionAt",
      "expiresAt",
      "maxProviderCalls",
      "providerCallAuthorized",
      "executionAuthorityGranted",
      "externalBrowsingAllowed",
      "legalTruthVerified",
      "semanticClaimCoverageVerified",
      "candidateAutoActivationAuthorized",
      "protectedActionsAuthorized",
    ]) ||
    !gateEvidence(item.gateEvidence)
  ) {
    return false;
  }

  const requestedAt = timestamp(item.requestedAt);
  const expiresAt = timestamp(item.expiresAt);
  const decisionAt = item.decisionAt === null ? null : timestamp(item.decisionAt);

  return (
    item.protocolVersion === AI_GROUNDED_PROVIDER_AUTHORIZATION_PROTOCOL_VERSION &&
    item.objectType === AI_GROUNDED_PROVIDER_AUTHORIZATION_OBJECT_TYPE &&
    typeof item.authorizationId === "string" &&
    item.authorizationId.startsWith("gpa_") &&
    ADK_ID.test(item.authorizationId) &&
    Number.isSafeInteger(item.revision) &&
    (item.revision as number) > 0 &&
    typeof item.executionInputSha256 === "string" &&
    SHA256.test(item.executionInputSha256) &&
    typeof item.queueJobId === "string" &&
    QUEUE_JOB_ID.test(item.queueJobId) &&
    typeof item.assignmentId === "string" &&
    item.assignmentId.startsWith("kas_") &&
    ADK_ID.test(item.assignmentId) &&
    typeof item.bindingId === "string" &&
    item.bindingId.startsWith("asb_") &&
    ADK_ID.test(item.bindingId) &&
    typeof item.sourcePackId === "string" &&
    item.sourcePackId.startsWith("asp_") &&
    ADK_ID.test(item.sourcePackId) &&
    Number.isSafeInteger(item.sourcePackRevision) &&
    (item.sourcePackRevision as number) > 0 &&
    typeof item.renderedPromptSha256 === "string" &&
    SHA256.test(item.renderedPromptSha256) &&
    (item.provider === "DEEPSEEK" || item.provider === "OPENAI") &&
    boundedText(item.model, 128) &&
    typeof item.repositoryCommitSha === "string" &&
    REPOSITORY_COMMIT_SHA.test(item.repositoryCommitSha) &&
    boundedText(item.approvalRef, 512) &&
    rfc3339(item.requestedAt) &&
    (item.decisionAt === null || rfc3339(item.decisionAt)) &&
    rfc3339(item.expiresAt) &&
    requestedAt < expiresAt &&
    expiresAt - requestedAt <= AI_GROUNDED_PROVIDER_AUTHORIZATION_MAX_WINDOW_MS &&
    (decisionAt === null || (decisionAt >= requestedAt && decisionAt <= expiresAt)) &&
    item.maxProviderCalls === 1 &&
    typeof item.providerCallAuthorized === "boolean" &&
    typeof item.executionAuthorityGranted === "boolean" &&
    item.externalBrowsingAllowed === false &&
    item.legalTruthVerified === false &&
    item.semanticClaimCoverageVerified === false &&
    item.candidateAutoActivationAuthorized === false &&
    item.protectedActionsAuthorized === false &&
    statusSemantics(item)
  );
}

export function assertAiGroundedProviderExecutionAuthorizationV1(
  value: unknown,
): asserts value is AiGroundedProviderExecutionAuthorizationV1 {
  if (!isAiGroundedProviderExecutionAuthorizationV1(value)) {
    throw new TypeError("Invalid AiGroundedProviderExecutionAuthorizationV1");
  }
}
