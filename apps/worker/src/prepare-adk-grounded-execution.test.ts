import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  AI_ASSIGNMENT_SOURCE_BINDING_OBJECT_TYPE,
  AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE,
  AI_SOURCE_PACK_OBJECT_TYPE,
  isAiGroundedExecutionEnvelopeV1,
  type AiAssignmentSourceBindingV1,
  type AiInstructionSetV1,
  type AiKnowledgeAssignmentV1,
  type AiSourcePackV1,
  type RawArtifact,
} from "@markorbit/contracts";
import { SqliteAiKnowledgeAssignmentRepository } from "@markorbit/persistence/ai-knowledge-assignments";
import { SqliteAiSourcePackRepository } from "@markorbit/persistence/ai-source-packs";
import { preparePersistedAiGroundedExecutionV1 } from "./prepare-adk-grounded-execution";

const SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SOURCE_URI = "https://www.uspto.gov/trademarks/maintain/keeping-your-registration-alive";
const SOURCE_TEXT = "Official USPTO Section 8 maintenance guidance.";
const SOURCE_SHA = sha256(SOURCE_TEXT);

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const instructionSet: AiInstructionSetV1 = {
  protocolVersion: "1.0",
  objectType: "AI_INSTRUCTION_SET",
  instructionSetId: "kis_us_trademark_research_core",
  revision: 1,
  name: "US trademark official-source research",
  purpose: "Research trademark procedure from governed source packs.",
  stableInstructions: ["Use only supplied official source evidence."],
  requiredSections: ["Overview", "Sources"],
  outputFormat: "MARKDOWN",
  createdAt: "2026-08-24T10:10:00.000Z",
  changeReason: "Initial grounded dry-run instruction set",
  triggerEvidenceRefs: [],
};

const assignment: AiKnowledgeAssignmentV1 = {
  protocolVersion: "1.0",
  objectType: AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE,
  assignmentId: "kas_us_trademark_section_8",
  jurisdiction: "US",
  domain: "TRADEMARK",
  topic: "SECTION_8",
  title: "Section 8 maintenance research",
  instructionSetId: instructionSet.instructionSetId,
  instructionSetRevision: instructionSet.revision,
  language: "en",
  prompt: "Research Section 8 requirements from the governed source pack.",
  createdAt: "2026-08-24T10:11:00.000Z",
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
      canonicalUri: SOURCE_URI,
      publisher: "USPTO",
      jurisdiction: "US",
      authority: "OFFICIAL_PRIMARY",
      role: "OFFICIAL_GUIDANCE",
      capturedAt: "2026-08-24T10:05:00.000Z",
      contentSha256: SOURCE_SHA,
    },
  ],
  createdAt: "2026-08-24T10:12:00.000Z",
  changeReason: "Freeze official dry-run evidence",
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
  createdAt: "2026-08-24T10:13:00.000Z",
};

function sourceArtifact(): RawArtifact {
  return {
    schemaVersion: "1.0",
    objectType: "RAW_ARTIFACT",
    id: ARTIFACT_ID,
    workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    sourceId: SOURCE_ID,
    version: 1,
    artifactKind: "HTML",
    mimeType: "text/html",
    originalName: "section-8.html",
    canonicalUri: SOURCE_URI,
    storage: { provider: "LOCAL", uri: `artifact+local://sha256/${SOURCE_SHA}` },
    binaryHash: { algorithm: "SHA-256", value: SOURCE_SHA },
    contentHash: { algorithm: "SHA-256", value: SOURCE_SHA },
    sizeBytes: Buffer.byteLength(SOURCE_TEXT),
    capturedAt: sourcePack.sources[0].capturedAt,
    collector: { connectorId: "crawl4ai-web", connectorVersion: "1.0.0" },
    provenance: { sourceUri: SOURCE_URI },
    status: "REGISTERED",
    createdAt: sourcePack.sources[0].capturedAt,
  };
}

function seed(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS raw_artifacts (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      content_digest TEXT NOT NULL,
      canonical_uri TEXT,
      document_json TEXT NOT NULL
    ) STRICT;
  `);
  const artifact = sourceArtifact();
  database
    .prepare(
      `INSERT INTO raw_artifacts(id, source_id, content_digest, canonical_uri, document_json)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      artifact.id,
      artifact.sourceId,
      artifact.binaryHash.value,
      artifact.canonicalUri ?? null,
      JSON.stringify(artifact),
    );
  const assignments = new SqliteAiKnowledgeAssignmentRepository(database);
  assignments.saveInstructionSet(instructionSet);
  assignments.saveAssignment(assignment);
  const sourcePacks = new SqliteAiSourcePackRepository(database);
  sourcePacks.saveSourcePack(sourcePack);
  sourcePacks.saveBinding(binding);
}

describe("preparePersistedAiGroundedExecutionV1", () => {
  it("resolves persisted governed identities and prepares without a provider call", async () => {
    const database = new DatabaseSync(":memory:");
    seed(database);

    const prepared = await preparePersistedAiGroundedExecutionV1({
      database,
      bindingId: binding.bindingId,
      resolver: {
        resolve: async (source) => ({
          sourceId: source.sourceId,
          artifactId: source.artifactId,
          mediaType: "text/html",
          bytes: new TextEncoder().encode(SOURCE_TEXT),
        }),
      },
      preparedAt: "2026-08-24T10:15:00.000Z",
    });

    expect(isAiGroundedExecutionEnvelopeV1(prepared.envelope)).toBe(true);
    expect(prepared.envelope.assignmentId).toBe(assignment.assignmentId);
    expect(prepared.envelope.bindingId).toBe(binding.bindingId);
    expect(prepared.envelope.sourcePackId).toBe(sourcePack.sourcePackId);
    expect(prepared.envelope.providerCallAuthorized).toBe(false);
    expect(prepared.envelope.providerCallExecuted).toBe(false);
    expect(prepared.providerInput.renderedPrompt).toContain(SOURCE_TEXT);
    database.close();
  });

  it("fails closed when the persisted binding is missing", async () => {
    const database = new DatabaseSync(":memory:");
    seed(database);

    await expect(
      preparePersistedAiGroundedExecutionV1({
        database,
        bindingId: "asb_us_trademark_missing_official",
        resolver: { resolve: async () => undefined },
      }),
    ).rejects.toMatchObject({
      code: "AI_GROUNDED_BINDING_NOT_FOUND",
    });
    database.close();
  });

  it("fails closed when resolved source bytes drift from the persisted SourcePack digest", async () => {
    const database = new DatabaseSync(":memory:");
    seed(database);

    await expect(
      preparePersistedAiGroundedExecutionV1({
        database,
        bindingId: binding.bindingId,
        resolver: {
          resolve: async (source) => ({
            sourceId: source.sourceId,
            artifactId: source.artifactId,
            mediaType: "text/html",
            bytes: new TextEncoder().encode("tampered source bytes"),
          }),
        },
      }),
    ).rejects.toMatchObject({
      code: "AI_SOURCE_DIGEST_MISMATCH",
    });
    database.close();
  });
});
