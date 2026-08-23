import { describe, expect, it } from "vitest";
import type {
  AiKnowledgeAssignmentV1,
  AiKnowledgeProvider,
  AiProductionPilotPlanV1,
} from "@markorbit/contracts";
import {
  AiKnowledgeAcquisitionError,
  type AiKnowledgeAcquisition,
  type AiKnowledgeProviderAdapter,
} from "./ai-distilled-knowledge-acquirer";
import { runAiProductionPilot } from "./ai-production-pilot";

function assignment(id: string, topic: string): AiKnowledgeAssignmentV1 {
  return {
    protocolVersion: "1.0",
    objectType: "AI_KNOWLEDGE_ASSIGNMENT",
    assignmentId: id,
    jurisdiction: "US",
    domain: "TRADEMARK",
    topic,
    title: topic,
    instructionSetId: "kis_trademark_procedure",
    instructionSetRevision: 1,
    language: "zh-CN",
    prompt: `Research ${topic}.`,
    createdAt: "2026-08-23T04:00:00.000Z",
  };
}

const assignments = [
  assignment("kas_us_tm_declaration_use", "DECLARATION_USE"),
  assignment("kas_us_tm_specimen", "SPECIMEN"),
  assignment("kas_us_tm_deadline", "DEADLINE"),
] as const;

const plan: AiProductionPilotPlanV1 = {
  protocolVersion: "1.0",
  objectType: "AI_PRODUCTION_PILOT_PLAN",
  pilotId: "app_us_tm_canary",
  assignmentIds: [
    assignments[0].assignmentId,
    assignments[1].assignmentId,
    assignments[2].assignmentId,
  ],
  providers: ["DEEPSEEK", "OPENAI"],
  approvalRef: "governance:adk-06-canary",
  liveProviderCallsAuthorized: true,
  boundaries: {
    compareProviderQuality: false,
    legalTruthVerified: false,
    candidateAutoActivation: false,
  },
  createdAt: "2026-08-23T04:10:00.000Z",
};

function fakeAcquisition(
  assignmentValue: AiKnowledgeAssignmentV1,
  provider: AiKnowledgeProvider,
): AiKnowledgeAcquisition {
  const seed = `${assignmentValue.assignmentId}_${provider.toLowerCase()}`;
  return {
    assignment: assignmentValue,
    submission: {
      protocolVersion: "1.0",
      objectType: "AI_RESEARCH_SUBMISSION",
      submissionId: `ars_${seed}`,
      assignmentId: assignmentValue.assignmentId,
      provider,
      model: `${provider.toLowerCase()}-test`,
      requestedAt: "2026-08-23T04:11:00.000Z",
      completedAt: "2026-08-23T04:11:01.000Z",
      promptSha256: "a".repeat(64),
      rawResponseSha256: "b".repeat(64),
      markdownSha256: "c".repeat(64),
      markdownSizeBytes: 20,
    },
    artifact: {
      protocolVersion: "1.0",
      objectType: "AI_DISTILLED_KNOWLEDGE_ARTIFACT",
      artifactId: `adk_${seed}`,
      assignmentId: assignmentValue.assignmentId,
      submissionId: `ars_${seed}`,
      provider,
      model: `${provider.toLowerCase()}-test`,
      instructionSetId: assignmentValue.instructionSetId,
      instructionSetRevision: assignmentValue.instructionSetRevision,
      provenance: {
        sourceKind: "SYNTHETIC_AI",
        legalTruthVerified: false,
        rawResponseSha256: "b".repeat(64),
        promptSha256: "a".repeat(64),
      },
      content: {
        mediaType: "text/markdown",
        encoding: "utf-8",
        sha256: "c".repeat(64),
        sizeBytes: 20,
        contentAddressedRef: `cas:sha256:${"c".repeat(64)}`,
        content: "# Test\n\nPilot answer",
      },
      createdAt: "2026-08-23T04:11:01.000Z",
    },
    rawResponse: new TextEncoder().encode("{}"),
  };
}

function adapter(
  provider: AiKnowledgeProvider,
  acquire: AiKnowledgeProviderAdapter["acquire"],
): AiKnowledgeProviderAdapter {
  return { provider, acquire };
}

describe("runAiProductionPilot", () => {
  it("runs the full 3-topic matrix without producing rankings or legal truth", async () => {
    const assignmentMap = new Map(assignments.map((item) => [item.assignmentId, item]));
    const adapters = new Map<AiKnowledgeProvider, AiKnowledgeProviderAdapter>([
      ["DEEPSEEK", adapter("DEEPSEEK", async ({ assignment: value }) => fakeAcquisition(value, "DEEPSEEK"))],
      ["OPENAI", adapter("OPENAI", async ({ assignment: value }) => fakeAcquisition(value, "OPENAI"))],
    ]);
    const moments = [new Date("2026-08-23T04:12:00.000Z"), new Date("2026-08-23T04:12:06.000Z")];

    const result = await runAiProductionPilot(
      { plan, assignments: assignmentMap, adapters },
      () => moments.shift()!,
    );

    expect(result.run.receipts).toHaveLength(6);
    expect(result.run.receipts.every((receipt) => receipt.status === "EXECUTED")).toBe(true);
    expect(result.acquisitions).toHaveLength(6);
    expect(result.run.boundaries.providerRankingProduced).toBe(false);
    expect(result.run.boundaries.legalTruthVerified).toBe(false);
    expect(result.run.boundaries.candidateAutoActivationApplied).toBe(false);
  });

  it("records missing adapters without pretending the provider executed", async () => {
    const assignmentMap = new Map(assignments.map((item) => [item.assignmentId, item]));
    const adapters = new Map<AiKnowledgeProvider, AiKnowledgeProviderAdapter>([
      ["DEEPSEEK", adapter("DEEPSEEK", async ({ assignment: value }) => fakeAcquisition(value, "DEEPSEEK"))],
    ]);

    const result = await runAiProductionPilot({ plan, assignments: assignmentMap, adapters });
    const openAi = result.run.receipts.filter((receipt) => receipt.provider === "OPENAI");
    expect(openAi).toHaveLength(3);
    expect(openAi.every((receipt) => receipt.status === "BLOCKED_ADAPTER")).toBe(true);
    expect(result.acquisitions).toHaveLength(3);
  });

  it("records missing runtime credentials as blocked rather than success", async () => {
    const assignmentMap = new Map(assignments.map((item) => [item.assignmentId, item]));
    const adapters = new Map<AiKnowledgeProvider, AiKnowledgeProviderAdapter>([
      [
        "DEEPSEEK",
        adapter("DEEPSEEK", async () => {
          throw new AiKnowledgeAcquisitionError(
            "AI_PROVIDER_CREDENTIAL_MISSING",
            "credential missing",
            false,
          );
        }),
      ],
      ["OPENAI", adapter("OPENAI", async ({ assignment: value }) => fakeAcquisition(value, "OPENAI"))],
    ]);

    const result = await runAiProductionPilot({ plan, assignments: assignmentMap, adapters });
    const deepSeek = result.run.receipts.filter((receipt) => receipt.provider === "DEEPSEEK");
    expect(deepSeek.every((receipt) => receipt.status === "BLOCKED_CREDENTIAL")).toBe(true);
    expect(result.acquisitions).toHaveLength(3);
  });
});
