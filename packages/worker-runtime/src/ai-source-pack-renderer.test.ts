import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AI_ASSIGNMENT_SOURCE_BINDING_OBJECT_TYPE,
  AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
  AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE,
  AI_SOURCE_PACK_OBJECT_TYPE,
  AI_SOURCE_PACK_PROTOCOL_VERSION,
  type AiAssignmentSourceBindingV1,
  type AiKnowledgeAssignmentV1,
  type AiSourcePackV1,
} from "@markorbit/contracts";
import {
  AiSourceGroundingError,
  renderAiGroundedProviderInputV1,
  type AiSourceSnapshotResolver,
  type ResolvedAiSourceSnapshotV1,
} from "./ai-source-pack-renderer";

const sourceOneText = "Section 8 official guidance.";
const sourceTwoText = "TMEP maintenance chapter.";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

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
  prompt: "Explain the Section 8 maintenance requirements.",
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
      canonicalUri: "https://www.uspto.gov/section-8",
      publisher: "USPTO",
      jurisdiction: "US",
      authority: "OFFICIAL_PRIMARY",
      role: "OFFICIAL_GUIDANCE",
      capturedAt: "2026-08-24T07:30:00.000Z",
      contentSha256: sha256(sourceOneText),
    },
    {
      sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      canonicalUri: "https://tmep.uspto.gov/current",
      publisher: "USPTO",
      jurisdiction: "US",
      authority: "OFFICIAL_SECONDARY",
      role: "OFFICIAL_MANUAL",
      capturedAt: "2026-08-24T07:35:00.000Z",
      contentSha256: sha256(sourceTwoText),
    },
  ],
  createdAt: "2026-08-24T08:00:00.000Z",
  changeReason: "Renderer test pack",
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

function resolvedSource(
  sourceId: string,
  artifactId: string,
  text: string,
  mediaType = "text/plain",
): ResolvedAiSourceSnapshotV1 {
  return {
    sourceId,
    artifactId,
    mediaType,
    bytes: new TextEncoder().encode(text),
  };
}

function resolver(
  overrides = new Map<string, ResolvedAiSourceSnapshotV1 | undefined>(),
): AiSourceSnapshotResolver {
  const defaults = new Map<string, ResolvedAiSourceSnapshotV1>([
    [
      sourcePack.sources[0].artifactId,
      resolvedSource(
        sourcePack.sources[0].sourceId,
        sourcePack.sources[0].artifactId,
        sourceOneText,
      ),
    ],
    [
      sourcePack.sources[1].artifactId,
      resolvedSource(
        sourcePack.sources[1].sourceId,
        sourcePack.sources[1].artifactId,
        sourceTwoText,
        "text/markdown",
      ),
    ],
  ]);
  return {
    resolve: async (source) =>
      overrides.has(source.artifactId)
        ? overrides.get(source.artifactId)
        : defaults.get(source.artifactId),
  };
}

async function expectGroundingError(
  promise: Promise<unknown>,
  code: string,
): Promise<AiSourceGroundingError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AiSourceGroundingError);
    expect((error as AiSourceGroundingError).code).toBe(code);
    return error as AiSourceGroundingError;
  }
  throw new Error(`Expected ${code}`);
}

