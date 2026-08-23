import { createHash } from "node:crypto";
import type {
  AiDistilledKnowledgeArtifactV1,
  AiResearchSubmissionV1,
  ArtifactUploadDescriptor,
} from "@markorbit/contracts";
import type { RawArtifactRepository, RawArtifactView } from "./raw-artifact-repository";
import { RegistryValidationError } from "./index";

export type AiRawArtifactIngestionRepository = Pick<
  RawArtifactRepository,
  "createSession" | "uploadContent" | "finalize"
>;

export type AiRawArtifactExecutionContext = {
  workerId: string;
  credential: string;
  leaseId: string;
  leaseToken: string;
};

export type AiDistilledKnowledgeIngestionInput = {
  submission: AiResearchSubmissionV1;
  artifact: AiDistilledKnowledgeArtifactV1;
  rawResponse: Uint8Array;
};

export type AiDistilledKnowledgeIngestionResult = {
  rawProviderArtifact: RawArtifactView;
  markdownArtifact: RawArtifactView;
};

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function providerSlug(provider: string): string {
  return provider.toLowerCase().replace(/[^a-z0-9-]/gu, "-");
}

function modelSlug(model: string): string {
  return encodeURIComponent(model.toLowerCase());
}

function byteStream(value: Uint8Array): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      yield value;
    },
  };
}

function validateInput(input: AiDistilledKnowledgeIngestionInput): void {
  const rawResponseSha256 = sha256(input.rawResponse);
  if (rawResponseSha256 !== input.submission.rawResponseSha256) {
    throw new RegistryValidationError(
      "AI raw provider response SHA-256 does not match submission evidence",
    );
  }

  const markdown = Buffer.from(input.artifact.content.content, "utf8");
  const markdownSha256 = sha256(markdown);
  if (
    input.artifact.objectType !== "AI_DISTILLED_KNOWLEDGE_ARTIFACT" ||
    input.artifact.provenance.sourceKind !== "SYNTHETIC_AI" ||
    input.artifact.provenance.legalTruthVerified !== false ||
    input.artifact.submissionId !== input.submission.submissionId ||
    input.artifact.assignmentId !== input.submission.assignmentId ||
    input.artifact.provider !== input.submission.provider ||
    input.artifact.model !== input.submission.model ||
    input.artifact.provenance.rawResponseSha256 !== input.submission.rawResponseSha256 ||
    input.artifact.provenance.promptSha256 !== input.submission.promptSha256 ||
    input.artifact.content.sha256 !== input.submission.markdownSha256 ||
    input.artifact.content.sha256 !== markdownSha256 ||
    input.artifact.content.sizeBytes !== markdown.byteLength ||
    input.artifact.content.sizeBytes !== input.submission.markdownSizeBytes ||
    input.artifact.content.contentAddressedRef !== `cas:sha256:${markdownSha256}` ||
    input.artifact.content.mediaType !== "text/markdown" ||
    input.artifact.content.encoding !== "utf-8"
  ) {
    throw new RegistryValidationError(
      "AI distilled Markdown artifact does not match frozen submission evidence",
    );
  }
}

function rawDescriptor(input: AiDistilledKnowledgeIngestionInput): ArtifactUploadDescriptor {
  const provider = providerSlug(input.submission.provider);
  return {
    artifactKind: "JSON",
    mimeType: "application/json",
    originalName: `${input.submission.submissionId}.provider-response.json`,
    expectedSizeBytes: input.rawResponse.byteLength,
    expectedSha256: input.submission.rawResponseSha256,
    sourceUri: `ai+markorbit://${provider}/submissions/${input.submission.submissionId}/raw`,
    canonicalUri: `ai+markorbit://${provider}/assignments/${input.submission.assignmentId}/models/${modelSlug(input.submission.model)}`,
    publishedAt: input.submission.completedAt,
  };
}

function markdownDescriptor(
  input: AiDistilledKnowledgeIngestionInput,
  rawArtifactId: string,
): ArtifactUploadDescriptor {
  const provider = providerSlug(input.submission.provider);
  return {
    artifactKind: "MARKDOWN",
    mimeType: "text/markdown",
    originalName: `${input.submission.submissionId}.md`,
    expectedSizeBytes: input.artifact.content.sizeBytes,
    expectedSha256: input.artifact.content.sha256,
    sourceUri: `ai+markorbit://${provider}/submissions/${input.submission.submissionId}/markdown`,
    canonicalUri: `ai+markorbit://${provider}/assignments/${input.submission.assignmentId}/models/${modelSlug(input.submission.model)}`,
    publishedAt: input.submission.completedAt,
    parentArtifactIds: [rawArtifactId],
  };
}

async function ingestOne(input: {
  repository: AiRawArtifactIngestionRepository;
  execution: AiRawArtifactExecutionContext;
  descriptor: ArtifactUploadDescriptor;
  idempotencyKey: string;
  bytes: Uint8Array;
}): Promise<RawArtifactView> {
  const created = input.repository.createSession({
    ...input.execution,
    descriptor: input.descriptor,
    idempotencyKey: input.idempotencyKey,
  });
  const sessionId = created.record.session.id;
  await input.repository.uploadContent(
    input.execution.workerId,
    input.execution.credential,
    input.execution.leaseId,
    input.execution.leaseToken,
    sessionId,
    byteStream(input.bytes),
  );
  const finalized = await input.repository.finalize(
    input.execution.workerId,
    input.execution.credential,
    input.execution.leaseId,
    input.execution.leaseToken,
    sessionId,
  );
  return finalized.artifact;
}

export async function ingestAiDistilledKnowledgeAsRawArtifacts(input: {
  repository: AiRawArtifactIngestionRepository;
  execution: AiRawArtifactExecutionContext;
  acquisition: AiDistilledKnowledgeIngestionInput;
}): Promise<AiDistilledKnowledgeIngestionResult> {
  validateInput(input.acquisition);

  const rawProviderArtifact = await ingestOne({
    repository: input.repository,
    execution: input.execution,
    descriptor: rawDescriptor(input.acquisition),
    idempotencyKey: `ai-provider-response:${input.acquisition.submission.submissionId}:${input.acquisition.submission.rawResponseSha256}`,
    bytes: input.acquisition.rawResponse,
  });

  const markdownBytes = Buffer.from(input.acquisition.artifact.content.content, "utf8");
  const markdownArtifact = await ingestOne({
    repository: input.repository,
    execution: input.execution,
    descriptor: markdownDescriptor(input.acquisition, rawProviderArtifact.artifact.id),
    idempotencyKey: `ai-distilled-markdown:${input.acquisition.submission.submissionId}:${input.acquisition.artifact.content.sha256}`,
    bytes: markdownBytes,
  });

  return { rawProviderArtifact, markdownArtifact };
}
