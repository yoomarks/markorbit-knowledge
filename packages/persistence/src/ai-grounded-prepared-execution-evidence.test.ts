import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type {
  AiAssignmentSourceBindingV1,
  AiGroundedExecutionEnvelopeV1,
  AiInstructionSetV1,
  AiKnowledgeAssignmentV1,
  AiSourcePackV1,
  RawArtifact,
} from "@markorbit/contracts";
import { SqliteAiKnowledgeAssignmentRepository } from "./ai-knowledge-assignment-registry";
import { SqliteAiSourcePackRepository } from "./ai-source-pack-registry";
import {
  groundedPromptCanonicalUri,
  groundedPromptSourceUri,
} from "./ai-grounded-prepared-execution-ingestion";
import { SqliteAiGroundedPreparedExecutionEvidenceRepository } from "./ai-grounded-prepared-execution-evidence";

const SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SOURCE_ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const PROMPT_SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const PROMPT_ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const WORKSPACE_ID = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SOURCE_URI = "https://www.uspto.gov/trademarks/maintain/keeping-your-registration-alive";
const SOURCE_TEXT = "Official USPTO Section 8 maintenance guidance.";
const PROMPT_TEXT = "# Governed prompt\n\nUse only the frozen official source evidence.";
const SOURCE_SHA = sha256(SOURCE_TEXT);
const PROMPT_SHA = sha256(PROMPT_TEXT);

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const instructionSet: AiInstructionSetV1 = {
  protocolVersion: "1.0",
  objectType: "AI_INSTRUCTION_SET",
  instructionSetId: "kis_us_trademark_research_core",
  revision: 1,
  name: "US trademark official-source research",
  purpose: "Research trademark procedure from governed official evidence.",
  stableInstructions: ["Use only supplied official source evidence."],
  requiredSections: ["Overview", "Sources"],
  outputFormat: "MARKDOWN",
  createdAt: "2026-08-24T10:10:00.000Z",
  changeReason: "Initial grounded research grammar",
  triggerEvidenceRefs: [],
};

const assignment: AiKnowledgeAssignmentV1 = {
  protocolVersion: "1.0",
  objectType: "AI_KNOWLEDGE_ASSIGNMENT",
  assignmentId: "kas_us_trademark_section_8",
  jurisdiction: "US",
  domain: "TRADEMARK",
  topic: "SECTION_8",
  title: "Section 8 maintenance research",
  instructionSetId: instructionSet.instructionSetId,
  instructionSetRevision: 1,
  language: "en",
  prompt: "Research Section 8 maintenance from the governed source pack.",
  createdAt: "2026-08-24T10:11:00.000Z",
};

