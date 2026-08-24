import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  AI_ASSIGNMENT_SOURCE_BINDING_OBJECT_TYPE,
  AI_GROUNDED_OUTPUT_VALIDATION_RECEIPT_OBJECT_TYPE,
  AI_GROUNDED_VALIDATION_PROTOCOL_VERSION,
  AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE,
  AI_RESEARCH_SUBMISSION_OBJECT_TYPE,
  AI_SOURCE_PACK_OBJECT_TYPE,
  type AiAssignmentSourceBindingV1,
  type AiGroundedOutputValidationReceiptV1,
  type AiInstructionSetV1,
  type AiKnowledgeAssignmentV1,
  type AiResearchSubmissionV1,
  type AiSourcePackV1,
  type RawArtifact,
} from "@markorbit/contracts";
import { SqliteAiGroundedValidationEvidenceRepository } from "./ai-grounded-validation-evidence";
import { SqliteAiKnowledgeAssignmentRepository } from "./ai-knowledge-assignment-registry";
import { SqliteAiSourcePackRepository } from "./ai-source-pack-registry";

const OFFICIAL_SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const AI_SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const OFFICIAL_ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const RAW_PROVIDER_ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const MARKDOWN_ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAX";
const OFFICIAL_URI = "https://www.uspto.gov/trademarks/maintain/keeping-your-registration-alive";
const OFFICIAL_CONTENT = "Official Section 8 maintenance guidance.";
const OFFICIAL_SHA = sha256(OFFICIAL_CONTENT);
const RAW_PROVIDER_RESPONSE = '{"id":"resp_123","output_text":"grounded"}';
const RAW_PROVIDER_SHA = sha256(RAW_PROVIDER_RESPONSE);
const MARKDOWN = `The registration maintenance rule is stated by USPTO. [source:${OFFICIAL_SOURCE_ID}]`;
const MARKDOWN_SHA = sha256(MARKDOWN);
const PROMPT_SHA = "a".repeat(64);
const COMPLETED_AT = "2026-08-24T09:30:00.000Z";

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
  createdAt: "2026-08-24T09:00:00.000Z",
  changeReason: "Initial source-grounded instruction set",
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
  prompt: "Research Section 8 maintenance requirements from the governed source pack.",
  createdAt: "2026-08-24T09:01:00.000Z",
};

const sourcePack: AiSourcePackV1 = {
  protocolVersion: "1.0",
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
      sourceId: OFFICIAL_SOURCE_ID,
      artifactId: OFFICIAL_ARTIFACT_ID,
      canonicalUri: OFFICIAL_URI,
      publisher: "USPTO",
      jurisdiction: "US",
      authority: "OFFICIAL_PRIMARY",
      role: "OFFICIAL_GUIDANCE",
      capturedAt: "2026-08-24T08:55:00.000Z",
      contentSha256: OFFICIAL_SHA,
    },
  ],
  createdAt: "2026-08-24T09:02:00.000Z",
  changeReason: "Freeze official Section 8 evidence",
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
  createdAt: "2026-08-24T09:03:00.000Z",
};

const submission: AiResearchSubmissionV1 = {
  protocolVersion: "1.0",
  objectType: AI_RESEARCH_SUBMISSION_OBJECT_TYPE,
  submissionId: "ars_us_trademark_section8_openai_001",
  assignmentId: assignment.assignmentId,
  provider: "OPENAI",
  model: "gpt-5.6-luna",
  requestedAt: "2026-08-24T09:29:00.000Z",
  completedAt: COMPLETED_AT,
  promptSha256: PROMPT_SHA,
  rawResponseSha256: RAW_PROVIDER_SHA,
  markdownSha256: MARKDOWN_SHA,
  markdownSizeBytes: Buffer.byteLength(MARKDOWN),
  providerRequestId: "resp_123",
};

const receipt: AiGroundedOutputValidationReceiptV1 = {
  protocolVersion: AI_GROUNDED_VALIDATION_PROTOCOL_VERSION,
  objectType: AI_GROUNDED_OUTPUT_VALIDATION_RECEIPT_OBJECT_TYPE,
  status: "VALID_GROUNDED",
  assignmentId: assignment.assignmentId,
  bindingId: binding.bindingId,
  sourcePackId: sourcePack.sourcePackId,
  sourcePackRevision: sourcePack.revision,
  renderedPromptSha256: PROMPT_SHA,
  outputSha256: MARKDOWN_SHA,
  citationCount: 1,
  citedSourceIds: [OFFICIAL_SOURCE_ID],
  unreferencedSourceIds: [],
  insufficiencyDeclared: false,
  legalTruthVerified: false,
  semanticClaimCoverageVerified: false,
};

