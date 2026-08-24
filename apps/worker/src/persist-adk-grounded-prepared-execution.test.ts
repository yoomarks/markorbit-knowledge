import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type {
  AiGroundedExecutionEnvelopeV1,
  AiGroundedPreparedExecutionEvidenceV1,
} from "@markorbit/contracts";
import {
  groundedPromptCanonicalUri,
  groundedPromptSourceUri,
  type AiGroundedPromptIngestionRepository,
} from "@markorbit/persistence/ai-grounded-prepared-prompt-ingestion";
import type { RawArtifactView } from "@markorbit/persistence/raw-artifacts";
import type { PreparedAiGroundedExecutionV1 } from "@markorbit/worker-runtime/ai-grounded-execution-preparer";
import { persistPreparedAiGroundedExecutionV1 } from "./persist-adk-grounded-prepared-execution";

const prompt = "# Governed prompt\n\nUse only frozen official evidence.";
const promptSha = createHash("sha256").update(prompt, "utf8").digest("hex");
const executionInputSha = "a".repeat(64);
const sourceReceipt = {
  sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  canonicalUri: "https://www.uspto.gov/trademarks/maintain",
  mediaType: "text/html" as const,
  contentSha256: "b".repeat(64),
  sizeBytes: 100,
};

const envelope: AiGroundedExecutionEnvelopeV1 = {
  protocolVersion: "1.0",
  objectType: "AI_GROUNDED_EXECUTION_ENVELOPE",
  status: "PREPARED",
  assignmentId: "kas_us_trademark_section_8",
  bindingId: "asb_us_trademark_section_8_official",
  sourcePackId: "asp_us_trademark_section_8_official",
  sourcePackRevision: 1,
  rendererVersion: "1.0.0",
  renderedPromptSha256: promptSha,
  sourceReceiptsSha256: "c".repeat(64),
  executionInputSha256: executionInputSha,
  sourceReceipts: [sourceReceipt],
  preparedAt: "2026-08-24T10:15:00.000Z",
  providerCallAuthorized: false,
  providerCallExecuted: false,
  externalBrowsingAllowed: false,
  legalTruthVerified: false,
  executionAuthorityGranted: false,
};

const preparation: PreparedAiGroundedExecutionV1 = {
  envelope,
  providerInput: {
    assignmentId: envelope.assignmentId,
    bindingId: envelope.bindingId,
    sourcePackId: envelope.sourcePackId,
    sourcePackRevision: envelope.sourcePackRevision,
    renderedPrompt: prompt,
    renderedPromptSha256: promptSha,
    sources: [sourceReceipt],
    legalTruthVerified: false,
    executionAuthorityGranted: false,
  },
};

function promptArtifact(): RawArtifactView {
  return {
    artifact: {
      schemaVersion: "1.0",
      objectType: "RAW_ARTIFACT",
      id: "art_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      version: 1,
      artifactKind: "MARKDOWN",
      mimeType: "text/markdown",
      originalName: `${executionInputSha}.grounded-prompt.md`,
      canonicalUri: groundedPromptCanonicalUri(executionInputSha),
      storage: { provider: "LOCAL", uri: `artifact+local://sha256/${promptSha}` },
      binaryHash: { algorithm: "SHA-256", value: promptSha },
      contentHash: { algorithm: "SHA-256", value: promptSha },
      sizeBytes: Buffer.byteLength(prompt),
      capturedAt: "2026-08-24T10:16:00.000Z",
      collector: { connectorId: "crawl4ai-web", connectorVersion: "1.0.0" },
      provenance: { sourceUri: groundedPromptSourceUri(executionInputSha) },
      status: "REGISTERED",
      createdAt: "2026-08-24T10:16:00.000Z",
    },
    jobId: "job_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    jobAttempt: 1,
    executionAttemptId: "exa_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    sessionId: "ing_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    receiptId: "air_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    contentObject: {
      sha256: promptSha,
      sizeBytes: Buffer.byteLength(prompt),
      referenceCount: 1,
      storageUri: `artifact+local://sha256/${promptSha}`,
      createdAt: "2026-08-24T10:16:00.000Z",
      verifiedAt: "2026-08-24T10:16:00.000Z",
    },
  };
}

