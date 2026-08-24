import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AiKnowledgeAssignmentV1, AiProductionPilotPlanV1 } from "@markorbit/contracts";
import {
  AiKnowledgeAcquisitionError,
  type AiKnowledgeAcquisition,
  type AiKnowledgeProviderAdapter,
} from "@markorbit/worker-runtime/ai-distilled-knowledge-acquirer";
import type { AiKnowledgeProvider } from "@markorbit/worker-runtime/ai-production-pilot";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  executeResumableAdkLivePilot,
  parseAdkLivePilotCheckpoint,
  type AdkLivePilotCellPersistence,
  type AdkLivePilotDurableCellV1,
} from "./adk-live-pilot-resume";

const assignmentIds = [
  "kas_us_trademark_filing",
  "kas_us_trademark_section_8",
  "kas_us_trademark_ttab",
] as const;

const plan: AiProductionPilotPlanV1 = {
  protocolVersion: "1.0",
  objectType: "AI_PRODUCTION_PILOT_PLAN",
  pilotId: "app_us_trademark_live_acceptance",
  assignmentIds: [...assignmentIds],
  providers: ["DEEPSEEK", "OPENAI"],
  approvalRef: "github:yoomarks/markorbit-knowledge#405",
  liveProviderCallsAuthorized: true,
  boundaries: {
    compareProviderQuality: false,
    legalTruthVerified: false,
    candidateAutoActivation: false,
  },
  createdAt: "2026-08-24T02:30:00.000Z",
};

const assignments = new Map<string, AiKnowledgeAssignmentV1>(
  assignmentIds.map((assignmentId, index) => [
    assignmentId,
    {
      protocolVersion: "1.0",
      objectType: "AI_KNOWLEDGE_ASSIGNMENT",
      assignmentId,
      jurisdiction: "US",
      domain: "TRADEMARK",
      topic: index === 0 ? "FILING" : index === 1 ? "DECLARATION_OF_USE" : "TTAB",
      title: `Assignment ${index + 1}`,
      instructionSetId: "kis_trademark_procedure",
      instructionSetRevision: 1,
      language: "zh-CN",
      prompt: `Research assignment ${index + 1}`,
      createdAt: "2026-08-23T03:00:00.000Z",
    },
  ]),
);

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function checkpointPath(): string {
  const root = mkdtempSync(join(tmpdir(), "markorbit-adk-live-resume-"));
  temporaryRoots.push(root);
  return join(root, "checkpoint.json");
}

function acquisitionFor(
  assignment: AiKnowledgeAssignmentV1,
  provider: AiKnowledgeProvider,
): AiKnowledgeAcquisition {
  const slug = `${assignment.assignmentId}_${provider.toLowerCase()}`;
  const markdown = `# ${slug}`;
  return {
    assignment,
    submission: {
      protocolVersion: "1.0",
      objectType: "AI_RESEARCH_SUBMISSION",
      submissionId: `ars_${slug}`,
      assignmentId: assignment.assignmentId,
      provider,
      model: provider === "DEEPSEEK" ? "deepseek-v4-flash" : "gpt-5.6",
      requestedAt: "2026-08-24T04:00:00.000Z",
      completedAt: "2026-08-24T04:00:01.000Z",
      promptSha256: "a".repeat(64),
      rawResponseSha256: "b".repeat(64),
      markdownSha256: "c".repeat(64),
      markdownSizeBytes: Buffer.byteLength(markdown),
    },
    artifact: {
      protocolVersion: "1.0",
      objectType: "AI_DISTILLED_KNOWLEDGE_ARTIFACT",
      artifactId: `adk_${slug}`,
      assignmentId: assignment.assignmentId,
      submissionId: `ars_${slug}`,
      provider,
      model: provider === "DEEPSEEK" ? "deepseek-v4-flash" : "gpt-5.6",
      instructionSetId: assignment.instructionSetId,
      instructionSetRevision: assignment.instructionSetRevision,
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
        sizeBytes: Buffer.byteLength(markdown),
        contentAddressedRef: `cas:sha256:${"c".repeat(64)}`,
        content: markdown,
      },
      createdAt: "2026-08-24T04:00:01.000Z",
    },
    rawResponse: new TextEncoder().encode(`{"provider":"${provider}"}`),
  };
}

function adapter(
  provider: AiKnowledgeProvider,
  acquire: (assignment: AiKnowledgeAssignmentV1) => Promise<AiKnowledgeAcquisition>,
): AiKnowledgeProviderAdapter {
  return {
    provider,
    acquire: async ({ assignment }) => acquire(assignment),
  };
}

function persisted(acquisition: AiKnowledgeAcquisition): AdkLivePilotCellPersistence {
  const slug = `${acquisition.assignment.assignmentId}_${acquisition.submission.provider.toLowerCase()}`;
  return {
    lineage: {
      assignmentId: acquisition.assignment.assignmentId,
      provider: acquisition.submission.provider,
      submissionId: acquisition.submission.submissionId,
      distilledArtifactId: acquisition.artifact.artifactId,
      rawProviderArtifactId: `art_raw_${slug}`,
      markdownRawArtifactId: `art_md_${slug}`,
    },
    rawProviderReceiptId: `air_raw_${slug}`,
    markdownReceiptId: `air_md_${slug}`,
    bytesPrepared: 100,
  };
}

