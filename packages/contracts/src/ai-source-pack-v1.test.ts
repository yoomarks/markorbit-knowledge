import { describe, expect, it } from "vitest";
import {
  AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
  AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE,
  type AiKnowledgeAssignmentV1,
} from "./ai-distilled-knowledge-v1";
import {
  AI_ASSIGNMENT_SOURCE_BINDING_OBJECT_TYPE,
  AI_SOURCE_PACK_OBJECT_TYPE,
  AI_SOURCE_PACK_PROTOCOL_VERSION,
  assertAiAssignmentSourceBindingContext,
  isAiAssignmentSourceBindingV1,
  isAiSourcePackV1,
  type AiAssignmentSourceBindingV1,
  type AiSourcePackV1,
} from "./ai-source-pack-v1";

const assignment: AiKnowledgeAssignmentV1 = {
  protocolVersion: AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
  objectType: AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE,
  assignmentId: "kas_us_trademark_section_8",
  jurisdiction: "US",
  domain: "TRADEMARK",
  topic: "SECTION_8",
  title: "Section 8 maintenance research",
  instructionSetId: "kis_us_trademark_research_core",
  instructionSetRevision: 1,
  language: "en",
  prompt: "Research Section 8 using current official sources.",
  createdAt: "2026-08-24T08:00:00.000Z",
};

const sourcePack: AiSourcePackV1 = {
  protocolVersion: AI_SOURCE_PACK_PROTOCOL_VERSION,
  objectType: AI_SOURCE_PACK_OBJECT_TYPE,
  sourcePackId: "asp_us_trademark_section_8_official",
  revision: 1,
  jurisdiction: "US",
  domain: "TRADEMARK",
  topic: "SECTION_8",
  name: "US Section 8 official source pack",
  sourcePolicy: "OFFICIAL_ONLY",
  sources: [
    {
      sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      canonicalUri: "https://www.uspto.gov/trademarks/maintain/keeping-your-registration-alive",
      publisher: "USPTO",
      jurisdiction: "US",
      authority: "OFFICIAL_PRIMARY",
      role: "OFFICIAL_GUIDANCE",
      capturedAt: "2026-08-24T07:30:00.000Z",
      contentSha256: "0".repeat(64),
    },
    {
      sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      canonicalUri: "https://tmep.uspto.gov/RDMS/TMEP/current",
      publisher: "USPTO",
      jurisdiction: "US",
      authority: "OFFICIAL_SECONDARY",
      role: "OFFICIAL_MANUAL",
      capturedAt: "2026-08-24T07:35:00.000Z",
      contentSha256: "1".repeat(64),
      publishedAt: "2026-08-01T00:00:00.000Z",
    },
  ],
  createdAt: "2026-08-24T08:00:00.000Z",
  changeReason: "Initial deterministic source-grounding contract fixture",
  legalTruthVerified: false,
};

const binding: AiAssignmentSourceBindingV1 = {
  protocolVersion: AI_SOURCE_PACK_PROTOCOL_VERSION,
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
  createdAt: "2026-08-24T08:05:00.000Z",
};

describe("AI source pack V1", () => {
  it("accepts an official-only pack of content-addressed RawArtifact snapshots", () => {
    expect(isAiSourcePackV1(sourcePack)).toBe(true);
  });

  it("rejects duplicate source or artifact identities and cross-jurisdiction snapshots", () => {
    expect(
      isAiSourcePackV1({
        ...sourcePack,
        sources: [sourcePack.sources[0], sourcePack.sources[0]],
      }),
    ).toBe(false);
    expect(
      isAiSourcePackV1({
        ...sourcePack,
        sources: [
          sourcePack.sources[0],
          { ...sourcePack.sources[1], jurisdiction: "CA" },
        ],
      }),
    ).toBe(false);
  });

  it("rejects mutable or non-content-addressed source evidence", () => {
    expect(
      isAiSourcePackV1({
        ...sourcePack,
        sources: [{ ...sourcePack.sources[0], contentSha256: "not-a-sha" }],
      }),
    ).toBe(false);
    expect(isAiSourcePackV1({ ...sourcePack, legalTruthVerified: true })).toBe(false);
  });
});

describe("AI assignment source binding V1", () => {
  it("locks strict citation and no-external-source boundaries", () => {
    expect(isAiAssignmentSourceBindingV1(binding)).toBe(true);
    expect(isAiAssignmentSourceBindingV1({ ...binding, allowExternalSources: true })).toBe(false);
    expect(isAiAssignmentSourceBindingV1({ ...binding, allowUncitedFactualClaims: true })).toBe(
      false,
    );
    expect(isAiAssignmentSourceBindingV1({ ...binding, executionAuthorityGranted: true })).toBe(
      false,
    );
  });

  it("validates assignment, instruction-set, source-pack and scope identities together", () => {
    expect(() => assertAiAssignmentSourceBindingContext(binding, assignment, sourcePack)).not.toThrow();
    expect(() =>
      assertAiAssignmentSourceBindingContext(
        { ...binding, sourcePackRevision: 2 },
        assignment,
        sourcePack,
      ),
    ).toThrow(/source-pack identity mismatch/u);
    expect(() =>
      assertAiAssignmentSourceBindingContext(
        binding,
        { ...assignment, jurisdiction: "CA" },
        sourcePack,
      ),
    ).toThrow(/scope does not match/u);
  });
});