const sourcePack: AiSourcePackV1 = {
  protocolVersion: "1.0",
  objectType: "AI_SOURCE_PACK",
  sourcePackId: "asp_us_trademark_section_8_official",
  revision: 1,
  jurisdiction: "US",
  domain: "TRADEMARK",
  topic: "SECTION_8",
  name: "US Section 8 official source pack",
  sourcePolicy: "OFFICIAL_ONLY",
  sources: [
    {
      sourceId: SOURCE_ID,
      artifactId: SOURCE_ARTIFACT_ID,
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
  changeReason: "Freeze official evidence",
  legalTruthVerified: false,
};

const binding: AiAssignmentSourceBindingV1 = {
  protocolVersion: "1.0",
  objectType: "AI_ASSIGNMENT_SOURCE_BINDING",
  bindingId: "asb_us_trademark_section_8_official",
  assignmentId: assignment.assignmentId,
  instructionSetId: instructionSet.instructionSetId,
  instructionSetRevision: 1,
  sourcePackId: sourcePack.sourcePackId,
  sourcePackRevision: 1,
  groundingPolicy: "STRICT_OFFICIAL_SOURCE_PACK",
  requireCitations: true,
  allowExternalSources: false,
  allowUncitedFactualClaims: false,
  legalTruthVerified: false,
  executionAuthorityGranted: false,
  createdAt: "2026-08-24T10:13:00.000Z",
};

function envelope(preparedAt = "2026-08-24T10:15:00.000Z"): AiGroundedExecutionEnvelopeV1 {
  const sourceReceipts = [
    {
      sourceId: SOURCE_ID,
      artifactId: SOURCE_ARTIFACT_ID,
      canonicalUri: SOURCE_URI,
      mediaType: "text/html",
      contentSha256: SOURCE_SHA,
      sizeBytes: Buffer.byteLength(SOURCE_TEXT),
    },
  ];
  const sourceReceiptsSha256 = sha256(JSON.stringify(sourceReceipts));
  const executionInputSha256 = sha256(
    JSON.stringify({
      assignmentId: assignment.assignmentId,
      bindingId: binding.bindingId,
      sourcePackId: sourcePack.sourcePackId,
      sourcePackRevision: sourcePack.revision,
      rendererVersion: "1.0.0",
      renderedPromptSha256: PROMPT_SHA,
      sourceReceiptsSha256,
    }),
  );
  return {
    protocolVersion: "1.0",
    objectType: "AI_GROUNDED_EXECUTION_ENVELOPE",
    status: "PREPARED",
    assignmentId: assignment.assignmentId,
    bindingId: binding.bindingId,
    sourcePackId: sourcePack.sourcePackId,
    sourcePackRevision: sourcePack.revision,
    rendererVersion: "1.0.0",
    renderedPromptSha256: PROMPT_SHA,
    sourceReceiptsSha256,
    executionInputSha256,
    sourceReceipts,
    preparedAt,
    providerCallAuthorized: false,
    providerCallExecuted: false,
    externalBrowsingAllowed: false,
    legalTruthVerified: false,
    executionAuthorityGranted: false,
  };
}

function sourceArtifact(): RawArtifact {
  return {
    schemaVersion: "1.0",
    objectType: "RAW_ARTIFACT",
    id: SOURCE_ARTIFACT_ID,
    workspaceId: WORKSPACE_ID,
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

function promptArtifact(inputEnvelope: AiGroundedExecutionEnvelopeV1 = envelope()): RawArtifact {
  return {
    schemaVersion: "1.0",
    objectType: "RAW_ARTIFACT",
    id: PROMPT_ARTIFACT_ID,
    workspaceId: WORKSPACE_ID,
    sourceId: PROMPT_SOURCE_ID,
    version: 1,
    artifactKind: "MARKDOWN",
    mimeType: "text/markdown",
    originalName: `${inputEnvelope.executionInputSha256}.grounded-prompt.md`,
    canonicalUri: groundedPromptCanonicalUri(inputEnvelope.executionInputSha256),
    storage: { provider: "LOCAL", uri: `artifact+local://sha256/${PROMPT_SHA}` },
    binaryHash: { algorithm: "SHA-256", value: PROMPT_SHA },
    contentHash: { algorithm: "SHA-256", value: PROMPT_SHA },
    sizeBytes: Buffer.byteLength(PROMPT_TEXT),
    capturedAt: "2026-08-24T10:16:00.000Z",
    collector: { connectorId: "crawl4ai-web", connectorVersion: "1.0.0" },
    provenance: { sourceUri: groundedPromptSourceUri(inputEnvelope.executionInputSha256) },
    status: "REGISTERED",
    createdAt: "2026-08-24T10:16:00.000Z",
  };
}

function insertRawArtifact(database: DatabaseSync, artifact: RawArtifact): void {
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
}

function seed(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE raw_artifacts (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      content_digest TEXT NOT NULL,
      canonical_uri TEXT,
      document_json TEXT NOT NULL
    ) STRICT;
  `);
  insertRawArtifact(database, sourceArtifact());
  insertRawArtifact(database, promptArtifact());

  const assignments = new SqliteAiKnowledgeAssignmentRepository(database);
  assignments.saveInstructionSet(instructionSet);
  assignments.saveAssignment(assignment);
  const sourcePacks = new SqliteAiSourcePackRepository(database);
  sourcePacks.saveSourcePack(sourcePack);
  sourcePacks.saveBinding(binding);
  return database;
}

describe("SqliteAiGroundedPreparedExecutionEvidenceRepository", () => {
  it("persists governed PREPARED evidence and survives repository restart", () => {
    const database = seed();
    const first = new SqliteAiGroundedPreparedExecutionEvidenceRepository(database);
    const saved = first.save({
      envelope: envelope(),
      promptArtifactId: PROMPT_ARTIFACT_ID,
      persistedAt: "2026-08-24T10:17:00.000Z",
    });

    expect(saved.replayed).toBe(false);
    expect(saved.evidence.promptArtifact.artifactId).toBe(PROMPT_ARTIFACT_ID);
    expect(saved.evidence.providerCallExecuted).toBe(false);

    const restarted = new SqliteAiGroundedPreparedExecutionEvidenceRepository(database);
    expect(restarted.get(saved.evidence.executionInputSha256)).toEqual(saved.evidence);
    expect(restarted.listByBinding(binding.bindingId)).toEqual([saved.evidence]);
    database.close();
  });

  it("replays the first canonical evidence across a later preparation timestamp", () => {
    const database = seed();
    const repository = new SqliteAiGroundedPreparedExecutionEvidenceRepository(database);
    const first = repository.save({
      envelope: envelope("2026-08-24T10:15:00.000Z"),
      promptArtifactId: PROMPT_ARTIFACT_ID,
      persistedAt: "2026-08-24T10:17:00.000Z",
    });
    const replay = new SqliteAiGroundedPreparedExecutionEvidenceRepository(database).save({
      envelope: envelope("2026-08-24T11:15:00.000Z"),
      promptArtifactId: PROMPT_ARTIFACT_ID,
      persistedAt: "2026-08-24T11:17:00.000Z",
    });

    expect(replay.replayed).toBe(true);
    expect(replay.evidence).toEqual(first.evidence);
    expect(replay.evidence.canonicalPreparedAt).toBe("2026-08-24T10:15:00.000Z");
    database.close();
  });

  it("fails closed when source receipt or execution-input hashes are forged", () => {
    const database = seed();
    const repository = new SqliteAiGroundedPreparedExecutionEvidenceRepository(database);
    const valid = envelope();

    expect(() =>
      repository.save({
        envelope: { ...valid, sourceReceiptsSha256: "f".repeat(64) },
        promptArtifactId: PROMPT_ARTIFACT_ID,
      }),
    ).toThrow(/source receipts do not match/u);
    expect(() =>
      repository.save({
        envelope: { ...valid, executionInputSha256: "e".repeat(64) },
        promptArtifactId: PROMPT_ARTIFACT_ID,
      }),
    ).toThrow(/execution input does not match/u);
    database.close();
  });

  it("fails closed when a source or prompt RawArtifact drifts from the frozen evidence", () => {
    const sourceDatabase = seed();
    sourceDatabase
      .prepare("UPDATE raw_artifacts SET content_digest = ? WHERE id = ?")
      .run("f".repeat(64), SOURCE_ARTIFACT_ID);
    expect(() =>
      new SqliteAiGroundedPreparedExecutionEvidenceRepository(sourceDatabase).save({
        envelope: envelope(),
        promptArtifactId: PROMPT_ARTIFACT_ID,
      }),
    ).toThrow(/registry row is inconsistent/u);
    sourceDatabase.close();

    const promptDatabase = seed();
    const driftedPrompt = {
      ...promptArtifact(),
      contentHash: { algorithm: "SHA-256" as const, value: "e".repeat(64) },
    };
    promptDatabase
      .prepare("UPDATE raw_artifacts SET document_json = ? WHERE id = ?")
      .run(JSON.stringify(driftedPrompt), PROMPT_ARTIFACT_ID);
    expect(() =>
      new SqliteAiGroundedPreparedExecutionEvidenceRepository(promptDatabase).save({
        envelope: envelope(),
        promptArtifactId: PROMPT_ARTIFACT_ID,
      }),
    ).toThrow(/prompt RawArtifact does not match/u);
    promptDatabase.close();
  });
});