function adaptersFrom(input?: {
  deepSeek?: (assignment: AiKnowledgeAssignmentV1) => Promise<AiKnowledgeAcquisition>;
  openAi?: (assignment: AiKnowledgeAssignmentV1) => Promise<AiKnowledgeAcquisition>;
}) {
  const deepSeek = vi.fn(
    input?.deepSeek ??
      (async (assignment: AiKnowledgeAssignmentV1) => acquisitionFor(assignment, "DEEPSEEK")),
  );
  const openAi = vi.fn(
    input?.openAi ??
      (async (assignment: AiKnowledgeAssignmentV1) => acquisitionFor(assignment, "OPENAI")),
  );
  return {
    calls: { deepSeek, openAi },
    adapters: new Map<AiKnowledgeProvider, AiKnowledgeProviderAdapter>([
      ["DEEPSEEK", adapter("DEEPSEEK", deepSeek)],
      ["OPENAI", adapter("OPENAI", openAi)],
    ]),
  };
}

describe("resumable ADK live pilot", () => {
  it("persists successful cells immediately and skips them on a later retry", async () => {
    const path = checkpointPath();
    let firstOpenAi = true;
    const first = adaptersFrom({
      openAi: async (assignment) => {
        if (firstOpenAi) {
          firstOpenAi = false;
          throw new AiKnowledgeAcquisitionError(
            "AI_PROVIDER_TEMPORARY_FAILURE",
            "rate limited",
            true,
          );
        }
        return acquisitionFor(assignment, "OPENAI");
      },
    });
    const persistAcquisition = vi.fn(async (acquisition: AiKnowledgeAcquisition) =>
      persisted(acquisition),
    );

    const partial = await executeResumableAdkLivePilot({
      checkpointPath: path,
      plan,
      assignments,
      adapters: first.adapters,
      persistAcquisition,
      verifyDurableCell: () => undefined,
    });

    expect(partial.completed).toBe(false);
    expect(partial.durableCellCount).toBe(1);
    expect(partial.receipts.at(-1)).toMatchObject({
      assignmentId: assignmentIds[0],
      provider: "OPENAI",
      status: "FAILED",
      retryable: true,
    });
    expect(persistAcquisition).toHaveBeenCalledTimes(1);

    const retry = adaptersFrom();
    const complete = await executeResumableAdkLivePilot({
      checkpointPath: path,
      plan,
      assignments,
      adapters: retry.adapters,
      persistAcquisition,
      verifyDurableCell: () => undefined,
    });

    expect(complete.completed).toBe(true);
    expect(complete.durableCellCount).toBe(6);
    expect(complete.artifactReceiptIds).toHaveLength(12);
    expect(new Set(complete.artifactReceiptIds).size).toBe(12);
    expect(retry.calls.deepSeek).toHaveBeenCalledTimes(2);
    expect(retry.calls.openAi).toHaveBeenCalledTimes(3);
    expect(persistAcquisition).toHaveBeenCalledTimes(6);
  });

  it("leaves an uncertain provider delivery in-flight and blocks automatic replay", async () => {
    const path = checkpointPath();
    const uncertain = adaptersFrom({
      deepSeek: async () => {
        throw new AiKnowledgeAcquisitionError(
          "AI_PROVIDER_TIMEOUT",
          "provider request timed out",
          true,
        );
      },
    });

    await expect(
      executeResumableAdkLivePilot({
        checkpointPath: path,
        plan,
        assignments,
        adapters: uncertain.adapters,
        persistAcquisition: async (acquisition) => persisted(acquisition),
        verifyDurableCell: () => undefined,
      }),
    ).rejects.toThrow(/PROVIDER_DELIVERY_REQUIRES_RECONCILIATION/iu);

    const checkpoint = parseAdkLivePilotCheckpoint(
      JSON.parse(readFileSync(path, "utf8")) as unknown,
    );
    expect(checkpoint.inFlight).toMatchObject({
      assignmentId: assignmentIds[0],
      provider: "DEEPSEEK",
    });

    const retry = adaptersFrom();
    await expect(
      executeResumableAdkLivePilot({
        checkpointPath: path,
        plan,
        assignments,
        adapters: retry.adapters,
        persistAcquisition: async (acquisition) => persisted(acquisition),
        verifyDurableCell: () => undefined,
      }),
    ).rejects.toThrow(/PROVIDER_DELIVERY_REQUIRES_RECONCILIATION/iu);
    expect(retry.calls.deepSeek).not.toHaveBeenCalled();
    expect(retry.calls.openAi).not.toHaveBeenCalled();
  });

  it("verifies restored durable evidence before skipping a provider call", async () => {
    const path = checkpointPath();
    const first = adaptersFrom({
      openAi: async () => {
        throw new AiKnowledgeAcquisitionError("AI_PROVIDER_REJECTED", "invalid key", false);
      },
    });
    await executeResumableAdkLivePilot({
      checkpointPath: path,
      plan,
      assignments,
      adapters: first.adapters,
      persistAcquisition: async (acquisition) => persisted(acquisition),
      verifyDurableCell: () => undefined,
    });

    const retry = adaptersFrom();
    const verifyDurableCell = vi.fn((_cell: AdkLivePilotDurableCellV1) => {
      throw new Error("restored RawArtifact evidence is missing");
    });
    await expect(
      executeResumableAdkLivePilot({
        checkpointPath: path,
        plan,
        assignments,
        adapters: retry.adapters,
        persistAcquisition: async (acquisition) => persisted(acquisition),
        verifyDurableCell,
      }),
    ).rejects.toThrow(/evidence is missing/iu);
    expect(verifyDurableCell).toHaveBeenCalledTimes(1);
    expect(retry.calls.deepSeek).not.toHaveBeenCalled();
    expect(retry.calls.openAi).not.toHaveBeenCalled();
  });
});
