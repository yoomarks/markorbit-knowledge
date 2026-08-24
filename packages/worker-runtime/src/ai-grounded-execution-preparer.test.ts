import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AI_ASSIGNMENT_SOURCE_BINDING_OBJECT_TYPE,
  AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE,
  AI_SOURCE_PACK_OBJECT_TYPE,
  isAiGroundedExecutionEnvelopeV1,
  type AiAssignmentSourceBindingV1,
  type AiKnowledgeAssignmentV1,
  type AiSourcePackV1,
} from "@markorbit/contracts";
import {
  AI_GROUNDED_EXECUTION_RENDERER_VERSION,
  prepareAiGroundedExecutionV1,
} from "./ai-grounded-execution-preparer";
import { AiSourceGroundingError, type AiSourceSnapshotResolver } from "./ai-source-pack-renderer";

const SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SOURCE_TEXT = "Official USPTO Section 8 maintenance guidance.";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

const assignment: AiKnowledgeAssignmentV1 = {
  protocolVersion: "1.0",
  objectType: AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE,
  assignmentId: "kas_us_trademark_section_8",
  jurisdiction: "US",
  domain: "TRADEMARK",
  topic: "SECTION_8",
  title: "Section 8 maintenance research",
  instructionSetId: "kis_us_trademark_research_core",
  instructionSetRevision: 1,
  language: "en",
  prompt: "Research Section 8 maintenance requirements from the governed source pack.",
  createdAt: "2026-08-24T10:00:00.000Z",
};

const sourcePack: AiSourcePackV1 = {
  protocolVersion: "1.0",
  objectType: AI_SOURCE_PACK_OBJECT_TYPE,
  sourcePackId: "asp_us_trademark_section_8_official",
  revision: 1,
  jurisdiction: "US",
  domain: "TRADEMARK",
  topic: "SECTION_8",
  name: "US Section 8 official sources",
  sourcePolicy: "OFFICIAL_ONLY",
  sources: [
    {
      sourceId: SOURCE_ID,
      artifactId: ARTIFACT_ID,
      canonicalUri: "https://www.uspto.gov/trademarks/maintain/keeping-your-registration-alive",
      publisher: "USPTO",
      jurisdiction: "US",
      authority: "OFFICIAL_PRIMARY",
      role: "OFFICIAL_GUIDANCE",
      capturedAt: "2026-08-24T09:55:00.000Z",
      contentSha256: sha256(SOURCE_TEXT),
    },
  ],
  createdAt: "2026-08-24T10:01:00.000Z",
  changeReason: "Freeze official maintenance evidence",
  legalTruthVerified: false,
};

const binding: AiAssignmentSourceBindingV1 = {
  protocolVersion: "1.0",
  objectType: AI_ASSIGNMENT_SOURCE_BINDING_OBJECT_TYPE,
  bindingId: "asb_us_trademark_section_8_official",
  assignmentId: assignment.assignmentId,
  instructionSetId: assignment.instructionSetId,
  instructionSetRevision: assignment.instructionSetRevision,
  sourcePackId: sourcePack.sourcePackId,
  sourcePackRevision: sourcePack.revision,
  groundingPolicy: "STRICT_OFFICIAL_SOURCE_PACK",
  requireCitations: true,
  allowExternalSources: false,
  allowUncitedFactualClaims: false,
  legalTruthVerified: false,
  executionAuthorityGranted: false,
  createdAt: "2026-08-24T10:02:00.000Z",
};

function resolver(text = SOURCE_TEXT): AiSourceSnapshotResolver {
  return {
    resolve: async (source) => ({
      sourceId: source.sourceId,
      artifactId: source.artifactId,
      mediaType: "text/html",
      bytes: new TextEncoder().encode(text),
    }),
  };
}

describe("prepareAiGroundedExecutionV1", () => {
  it("prepares a deterministic no-provider execution envelope from the exact rendered input", async () => {
    const input = {
      assignment,
      binding,
      sourcePack,
      resolver: resolver(),
      preparedAt: "2026-08-24T10:05:00.000Z",
    };
    const first = await prepareAiGroundedExecutionV1(input);
    const second = await prepareAiGroundedExecutionV1(input);

    expect(second).toEqual(first);
    expect(isAiGroundedExecutionEnvelopeV1(first.envelope)).toBe(true);
    expect(first.envelope.rendererVersion).toBe(AI_GROUNDED_EXECUTION_RENDERER_VERSION);
    expect(first.envelope.renderedPromptSha256).toBe(first.providerInput.renderedPromptSha256);
    expect(first.envelope.sourceReceipts).toEqual(first.providerInput.sources);
    expect(first.envelope.providerCallAuthorized).toBe(false);
    expect(first.envelope.providerCallExecuted).toBe(false);
    expect(first.envelope.executionAuthorityGranted).toBe(false);
    expect(first.providerInput.renderedPrompt).toContain(SOURCE_TEXT);
  });

  it("changes execution identity when the governed rendered input identity changes", async () => {
    const first = await prepareAiGroundedExecutionV1({
      assignment,
      binding,
      sourcePack,
      resolver: resolver(),
      preparedAt: "2026-08-24T10:05:00.000Z",
    });
    const changedAssignment: AiKnowledgeAssignmentV1 = {
      ...assignment,
      assignmentId: "kas_us_trademark_section_8_detail",
      prompt: "Research Section 8 requirements and exceptions from the governed source pack.",
    };
    const changedBinding: AiAssignmentSourceBindingV1 = {
      ...binding,
      bindingId: "asb_us_trademark_section_8_detail_official",
      assignmentId: changedAssignment.assignmentId,
    };
    const second = await prepareAiGroundedExecutionV1({
      assignment: changedAssignment,
      binding: changedBinding,
      sourcePack,
      resolver: resolver(),
      preparedAt: "2026-08-24T10:05:00.000Z",
    });

    expect(second.envelope.executionInputSha256).not.toBe(first.envelope.executionInputSha256);
    expect(second.envelope.renderedPromptSha256).not.toBe(first.envelope.renderedPromptSha256);
  });

  it("fails closed before envelope preparation when a source snapshot digest drifts", async () => {
    await expect(
      prepareAiGroundedExecutionV1({
        assignment,
        binding,
        sourcePack,
        resolver: resolver("tampered official content"),
        preparedAt: "2026-08-24T10:05:00.000Z",
      }),
    ).rejects.toMatchObject<Partial<AiSourceGroundingError>>({
      code: "AI_SOURCE_DIGEST_MISMATCH",
    });
  });
});