function officialArtifact(): RawArtifact {
  return {
    schemaVersion: "1.0",
    objectType: "RAW_ARTIFACT",
    id: OFFICIAL_ARTIFACT_ID,
    workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    sourceId: OFFICIAL_SOURCE_ID,
    version: 1,
    artifactKind: "HTML",
    mimeType: "text/html",
    originalName: "section-8.html",
    canonicalUri: OFFICIAL_URI,
    storage: { provider: "LOCAL", uri: `artifact+local://sha256/${OFFICIAL_SHA}` },
    binaryHash: { algorithm: "SHA-256", value: OFFICIAL_SHA },
    contentHash: { algorithm: "SHA-256", value: OFFICIAL_SHA },
    sizeBytes: Buffer.byteLength(OFFICIAL_CONTENT),
    capturedAt: sourcePack.sources[0].capturedAt,
    collector: { connectorId: "crawl4ai-web", connectorVersion: "1.0.0" },
    provenance: { sourceUri: OFFICIAL_URI },
    status: "REGISTERED",
    createdAt: sourcePack.sources[0].capturedAt,
  };
}

function aiArtifact(kind: "raw" | "markdown", parentArtifactId = RAW_PROVIDER_ARTIFACT_ID): RawArtifact {
  const provider = submission.provider.toLowerCase();
  const canonicalUri = `ai+markorbit://${provider}/assignments/${submission.assignmentId}/models/${encodeURIComponent(submission.model.toLowerCase())}`;
  const raw = kind === "raw";
  const hash = raw ? RAW_PROVIDER_SHA : MARKDOWN_SHA;
  return {
    schemaVersion: "1.0",
    objectType: "RAW_ARTIFACT",
    id: raw ? RAW_PROVIDER_ARTIFACT_ID : MARKDOWN_ARTIFACT_ID,
    workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    sourceId: AI_SOURCE_ID,
    version: 1,
    artifactKind: raw ? "JSON" : "MARKDOWN",
    mimeType: raw ? "application/json" : "text/markdown",
    originalName: raw ? `${submission.submissionId}.provider-response.json` : `${submission.submissionId}.md`,
    canonicalUri,
    storage: { provider: "LOCAL", uri: `artifact+local://sha256/${hash}` },
    binaryHash: { algorithm: "SHA-256", value: hash },
    contentHash: { algorithm: "SHA-256", value: hash },
    sizeBytes: Buffer.byteLength(raw ? RAW_PROVIDER_RESPONSE : MARKDOWN),
    capturedAt: COMPLETED_AT,
    publishedAt: COMPLETED_AT,
    collector: { connectorId: "ai-production-pilot", connectorVersion: "1.0.0" },
    provenance: {
      sourceUri: `ai+markorbit://${provider}/submissions/${submission.submissionId}/${raw ? "raw" : "markdown"}`,
      ...(raw ? {} : { parentArtifactIds: [parentArtifactId] }),
    },
    status: "REGISTERED",
    createdAt: COMPLETED_AT,
  };
}

function createRawArtifactTable(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS raw_artifacts (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      content_digest TEXT NOT NULL,
      canonical_uri TEXT,
      document_json TEXT NOT NULL
    ) STRICT;
  `);
}

function insertArtifact(database: DatabaseSync, value: RawArtifact): void {
  database
    .prepare(
      `INSERT INTO raw_artifacts(id, source_id, content_digest, canonical_uri, document_json)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      value.id,
      value.sourceId,
      value.binaryHash.value,
      value.canonicalUri ?? null,
      JSON.stringify(value),
    );
}

function seedGovernedContext(database: DatabaseSync): void {
  createRawArtifactTable(database);
  insertArtifact(database, officialArtifact());
  const assignments = new SqliteAiKnowledgeAssignmentRepository(database);
  assignments.saveInstructionSet(instructionSet);
  assignments.saveAssignment(assignment);
  const sourcePacks = new SqliteAiSourcePackRepository(database);
  sourcePacks.saveSourcePack(sourcePack);
  sourcePacks.saveBinding(binding);
  insertArtifact(database, aiArtifact("raw"));
  insertArtifact(database, aiArtifact("markdown"));
}

function evidence() {
  return {
    submission,
    receipt,
    rawProviderArtifactId: RAW_PROVIDER_ARTIFACT_ID,
    markdownArtifactId: MARKDOWN_ARTIFACT_ID,
  };
}

