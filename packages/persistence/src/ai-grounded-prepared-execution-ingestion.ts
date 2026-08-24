import { createHash } from "node:crypto";
import {
  isAiGroundedExecutionEnvelopeV1,
  type AiGroundedExecutionEnvelopeV1,
  type ArtifactUploadDescriptor,
} from "@markorbit/contracts";
import type { RawArtifactRepository, RawArtifactView } from "./raw-artifact-repository";
import { RegistryValidationError } from "./index";

export type AiGroundedPromptIngestionRepository = Pick<
  RawArtifactRepository,
  "createSession" | "uploadContent" | "finalize"
>;

export type AiGroundedPromptExecutionContext = {
  workerId: string;
  credential: string;
  leaseId: string;
  leaseToken: string;
};

export type AiGroundedPreparedPromptIngestionInput = {
  envelope: AiGroundedExecutionEnvelopeV1;
  renderedPrompt: string;
};

export type AiGroundedPreparedPromptIngestionResult = {
  promptArtifact: RawArtifactView;
};

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function byteStream(value: Uint8Array): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      yield value;
    },
  };
}

export function groundedPromptCanonicalUri(executionInputSha256: string): string {
  return `ai+markorbit://grounded-executions/${executionInputSha256}/prompt`;
}

export function groundedPromptSourceUri(executionInputSha256: string): string {
  return `ai+markorbit://grounded-executions/${executionInputSha256}/rendered-prompt`;
}

function promptBytes(input: AiGroundedPreparedPromptIngestionInput): Uint8Array {
  if (!isAiGroundedExecutionEnvelopeV1(input.envelope)) {
    throw new RegistryValidationError("Grounded execution envelope is invalid");
  }
  if (!input.renderedPrompt.trim()) {
    throw new RegistryValidationError("Grounded rendered prompt must not be empty");
  }
  const bytes = Buffer.from(input.renderedPrompt, "utf8");
  if (sha256(bytes) !== input.envelope.renderedPromptSha256) {
    throw new RegistryValidationError(
      "Grounded rendered prompt SHA-256 does not match the PREPARED execution envelope",
    );
  }
  return bytes;
}

function descriptor(
  input: AiGroundedPreparedPromptIngestionInput,
  bytes: Uint8Array,
): ArtifactUploadDescriptor {
  return {
    artifactKind: "MARKDOWN",
    mimeType: "text/markdown",
    originalName: `${input.envelope.executionInputSha256}.grounded-prompt.md`,
    expectedSizeBytes: bytes.byteLength,
    expectedSha256: input.envelope.renderedPromptSha256,
    sourceUri: groundedPromptSourceUri(input.envelope.executionInputSha256),
    canonicalUri: groundedPromptCanonicalUri(input.envelope.executionInputSha256),
  };
}

function assertFinalizedPromptArtifact(
  input: AiGroundedPreparedPromptIngestionInput,
  bytes: Uint8Array,
  artifact: RawArtifactView,
): void {
  const raw = artifact.artifact;
  if (
    raw.artifactKind !== "MARKDOWN" ||
    raw.mimeType !== "text/markdown" ||
    raw.binaryHash.value !== input.envelope.renderedPromptSha256 ||
    raw.contentHash?.value !== input.envelope.renderedPromptSha256 ||
    raw.sizeBytes !== bytes.byteLength ||
    raw.canonicalUri !== groundedPromptCanonicalUri(input.envelope.executionInputSha256) ||
    raw.provenance.sourceUri !== groundedPromptSourceUri(input.envelope.executionInputSha256)
  ) {
    throw new RegistryValidationError(
      "Finalized grounded prompt RawArtifact does not match PREPARED execution evidence",
    );
  }
}

export async function ingestAiGroundedPreparedPromptAsRawArtifact(input: {
  repository: AiGroundedPromptIngestionRepository;
  execution: AiGroundedPromptExecutionContext;
  preparation: AiGroundedPreparedPromptIngestionInput;
}): Promise<AiGroundedPreparedPromptIngestionResult> {
  const bytes = promptBytes(input.preparation);
  const uploadDescriptor = descriptor(input.preparation, bytes);
  const created = input.repository.createSession({
    ...input.execution,
    descriptor: uploadDescriptor,
    idempotencyKey: `ai-grounded-prompt:${input.preparation.envelope.executionInputSha256}:${input.preparation.envelope.renderedPromptSha256}`,
  });
  const sessionId = created.record.session.id;
  await input.repository.uploadContent(
    input.execution.workerId,
    input.execution.credential,
    input.execution.leaseId,
    input.execution.leaseToken,
    sessionId,
    byteStream(bytes),
  );
  const finalized = await input.repository.finalize(
    input.execution.workerId,
    input.execution.credential,
    input.execution.leaseId,
    input.execution.leaseToken,
    sessionId,
  );
  assertFinalizedPromptArtifact(input.preparation, bytes, finalized.artifact);
  return { promptArtifact: finalized.artifact };
}