const evidence: AiGroundedPreparedExecutionEvidenceV1 = {
  protocolVersion: "1.0",
  objectType: "AI_GROUNDED_PREPARED_EXECUTION_EVIDENCE",
  executionInputSha256: executionInputSha,
  assignmentId: envelope.assignmentId,
  bindingId: envelope.bindingId,
  sourcePackId: envelope.sourcePackId,
  sourcePackRevision: envelope.sourcePackRevision,
  rendererVersion: envelope.rendererVersion,
  renderedPromptSha256: promptSha,
  sourceReceiptsSha256: envelope.sourceReceiptsSha256,
  sourceReceipts: envelope.sourceReceipts,
  promptArtifact: {
    artifactId: promptArtifact().artifact.id,
    workspaceId: promptArtifact().artifact.workspaceId,
    sourceId: promptArtifact().artifact.sourceId,
    contentSha256: promptSha,
    sizeBytes: Buffer.byteLength(prompt),
    canonicalUri: groundedPromptCanonicalUri(executionInputSha),
    sourceUri: groundedPromptSourceUri(executionInputSha),
  },
  canonicalPreparedAt: envelope.preparedAt,
  persistedAt: "2026-08-24T10:17:00.000Z",
  providerCallAuthorized: false,
  providerCallExecuted: false,
  externalBrowsingAllowed: false,
  legalTruthVerified: false,
  executionAuthorityGranted: false,
};

const execution = {
  workerId: "wrk_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  credential: "credential",
  leaseId: "lse_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  leaseToken: "lease-token",
};

function rawRepository(): AiGroundedPromptIngestionRepository {
  return {
    createSession: vi.fn(() => ({
      record: { session: { id: "ing_01ARZ3NDEKTSV4RRFFQ69G5FAV" } },
      replayed: false,
    })) as never,
    uploadContent: vi.fn(async () => ({})) as never,
    finalize: vi.fn(async () => ({
      artifact: promptArtifact(),
      receipt: {},
      replayed: false,
    })) as never,
  };
}

describe("persistPreparedAiGroundedExecutionV1", () => {
  it("uploads the rendered prompt once before saving new PREPARED evidence", async () => {
    const raw = rawRepository();
    const evidenceRepository = {
      get: vi.fn(() => null),
      save: vi.fn((input) => {
        expect(input.promptArtifactId).toBe(promptArtifact().artifact.id);
        return { evidence, replayed: false };
      }),
    };

    const result = await persistPreparedAiGroundedExecutionV1({
      preparation,
      evidenceRepository,
      rawArtifactRepository: raw,
      execution,
    });

    expect(result.replayed).toBe(false);
    expect(result.promptUploadSkipped).toBe(false);
    expect(raw.createSession).toHaveBeenCalledTimes(1);
    expect(evidenceRepository.save).toHaveBeenCalledTimes(1);
  });

  it("skips prompt upload on restart when the execution input already has canonical evidence", async () => {
    const raw = rawRepository();
    const evidenceRepository = {
      get: vi.fn(() => evidence),
      save: vi.fn(() => ({ evidence, replayed: true })),
    };

    const result = await persistPreparedAiGroundedExecutionV1({
      preparation: {
        ...preparation,
        envelope: { ...envelope, preparedAt: "2026-08-24T11:15:00.000Z" },
      },
      evidenceRepository,
      rawArtifactRepository: raw,
      execution,
    });

    expect(result.replayed).toBe(true);
    expect(result.promptUploadSkipped).toBe(true);
    expect(raw.createSession).not.toHaveBeenCalled();
    expect(evidenceRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ promptArtifactId: evidence.promptArtifact.artifactId }),
    );
  });

  it("fails before storage when provider input and envelope no longer match", async () => {
    const raw = rawRepository();
    const evidenceRepository = {
      get: vi.fn(() => null),
      save: vi.fn(),
    };

    await expect(
      persistPreparedAiGroundedExecutionV1({
        preparation: {
          ...preparation,
          providerInput: { ...preparation.providerInput, renderedPrompt: `${prompt}\nmutated` },
        },
        evidenceRepository,
        rawArtifactRepository: raw,
        execution,
      }),
    ).rejects.toMatchObject({ code: "AI_GROUNDED_PREPARATION_INTEGRITY_MISMATCH" });
    expect(raw.createSession).not.toHaveBeenCalled();
    expect(evidenceRepository.save).not.toHaveBeenCalled();
  });
});