describe("SqliteAiGroundedValidationEvidenceRepository", () => {
  it("persists immutable validation evidence linked to the exact governed artifacts", () => {
    const database = new DatabaseSync(":memory:");
    seedGovernedContext(database);
    const first = new SqliteAiGroundedValidationEvidenceRepository(
      database,
      () => new Date("2026-08-24T09:31:00.000Z"),
    );

    expect(first.save(evidence())).toEqual(evidence());
    expect(first.save(evidence())).toEqual(evidence());

    const restarted = new SqliteAiGroundedValidationEvidenceRepository(database);
    expect(restarted.getBySubmission(submission.submissionId)).toEqual(evidence());
    expect(restarted.listByBinding(binding.bindingId)).toEqual([evidence()]);
    database.close();
  });

  it("rejects submission, prompt or output identity drift", () => {
    const database = new DatabaseSync(":memory:");
    seedGovernedContext(database);
    const repository = new SqliteAiGroundedValidationEvidenceRepository(database);

    expect(() =>
      repository.save({
        ...evidence(),
        submission: { ...submission, promptSha256: "b".repeat(64) },
      }),
    ).toThrowError(/identities do not match/u);
    expect(() =>
      repository.save({
        ...evidence(),
        receipt: { ...receipt, outputSha256: "c".repeat(64) },
      }),
    ).toThrowError(/identities do not match/u);
    database.close();
  });

  it("rejects validation receipts that do not cover the exact persisted SourcePack", () => {
    const database = new DatabaseSync(":memory:");
    seedGovernedContext(database);
    const repository = new SqliteAiGroundedValidationEvidenceRepository(database);
    const otherSource = "src_01ARZ3NDEKTSV4RRFFQ69G5FAY";

    expect(() =>
      repository.save({
        ...evidence(),
        receipt: {
          ...receipt,
          citedSourceIds: [otherSource],
        },
      }),
    ).toThrowError(/exact persisted SourcePack/u);
    database.close();
  });

  it("rejects RawArtifact digest, URI or parent-lineage drift", () => {
    const digestDatabase = new DatabaseSync(":memory:");
    createRawArtifactTable(digestDatabase);
    insertArtifact(digestDatabase, officialArtifact());
    const assignments = new SqliteAiKnowledgeAssignmentRepository(digestDatabase);
    assignments.saveInstructionSet(instructionSet);
    assignments.saveAssignment(assignment);
    const sourcePacks = new SqliteAiSourcePackRepository(digestDatabase);
    sourcePacks.saveSourcePack(sourcePack);
    sourcePacks.saveBinding(binding);
    insertArtifact(digestDatabase, { ...aiArtifact("raw"), contentHash: { algorithm: "SHA-256", value: "d".repeat(64) } });
    insertArtifact(digestDatabase, aiArtifact("markdown"));
    const digestRepository = new SqliteAiGroundedValidationEvidenceRepository(digestDatabase);
    expect(() => digestRepository.save(evidence())).toThrowError(/Raw provider artifact/u);
    digestDatabase.close();

    const lineageDatabase = new DatabaseSync(":memory:");
    createRawArtifactTable(lineageDatabase);
    insertArtifact(lineageDatabase, officialArtifact());
    const lineageAssignments = new SqliteAiKnowledgeAssignmentRepository(lineageDatabase);
    lineageAssignments.saveInstructionSet(instructionSet);
    lineageAssignments.saveAssignment(assignment);
    const lineagePacks = new SqliteAiSourcePackRepository(lineageDatabase);
    lineagePacks.saveSourcePack(sourcePack);
    lineagePacks.saveBinding(binding);
    insertArtifact(lineageDatabase, aiArtifact("raw"));
    insertArtifact(lineageDatabase, aiArtifact("markdown", OFFICIAL_ARTIFACT_ID));
    const lineageRepository = new SqliteAiGroundedValidationEvidenceRepository(lineageDatabase);
    expect(() => lineageRepository.save(evidence())).toThrowError(/Markdown artifact/u);
    lineageDatabase.close();
  });

  it("makes one submission evidence identity immutable", () => {
    const database = new DatabaseSync(":memory:");
    seedGovernedContext(database);
    const repository = new SqliteAiGroundedValidationEvidenceRepository(database);
    repository.save(evidence());

    expect(() =>
      repository.save({
        ...evidence(),
        receipt: {
          ...receipt,
          status: "VALID_INSUFFICIENT",
          insufficiencyDeclared: true,
        },
      }),
    ).toThrowError(/already exists with different content/u);
    database.close();
  });
});
