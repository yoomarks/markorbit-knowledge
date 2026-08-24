import { createHash } from "node:crypto";
import type { AiGroundedPreparedExecutionEvidenceV1 } from "@markorbit/contracts";
import {
  ingestAiGroundedPreparedPromptAsRawArtifact,
  type AiGroundedPromptExecutionContext,
  type AiGroundedPromptIngestionRepository,
} from "@markorbit/persistence/ai-grounded-prepared-prompt-ingestion";
import type { SqliteAiGroundedPreparedExecutionEvidenceRepository } from "@markorbit/persistence/ai-grounded-prepared-execution-evidence";
import type { PreparedAiGroundedExecutionV1 } from "@markorbit/worker-runtime/ai-grounded-execution-preparer";

export type AiGroundedPreparedEvidenceRepository = Pick<
  SqliteAiGroundedPreparedExecutionEvidenceRepository,
  "get" | "save"
>;

export type PersistPreparedAiGroundedExecutionResultV1 = {
  evidence: AiGroundedPreparedExecutionEvidenceV1;
  replayed: boolean;
  promptUploadSkipped: boolean;
};

export class PersistPreparedAiGroundedExecutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PersistPreparedAiGroundedExecutionError";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertPreparationIntegrity(preparation: PreparedAiGroundedExecutionV1): void {
  const envelope = preparation.envelope;
  const providerInput = preparation.providerInput;
  if (
    providerInput.assignmentId !== envelope.assignmentId ||
    providerInput.bindingId !== envelope.bindingId ||
    providerInput.sourcePackId !== envelope.sourcePackId ||
    providerInput.sourcePackRevision !== envelope.sourcePackRevision ||
    providerInput.renderedPromptSha256 !== envelope.renderedPromptSha256 ||
    sha256(providerInput.renderedPrompt) !== envelope.renderedPromptSha256 ||
    JSON.stringify(providerInput.sources) !== JSON.stringify(envelope.sourceReceipts)
  ) {
    throw new PersistPreparedAiGroundedExecutionError(
      "AI_GROUNDED_PREPARATION_INTEGRITY_MISMATCH",
      "PREPARED grounded provider input does not match its execution envelope",
    );
  }
}

export async function persistPreparedAiGroundedExecutionV1(input: {
  preparation: PreparedAiGroundedExecutionV1;
  evidenceRepository: AiGroundedPreparedEvidenceRepository;
  rawArtifactRepository: AiGroundedPromptIngestionRepository;
  execution: AiGroundedPromptExecutionContext;
  persistedAt?: string;
}): Promise<PersistPreparedAiGroundedExecutionResultV1> {
  assertPreparationIntegrity(input.preparation);
  const envelope = input.preparation.envelope;
  const existing = input.evidenceRepository.get(envelope.executionInputSha256);
  if (existing) {
    const replay = input.evidenceRepository.save({
      envelope,
      promptArtifactId: existing.promptArtifact.artifactId,
      ...(input.persistedAt ? { persistedAt: input.persistedAt } : {}),
    });
    return {
      evidence: replay.evidence,
      replayed: true,
      promptUploadSkipped: true,
    };
  }

  const ingested = await ingestAiGroundedPreparedPromptAsRawArtifact({
    repository: input.rawArtifactRepository,
    execution: input.execution,
    preparation: {
      envelope,
      renderedPrompt: input.preparation.providerInput.renderedPrompt,
    },
  });
  const saved = input.evidenceRepository.save({
    envelope,
    promptArtifactId: ingested.promptArtifact.artifact.id,
    ...(input.persistedAt ? { persistedAt: input.persistedAt } : {}),
  });
  return {
    evidence: saved.evidence,
    replayed: saved.replayed,
    promptUploadSkipped: false,
  };
}
