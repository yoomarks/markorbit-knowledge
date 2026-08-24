import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AiGroundedExecutionEnvelopeV1, ArtifactUploadDescriptor } from "@markorbit/contracts";
import type { RawArtifactView } from "./raw-artifact-repository";
import {
  groundedPromptCanonicalUri,
  groundedPromptSourceUri,
  ingestAiGroundedPreparedPromptAsRawArtifact,
  type AiGroundedPromptIngestionRepository,
} from "./ai-grounded-prepared-execution-ingestion";

const prompt = "# Governed prompt\n\nUse the supplied official evidence only.";
const promptSha = createHash("sha256").update(prompt, "utf8").digest("hex");
const executionInputSha = "a".repeat(64);

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
  sourceReceiptsSha256: "b".repeat(64),
  executionInputSha256: executionInputSha,
  sourceReceipts: [
    {
      sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      canonicalUri: "https://www.uspto.gov/trademarks/maintain",
      mediaType: "text/html",
      contentSha256: "c".repeat(64),
      sizeBytes: 100,
    },
  ],
  preparedAt: "2026-08-24T10:00:00.000Z",
  providerCallAuthorized: false,
  providerCallExecuted: false,
  externalBrowsingAllowed: false,
  legalTruthVerified: false,
  executionAuthorityGranted: false,
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
      capturedAt: "2026-08-24T10:01:00.000Z",
      collector: { connectorId: "crawl4ai-web", connectorVersion: "1.0.0" },
      provenance: { sourceUri: groundedPromptSourceUri(executionInputSha) },
      status: "REGISTERED",
      createdAt: "2026-08-24T10:01:00.000Z",
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
      createdAt: "2026-08-24T10:01:00.000Z",
      verifiedAt: "2026-08-24T10:01:00.000Z",
    },
  };
}

function repository(captured: { descriptor?: ArtifactUploadDescriptor; uploaded?: Uint8Array }) {
  const createSession = vi.fn((input) => {
    captured.descriptor = input.descriptor;
    return {
      record: { session: { id: "ing_01ARZ3NDEKTSV4RRFFQ69G5FAV" } },
      replayed: false,
    };
  });
  const uploadContent = vi.fn(async (_worker, _credential, _lease, _token, _session, chunks) => {
    const parts: Uint8Array[] = [];
    for await (const chunk of chunks) parts.push(chunk);
    captured.uploaded = Buffer.concat(parts.map((part) => Buffer.from(part)));
    return {};
  });
  const finalize = vi.fn(async () => ({
    artifact: promptArtifact(),
    receipt: {},
    replayed: false,
  }));
  return {
    createSession,
    uploadContent,
    finalize,
  } as unknown as AiGroundedPromptIngestionRepository;
}

const execution = {
  workerId: "wrk_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  credential: "test-credential",
  leaseId: "lse_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  leaseToken: "test-lease-token",
};

describe("ingestAiGroundedPreparedPromptAsRawArtifact", () => {
  it("uses stable governed prompt identity and the authenticated RawArtifact boundary", async () => {
    const captured: { descriptor?: ArtifactUploadDescriptor; uploaded?: Uint8Array } = {};
    const repo = repository(captured);

    const result = await ingestAiGroundedPreparedPromptAsRawArtifact({
      repository: repo,
      execution,
      preparation: { envelope, renderedPrompt: prompt },
    });

    expect(result.promptArtifact.artifact.id).toBe("art_01ARZ3NDEKTSV4RRFFQ69G5FAW");
    expect(captured.descriptor).toMatchObject({
      artifactKind: "MARKDOWN",
      mimeType: "text/markdown",
      expectedSha256: promptSha,
      canonicalUri: groundedPromptCanonicalUri(executionInputSha),
      sourceUri: groundedPromptSourceUri(executionInputSha),
    });
    expect(Buffer.from(captured.uploaded ?? []).toString("utf8")).toBe(prompt);
    expect(repo.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `ai-grounded-prompt:${executionInputSha}:${promptSha}`,
      }),
    );
  });

  it("fails before ingestion when rendered prompt bytes drift from the PREPARED envelope", async () => {
    const captured: { descriptor?: ArtifactUploadDescriptor; uploaded?: Uint8Array } = {};
    const repo = repository(captured);

    await expect(
      ingestAiGroundedPreparedPromptAsRawArtifact({
        repository: repo,
        execution,
        preparation: { envelope, renderedPrompt: `${prompt}\nmutated` },
      }),
    ).rejects.toThrow(/SHA-256 does not match/u);
    expect(repo.createSession).not.toHaveBeenCalled();
  });
});
