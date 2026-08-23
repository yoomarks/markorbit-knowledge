import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  AiDistilledKnowledgeArtifactV1,
  AiResearchSubmissionV1,
  ArtifactUploadDescriptor,
} from "@markorbit/contracts";
import type { RawArtifactView } from "./raw-artifact-repository";
import {
  ingestAiDistilledKnowledgeAsRawArtifacts,
  type AiRawArtifactIngestionRepository,
} from "./ai-distilled-knowledge-ingestion";

const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

const rawResponse = new TextEncoder().encode(
  JSON.stringify({
    id: "deepseek-request-1",
    model: "deepseek-chat",
    choices: [{ message: { role: "assistant", content: "# Section 8\n\nResearch." } }],
  }),
);
const markdown = "# Section 8\n\nResearch.";
const markdownBytes = Buffer.from(markdown, "utf8");

const submission: AiResearchSubmissionV1 = {
  protocolVersion: "1.0",
  objectType: "AI_RESEARCH_SUBMISSION",
  submissionId: "ars_1234567890abcdef1234567890abcdef",
  assignmentId: "kas_us_trademark_section8",
  provider: "DEEPSEEK",
  model: "deepseek-chat",
  requestedAt: "2026-08-23T04:30:00.000Z",
  completedAt: "2026-08-23T04:30:03.000Z",
  promptSha256: "a".repeat(64),
  rawResponseSha256: hash(rawResponse),
  markdownSha256: hash(markdownBytes),
  markdownSizeBytes: markdownBytes.byteLength,
  providerRequestId: "deepseek-request-1",
};

const artifact: AiDistilledKnowledgeArtifactV1 = {
  protocolVersion: "1.0",
  objectType: "AI_DISTILLED_KNOWLEDGE_ARTIFACT",
  artifactId: "adk_1234567890abcdef1234567890abcdef",
  assignmentId: submission.assignmentId,
  submissionId: submission.submissionId,
  provider: submission.provider,
  model: submission.model,
  instructionSetId: "kis_trademark_procedure",
  instructionSetRevision: 1,
  provenance: {
    sourceKind: "SYNTHETIC_AI",
    legalTruthVerified: false,
    rawResponseSha256: submission.rawResponseSha256,
    promptSha256: submission.promptSha256,
  },
  content: {
    mediaType: "text/markdown",
    encoding: "utf-8",
    sha256: submission.markdownSha256,
    sizeBytes: submission.markdownSizeBytes,
    contentAddressedRef: `cas:sha256:${submission.markdownSha256}`,
    content: markdown,
  },
  createdAt: submission.completedAt,
};

const execution = {
  workerId: "wrk_test",
  credential: "secret",
  leaseId: "lse_test",
  leaseToken: "lease-secret",
};

function view(id: string): RawArtifactView {
  return { artifact: { id } } as unknown as RawArtifactView;
}

function fakeRepository() {
  const descriptors: ArtifactUploadDescriptor[] = [];
  const uploads: Uint8Array[] = [];
  let session = 0;
  let finalize = 0;
  const repository = {
    createSession(input: { descriptor: ArtifactUploadDescriptor }) {
      descriptors.push(input.descriptor);
      session += 1;
      return {
        record: { session: { id: `ing_${session}` } },
        replayed: false,
      } as unknown as ReturnType<AiRawArtifactIngestionRepository["createSession"]>;
    },
    async uploadContent(
      _workerId: string,
      _credential: string,
      _leaseId: string,
      _leaseToken: string,
      _sessionId: string,
      chunks: AsyncIterable<Uint8Array>,
    ) {
      for await (const chunk of chunks) uploads.push(chunk);
      return {} as Awaited<ReturnType<AiRawArtifactIngestionRepository["uploadContent"]>>;
    },
    async finalize() {
      finalize += 1;
      const id = finalize === 1 ? "art_RAW_PROVIDER" : "art_MARKDOWN";
      return {
        artifact: view(id),
        receipt: {},
        replayed: false,
      } as unknown as Awaited<ReturnType<AiRawArtifactIngestionRepository["finalize"]>>;
    },
  } as AiRawArtifactIngestionRepository;
  return { repository, descriptors, uploads };
}

describe("ingestAiDistilledKnowledgeAsRawArtifacts", () => {
  it("ingests exact provider JSON first and Markdown second with parent lineage", async () => {
    const fake = fakeRepository();
    const result = await ingestAiDistilledKnowledgeAsRawArtifacts({
      repository: fake.repository,
      execution,
      acquisition: { submission, artifact, rawResponse },
    });

    expect(result.rawProviderArtifact.artifact.id).toBe("art_RAW_PROVIDER");
    expect(result.markdownArtifact.artifact.id).toBe("art_MARKDOWN");
    expect(fake.descriptors).toHaveLength(2);
    expect(fake.descriptors[0]).toMatchObject({
      artifactKind: "JSON",
      mimeType: "application/json",
      expectedSha256: submission.rawResponseSha256,
    });
    expect(fake.descriptors[1]).toMatchObject({
      artifactKind: "MARKDOWN",
      mimeType: "text/markdown",
      expectedSha256: submission.markdownSha256,
      parentArtifactIds: ["art_RAW_PROVIDER"],
    });
    expect(fake.uploads[0]).toEqual(rawResponse);
    expect(new TextDecoder().decode(fake.uploads[1])).toBe(markdown);
  });

  it("fails before RawArtifact writes when exact provider bytes do not match the submission", async () => {
    const fake = fakeRepository();
    const corrupted = new TextEncoder().encode('{"different":true}');

    await expect(
      ingestAiDistilledKnowledgeAsRawArtifacts({
        repository: fake.repository,
        execution,
        acquisition: { submission, artifact, rawResponse: corrupted },
      }),
    ).rejects.toThrowError(/raw provider response SHA-256/u);
    expect(fake.descriptors).toHaveLength(0);
  });

  it("fails before RawArtifact writes when Markdown provenance is inconsistent", async () => {
    const fake = fakeRepository();
    const corruptedArtifact: AiDistilledKnowledgeArtifactV1 = {
      ...artifact,
      provenance: { ...artifact.provenance, legalTruthVerified: false },
      content: { ...artifact.content, content: `${artifact.content.content}\nchanged` },
    };

    await expect(
      ingestAiDistilledKnowledgeAsRawArtifacts({
        repository: fake.repository,
        execution,
        acquisition: { submission, artifact: corruptedArtifact, rawResponse },
      }),
    ).rejects.toThrowError(/distilled Markdown artifact/u);
    expect(fake.descriptors).toHaveLength(0);
  });
});
