import { createHash } from "node:crypto";
import type { AiGroundedProviderInputV1 } from "./ai-source-pack-renderer";

export const AI_SOURCE_PACK_INSUFFICIENT_PREFIX = "SOURCE_PACK_INSUFFICIENT:" as const;

export type AiGroundedOutputValidationStatus = "VALID_GROUNDED" | "VALID_INSUFFICIENT";

export type AiGroundedOutputValidationReceiptV1 = {
  status: AiGroundedOutputValidationStatus;
  assignmentId: string;
  bindingId: string;
  sourcePackId: string;
  sourcePackRevision: number;
  renderedPromptSha256: string;
  outputSha256: string;
  citationCount: number;
  citedSourceIds: readonly string[];
  unreferencedSourceIds: readonly string[];
  insufficiencyDeclared: boolean;
  legalTruthVerified: false;
  semanticClaimCoverageVerified: false;
};

export class AiGroundedOutputValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AiGroundedOutputValidationError";
  }
}

const VALID_CITATION = /\[source:(src_[0-9A-HJKMNP-TV-Z]{26})\]/gu;
const SOURCE_TOKEN_START = "[source:";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function exactInsufficiencyDeclaration(output: string): boolean {
  return output.split(/\r?\n/u).some((line) => {
    const trimmed = line.trim();
    return (
      trimmed.startsWith(AI_SOURCE_PACK_INSUFFICIENT_PREFIX) &&
      trimmed.slice(AI_SOURCE_PACK_INSUFFICIENT_PREFIX.length).trim().length > 0
    );
  });
}

function citationScan(output: string): { citedSourceIds: string[]; citationCount: number } {
  const citedSourceIds: string[] = [];
  const seen = new Set<string>();
  let citationCount = 0;
  let scrubbed = "";
  let cursor = 0;

  for (const match of output.matchAll(VALID_CITATION)) {
    const index = match.index ?? 0;
    scrubbed += output.slice(cursor, index);
    cursor = index + match[0].length;
    citationCount += 1;
    const sourceId = match[1];
    if (!seen.has(sourceId)) {
      seen.add(sourceId);
      citedSourceIds.push(sourceId);
    }
  }
  scrubbed += output.slice(cursor);

  if (scrubbed.includes(SOURCE_TOKEN_START)) {
    throw new AiGroundedOutputValidationError(
      "AI_GROUNDED_OUTPUT_CITATION_MALFORMED",
      "Provider output contains a malformed source citation token",
    );
  }

  return { citedSourceIds, citationCount };
}

export function validateAiGroundedProviderOutputV1(input: {
  providerInput: AiGroundedProviderInputV1;
  output: string;
}): AiGroundedOutputValidationReceiptV1 {
  if (sha256(input.providerInput.renderedPrompt) !== input.providerInput.renderedPromptSha256) {
    throw new AiGroundedOutputValidationError(
      "AI_GROUNDED_INPUT_PROMPT_DIGEST_MISMATCH",
      "Grounded provider input prompt no longer matches its frozen SHA-256 identity",
    );
  }

  const output = input.output.trim();
  if (!output) {
    throw new AiGroundedOutputValidationError(
      "AI_GROUNDED_OUTPUT_EMPTY",
      "Provider output must not be empty",
    );
  }

  const knownSourceIds = input.providerInput.sources.map((source) => source.sourceId);
  const known = new Set(knownSourceIds);
  if (known.size !== knownSourceIds.length) {
    throw new AiGroundedOutputValidationError(
      "AI_GROUNDED_INPUT_SOURCE_ID_DUPLICATE",
      "Grounded provider input contains duplicate source identities",
    );
  }

  const { citedSourceIds, citationCount } = citationScan(output);
  const unknown = citedSourceIds.filter((sourceId) => !known.has(sourceId));
  if (unknown.length > 0) {
    throw new AiGroundedOutputValidationError(
      "AI_GROUNDED_OUTPUT_UNKNOWN_SOURCE",
      `Provider output cites source IDs outside the bound source pack: ${unknown.join(", ")}`,
    );
  }

  const insufficiencyDeclared = exactInsufficiencyDeclaration(output);
  if (citationCount === 0 && !insufficiencyDeclared) {
    throw new AiGroundedOutputValidationError(
      "AI_GROUNDED_OUTPUT_CITATION_REQUIRED",
      "Provider output must cite a bound source or explicitly declare source-pack insufficiency",
    );
  }

  return {
    status: insufficiencyDeclared ? "VALID_INSUFFICIENT" : "VALID_GROUNDED",
    assignmentId: input.providerInput.assignmentId,
    bindingId: input.providerInput.bindingId,
    sourcePackId: input.providerInput.sourcePackId,
    sourcePackRevision: input.providerInput.sourcePackRevision,
    renderedPromptSha256: input.providerInput.renderedPromptSha256,
    outputSha256: sha256(output),
    citationCount,
    citedSourceIds,
    unreferencedSourceIds: knownSourceIds.filter((sourceId) => !citedSourceIds.includes(sourceId)),
    insufficiencyDeclared,
    legalTruthVerified: false,
    semanticClaimCoverageVerified: false,
  };
}
