import { describe, expect, it } from "vitest";
import {
  isAiGroundedProviderExecutionAuthorizationV1,
  type AiGroundedProviderExecutionAuthorizationV1,
} from "./ai-grounded-provider-authorization-v1";

const EXECUTION_SHA = "a".repeat(64);
const PROMPT_SHA = "b".repeat(64);
const COMMIT_SHA = "c".repeat(40);

function pending(): AiGroundedProviderExecutionAuthorizationV1 {
  return {
    protocolVersion: "1.0",
    objectType: "AI_GROUNDED_PROVIDER_EXECUTION_AUTHORIZATION",
    authorizationId: "gpa_us_section_8_openai",
    revision: 1,
    status: "PENDING",
    executionInputSha256: EXECUTION_SHA,
    queueJobId: "akj_0123456789abcdef0123456789abcdef",
    assignmentId: "kas_us_trademark_section_8",
    bindingId: "asb_us_trademark_section_8_official",
    sourcePackId: "asp_us_trademark_section_8_official",
    sourcePackRevision: 1,
    renderedPromptSha256: PROMPT_SHA,
    provider: "OPENAI",
    model: "gpt-5.6-luna",
    repositoryCommitSha: COMMIT_SHA,
    approvalRef: "github:yoomarks/markorbit-knowledge#405",
    gateEvidence: {
      adk06AcceptanceRef: "github:yoomarks/markorbit-knowledge#405",
      adk06AcceptanceSatisfied: false,
      repositoryGovernanceRef: "github:yoomarks/markorbit-knowledge#429",
      repositoryGovernanceSatisfied: false,
    },
    requestedAt: "2026-08-24T12:00:00.000Z",
    decisionAt: null,
    expiresAt: "2026-08-25T12:00:00.000Z",
    maxProviderCalls: 1,
    providerCallAuthorized: false,
    executionAuthorityGranted: false,
    externalBrowsingAllowed: false,
    legalTruthVerified: false,
    semanticClaimCoverageVerified: false,
    candidateAutoActivationAuthorized: false,
    protectedActionsAuthorized: false,
  };
}

describe("AiGroundedProviderExecutionAuthorizationV1", () => {
  it("accepts a pending authorization without granting provider execution", () => {
    expect(isAiGroundedProviderExecutionAuthorizationV1(pending())).toBe(true);
  });

  it("requires both external gates before GRANTED can be represented", () => {
    const invalid = {
      ...pending(),
      revision: 2,
      status: "GRANTED",
      decisionAt: "2026-08-24T12:10:00.000Z",
      providerCallAuthorized: true,
      executionAuthorityGranted: true,
    };
    expect(isAiGroundedProviderExecutionAuthorizationV1(invalid)).toBe(false);

    const granted: AiGroundedProviderExecutionAuthorizationV1 = {
      ...invalid,
      status: "GRANTED",
      gateEvidence: {
        ...invalid.gateEvidence,
        adk06AcceptanceSatisfied: true,
        repositoryGovernanceSatisfied: true,
      },
    };
    expect(isAiGroundedProviderExecutionAuthorizationV1(granted)).toBe(true);
  });

  it("pins the external gate references to the repository acceptance issues", () => {
    expect(
      isAiGroundedProviderExecutionAuthorizationV1({
        ...pending(),
        gateEvidence: {
          ...pending().gateEvidence,
          adk06AcceptanceRef: "github:yoomarks/markorbit-knowledge#999",
        },
      }),
    ).toBe(false);
    expect(
      isAiGroundedProviderExecutionAuthorizationV1({
        ...pending(),
        gateEvidence: {
          ...pending().gateEvidence,
          repositoryGovernanceRef: "github:yoomarks/markorbit-knowledge#999",
        },
      }),
    ).toBe(false);
  });

  it("keeps revoked authority disabled even when historical gates remain satisfied", () => {
    const request = pending();
    const revoked: AiGroundedProviderExecutionAuthorizationV1 = {
      ...request,
      revision: 3,
      status: "REVOKED",
      gateEvidence: {
        ...request.gateEvidence,
        adk06AcceptanceSatisfied: true,
        repositoryGovernanceSatisfied: true,
      },
      decisionAt: "2026-08-24T12:20:00.000Z",
      providerCallAuthorized: false,
      executionAuthorityGranted: false,
    };
    expect(isAiGroundedProviderExecutionAuthorizationV1(revoked)).toBe(true);
  });

  it("rejects authority escalation through unrelated capability flags", () => {
    expect(
      isAiGroundedProviderExecutionAuthorizationV1({
        ...pending(),
        protectedActionsAuthorized: true,
      }),
    ).toBe(false);
    expect(
      isAiGroundedProviderExecutionAuthorizationV1({
        ...pending(),
        externalBrowsingAllowed: true,
      }),
    ).toBe(false);
  });

  it("rejects invalid or overlong time windows and provider-call budgets", () => {
    expect(
      isAiGroundedProviderExecutionAuthorizationV1({
        ...pending(),
        expiresAt: "2026-08-24T11:59:59.000Z",
      }),
    ).toBe(false);
    expect(
      isAiGroundedProviderExecutionAuthorizationV1({
        ...pending(),
        expiresAt: "2026-08-25T12:00:00.001Z",
      }),
    ).toBe(false);
    expect(
      isAiGroundedProviderExecutionAuthorizationV1({
        ...pending(),
        maxProviderCalls: 2,
      }),
    ).toBe(false);
  });

  it("fails closed instead of throwing on malformed timestamp types", () => {
    const malformed = {
      ...pending(),
      requestedAt: Symbol("not-a-timestamp"),
    };
    expect(() => isAiGroundedProviderExecutionAuthorizationV1(malformed)).not.toThrow();
    expect(isAiGroundedProviderExecutionAuthorizationV1(malformed)).toBe(false);
  });
});