describe("ADK-11 source-pack renderer", () => {
  it("renders deterministic provider input with source identities and citation policy", async () => {
    const first = await renderAiGroundedProviderInputV1({
      assignment,
      binding,
      sourcePack,
      resolver: resolver(),
    });
    const second = await renderAiGroundedProviderInputV1({
      assignment,
      binding,
      sourcePack,
      resolver: resolver(),
    });

    expect(second).toEqual(first);
    expect(first.sources).toHaveLength(2);
    expect(first.renderedPromptSha256).toBe(sha256(first.renderedPrompt));
    expect(first.renderedPrompt).toContain("[source:SOURCE_ID]");
    expect(first.renderedPrompt).toContain(`--- SOURCE ${sourcePack.sources[0].sourceId} ---`);
    expect(first.renderedPrompt).toContain(sourceOneText);
    expect(first.renderedPrompt).toContain(sourceTwoText);
    expect(first.legalTruthVerified).toBe(false);
    expect(first.executionAuthorityGranted).toBe(false);
  });

  it("fails closed when a bound artifact is missing or resolves to another identity", async () => {
    const missing = new Map<string, ResolvedAiSourceSnapshotV1 | undefined>([
      [sourcePack.sources[0].artifactId, undefined],
    ]);
    await expectGroundingError(
      renderAiGroundedProviderInputV1({
        assignment,
        binding,
        sourcePack,
        resolver: resolver(missing),
      }),
      "AI_SOURCE_ARTIFACT_MISSING",
    );

    const mismatch = new Map<string, ResolvedAiSourceSnapshotV1 | undefined>([
      [
        sourcePack.sources[0].artifactId,
        resolvedSource(
          sourcePack.sources[0].sourceId,
          sourcePack.sources[1].artifactId,
          sourceOneText,
        ),
      ],
    ]);
    await expectGroundingError(
      renderAiGroundedProviderInputV1({
        assignment,
        binding,
        sourcePack,
        resolver: resolver(mismatch),
      }),
      "AI_SOURCE_IDENTITY_MISMATCH",
    );
  });

  it("fails closed on digest mismatch, unsupported media or invalid UTF-8", async () => {
    const digestMismatch = new Map<string, ResolvedAiSourceSnapshotV1 | undefined>([
      [
        sourcePack.sources[0].artifactId,
        resolvedSource(
          sourcePack.sources[0].sourceId,
          sourcePack.sources[0].artifactId,
          "tampered",
        ),
      ],
    ]);
    await expectGroundingError(
      renderAiGroundedProviderInputV1({
        assignment,
        binding,
        sourcePack,
        resolver: resolver(digestMismatch),
      }),
      "AI_SOURCE_DIGEST_MISMATCH",
    );

    const unsupported = new Map<string, ResolvedAiSourceSnapshotV1 | undefined>([
      [
        sourcePack.sources[0].artifactId,
        resolvedSource(
          sourcePack.sources[0].sourceId,
          sourcePack.sources[0].artifactId,
          sourceOneText,
          "application/pdf",
        ),
      ],
    ]);
    await expectGroundingError(
      renderAiGroundedProviderInputV1({
        assignment,
        binding,
        sourcePack,
        resolver: resolver(unsupported),
      }),
      "AI_SOURCE_MEDIA_TYPE_UNSUPPORTED",
    );

    const invalidUtf8 = new Map<string, ResolvedAiSourceSnapshotV1 | undefined>([
      [
        sourcePack.sources[0].artifactId,
        {
          sourceId: sourcePack.sources[0].sourceId,
          artifactId: sourcePack.sources[0].artifactId,
          mediaType: "text/plain",
          bytes: new Uint8Array([0xff]),
        },
      ],
    ]);
    const invalidUtf8Pack: AiSourcePackV1 = {
      ...sourcePack,
      sources: [
        { ...sourcePack.sources[0], contentSha256: sha256(new Uint8Array([0xff])) },
        sourcePack.sources[1],
      ],
    };
    await expectGroundingError(
      renderAiGroundedProviderInputV1({
        assignment,
        binding,
        sourcePack: invalidUtf8Pack,
        resolver: resolver(invalidUtf8),
      }),
      "AI_SOURCE_UTF8_INVALID",
    );
  });

  it("enforces per-source, total-pack and binding bounds before provider integration", async () => {
    await expectGroundingError(
      renderAiGroundedProviderInputV1({
        assignment,
        binding,
        sourcePack,
        resolver: resolver(),
        options: { maxSourceBytes: 10 },
      }),
      "AI_SOURCE_TOO_LARGE",
    );
    await expectGroundingError(
      renderAiGroundedProviderInputV1({
        assignment,
        binding,
        sourcePack,
        resolver: resolver(),
        options: { maxTotalSourceBytes: 40 },
      }),
      "AI_SOURCE_PACK_TOO_LARGE",
    );
    await expectGroundingError(
      renderAiGroundedProviderInputV1({
        assignment,
        binding: { ...binding, sourcePackRevision: 2 },
        sourcePack,
        resolver: resolver(),
      }),
      "AI_SOURCE_BINDING_INVALID",
    );
  });
});
