import { createHash } from "node:crypto";
import {
  AI_GROUNDED_EXECUTION_ENVELOPE_OBJECT_TYPE,
  AI_GROUNDED_EXECUTION_PROTOCOL_VERSION,
  AI_GROUNDED_EXECUTION_STATUS,
  assertAiGroundedExecutionEnvelopeV1,
  type AiAssignmentSourceBindingV1,
  type AiGroundedExecutionEnvelopeV1,
  type AiGroundedExecutionSourceReceiptV1,
  type AiKnowledgeAssignmentV1,
  type AiSourcePackV1,
} from "@markorbit/contracts";
import {
  renderAiGroundedProviderInputV1,
  type AiGroundedProviderInputV1,
  type AiSourceSnapshotResolver,
  type RenderAiGroundedProviderInputOptions,
} from "./ai-source-pack-renderer";

export const AI_GROUNDED_EXECUTION_RENDERER_VERSION = "1.0.0" as const;

export type PreparedAiGroundedExecutionV1 = {
  envelope: AiGroundedExecutionEnvelopeV1;
  providerInput: AiGroundedProviderInputV1;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function sourceReceipts(
  input: AiGroundedProviderInputV1,
): readonly AiGroundedExecutionSourceReceiptV1[] {
  return input.sources.map((source) => ({
    sourceId: source.sourceId,
    artifactId: source.artifactId,
    canonicalUri: source.canonicalUri,
    mediaType: source.mediaType,
    contentSha256: source.contentSha256,
    sizeBytes: source.sizeBytes,
  }));
}

export async function prepareAiGroundedExecutionV1(input: {
  assignment: AiKnowledgeAssignmentV1;
  binding: AiAssignmentSourceBindingV1;
  sourcePack: AiSourcePackV1;
  resolver: AiSourceSnapshotResolver;
  preparedAt?: string;
  rendererOptions?: RenderAiGroundedProviderInputOptions;
}): Promise<PreparedAiGroundedExecutionV1> {
  const providerInput = await renderAiGroundedProviderInputV1({
    assignment: input.assignment,
    binding: input.binding,
    sourcePack: input.sourcePack,
    resolver: input.resolver,
    ...(input.rendererOptions ? { options: input.rendererOptions } : {}),
  });

  const receipts = sourceReceipts(providerInput);
  const sourceReceiptsSha256 = sha256(canonicalJson(receipts));
  const executionInputSha256 = sha256(
    canonicalJson({
      assignmentId: providerInput.assignmentId,
      bindingId: providerInput.bindingId,
      sourcePackId: providerInput.sourcePackId,
      sourcePackRevision: providerInput.sourcePackRevision,
      rendererVersion: AI_GROUNDED_EXECUTION_RENDERER_VERSION,
      renderedPromptSha256: providerInput.renderedPromptSha256,
      sourceReceiptsSha256,
    }),
  );
  const preparedAt = input.preparedAt ?? new Date().toISOString();

  const envelope: AiGroundedExecutionEnvelopeV1 = {
    protocolVersion: AI_GROUNDED_EXECUTION_PROTOCOL_VERSION,
    objectType: AI_GROUNDED_EXECUTION_ENVELOPE_OBJECT_TYPE,
    status: AI_GROUNDED_EXECUTION_STATUS,
    assignmentId: providerInput.assignmentId,
    bindingId: providerInput.bindingId,
    sourcePackId: providerInput.sourcePackId,
    sourcePackRevision: providerInput.sourcePackRevision,
    rendererVersion: AI_GROUNDED_EXECUTION_RENDERER_VERSION,
    renderedPromptSha256: providerInput.renderedPromptSha256,
    sourceReceiptsSha256,
    executionInputSha256,
    sourceReceipts: receipts,
    preparedAt,
    providerCallAuthorized: false,
    providerCallExecuted: false,
    externalBrowsingAllowed: false,
    legalTruthVerified: false,
    executionAuthorityGranted: false,
  };
  assertAiGroundedExecutionEnvelopeV1(envelope);

  return { envelope, providerInput };
}
