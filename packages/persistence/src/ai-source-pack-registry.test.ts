import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  AI_ASSIGNMENT_SOURCE_BINDING_OBJECT_TYPE,
  AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE,
  AI_SOURCE_PACK_OBJECT_TYPE,
  type AiAssignmentSourceBindingV1,
  type AiInstructionSetV1,
  type AiKnowledgeAssignmentV1,
  type AiSourcePackV1,
  type RawArtifact,
} from "@markorbit/contracts";
import { SqliteAiKnowledgeAssignmentRepository } from "./ai-knowledge-assignment-registry";
import { SqliteAiSourcePackRepository } from "./ai-source-pack-registry";

const SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const OTHER_SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const CANONICAL_URI = "https://www.uspto.gov/trademarks/maintain/keeping-your-registration-alive";
const CAPTURED_AT = "2026-08-24T07:30:00.000Z";
const PUBLISHED_AT = "2026-08-01T00:00:00.000Z";
const CONTENT = "Official Section 8 maintenance guidance.";
const CONTENT_SHA256 = createHash("sha256").update(CONTENT).digest("hex");

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
  createdAt: "2026-08-24T07:00:00.000Z",
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
  createdAt: "2026-08-24T07:05:00.000Z",
};

function artifact(sourceId = SOURCE_ID): RawArtifact {
  return {
    schemaVersion: "1.0",
    objectType: "RAW_ARTIFACT",
    id: ARTIFACT_ID,
    workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    sourceId,
    version: 1,
    artifactKind: "HTML",
    mimeType: "text/html",
    originalName: "section-8.html",
    canonicalUri: CANONICAL_URI,
    storage: {
      provider: "LOCAL",
      uri: `artifact+local://sha256/${CONTENT_SHA256}`,
    },
    binaryHash: { algorithm: "SHA-256", value: CONTENT_SHA256 },
    contentHash: { algorithm: "SHA-256", value: CONTENT_SHA256 },
    sizeBytes: Buffer.byteLength(CONTENT),
    capturedAt: CAPTURED_AT,
    publishedAt: PUBLISHED_AT,
    collector: {
      connectorId: "crawl4ai-web",
      connectorVersion: "1.0.0",
    },
    provenance: { sourceUri: CANONICAL_URI },
    status: "REGISTERED",
    createdAt: CAPTURED_AT,
  };
}

function sourcePack(revision = 1): AiSourcePackV1 {
  return {
    protocolVersion: "1.0",
    objectType: AI_SOURCE_PACK_OBJECT_TYPE,
    sourcePackId: "asp_us_trademark_section_8_official",
    revision,
    jurisdiction: "US",
    domain: "TRADEMARK",
    topic: "SECTION_8",
    name: "US Section 8 official source pack",
    sourcePolicy: "OFFICIAL_ONLY",
    sources: [
      {
        sourceId: SOURCE_ID,
        artifactId: ARTIFACT_ID,
        canonicalUri: CANONICAL_URI,
        publisher: "USPTO",
        jurisdiction: "US",
        authority: "OFFICIAL_PRIMARY",
        role: "OFFICIAL_GUIDANCE",
        capturedAt: CAPTURED_AT,
        contentSha256: CONTENT_SHA256,
        publishedAt: PUBLISHED_AT,
      },
    ],
    createdAt: revision === 1 ? "2026-08-24T07:40:00.000Z" : "2026-08-24T08:40:00.000Z",
    changeReason: revision === 1 ? "Initial official evidence freeze" : "Refresh governed evidence",
    legalTruthVerified: false,
  };
}

function binding(): AiAssignmentSourceBindingV1 {
  return {
    protocolVersion: "1.0",
    objectType: AI_ASSIGNMENT_SOURCE_BINDING_OBJECT_TYPE,
    bindingId: "asb_us_trademark_section_8_official",
    assignmentId: assignment.assignmentId,
    instructionSetId: assignment.instructionSetId,
    instructionSetRevision: assignment.instructionSetRevision,
    sourcePackId: sourcePack().sourcePackId,
    sourcePackRevision: 1,
    groundingPolicy: "STRICT_OFFICIAL_SOURCE_PACK",
    requireCitations: true,
    allowExternalSources: false,
    allowUncitedFactualClaims: false,
    legalTruthVerified: false,
    executionAuthorityGranted: false,
    createdAt: "2026-08-24T07:45:00.000Z",
  };
}

function seedRawArtifact(database: DatabaseSync, value = artifact()): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS raw_artifacts (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      content_digest TEXT NOT NULL,
      canonical_uri TEXT,
      document_json TEXT NOT NULL
    ) STRICT;
  `);
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

function seedAssignment(database: DatabaseSync): void {
  const assignments = new SqliteAiKnowledgeAssignmentRepository(database);
  assignments.saveInstructionSet(instructionSet);
  assignments.saveAssignment(assignment);
}

describe("SqliteAiSourcePackRepository", () => {
  it("persists immutable source packs and bindings across repository restart", () => {
    const database = new DatabaseSync(":memory:");
    seedRawArtifact(database);
    seedAssignment(database);

    const repository = new SqliteAiSourcePackRepository(database);
    repository.saveSourcePack(sourcePack());
    repository.saveBinding(binding());

    const restarted = new SqliteAiSourcePackRepository(database);
    expect(restarted.getSourcePack(sourcePack().sourcePackId, 1)).toEqual(sourcePack());
    expect(restarted.getBinding(binding().bindingId)).toEqual(binding());
    expect(
      restarted.listLatestSourcePacksByScope({
        jurisdiction: "US",
        domain: "TRADEMARK",
        topic: "SECTION_8",
      }),
    ).toEqual([sourcePack()]);
    expect(restarted.listBindingsByAssignment(assignment.assignmentId)).toEqual([binding()]);
    database.close();
  });

  it("allows sequential source-pack evolution without mutating historical revisions", () => {
    const database = new DatabaseSync(":memory:");
    seedRawArtifact(database);
    const repository = new SqliteAiSourcePackRepository(database);
    repository.saveSourcePack(sourcePack(1));
    repository.saveSourcePack(sourcePack(2));

    expect(repository.getLatestSourcePack(sourcePack().sourcePackId)?.revision).toBe(2);
    expect(repository.getSourcePack(sourcePack().sourcePackId, 1)).toEqual(sourcePack(1));
    database.close();
  });

  it("rejects first-revision gaps, later gaps and same-revision mutation", () => {
    const firstDatabase = new DatabaseSync(":memory:");
    seedRawArtifact(firstDatabase);
    const firstRepository = new SqliteAiSourcePackRepository(firstDatabase);
    expect(() => firstRepository.saveSourcePack(sourcePack(2))).toThrowError(
      /must begin at revision 1/u,
    );
    firstDatabase.close();

    const database = new DatabaseSync(":memory:");
    seedRawArtifact(database);
    const repository = new SqliteAiSourcePackRepository(database);
    repository.saveSourcePack(sourcePack(1));
    expect(() => repository.saveSourcePack(sourcePack(3))).toThrowError(
      /must advance from revision 1 to 2/u,
    );
    expect(() =>
      repository.saveSourcePack({ ...sourcePack(1), name: "Mutated source pack" }),
    ).toThrowError(/already exists with different content/u);
    database.close();
  });

  it("rejects source packs that do not resolve to exact finalized RawArtifact evidence", () => {
    const missingDatabase = new DatabaseSync(":memory:");
    missingDatabase.exec(`
      CREATE TABLE raw_artifacts (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        content_digest TEXT NOT NULL,
        canonical_uri TEXT,
        document_json TEXT NOT NULL
      ) STRICT;
    `);
    const missingRepository = new SqliteAiSourcePackRepository(missingDatabase);
    expect(() => missingRepository.saveSourcePack(sourcePack())).toThrowError(
      /missing finalized RawArtifact/u,
    );
    missingDatabase.close();

    const digestDatabase = new DatabaseSync(":memory:");
    seedRawArtifact(digestDatabase);
    const digestRepository = new SqliteAiSourcePackRepository(digestDatabase);
    const digestMismatch: AiSourcePackV1 = {
      ...sourcePack(),
      sources: [{ ...sourcePack().sources[0], contentSha256: "a".repeat(64) }],
    };
    expect(() => digestRepository.saveSourcePack(digestMismatch)).toThrowError(
      /does not match the bound source SHA-256/u,
    );
    digestDatabase.close();

    const sourceDatabase = new DatabaseSync(":memory:");
    seedRawArtifact(sourceDatabase, artifact(OTHER_SOURCE_ID));
    const sourceRepository = new SqliteAiSourcePackRepository(sourceDatabase);
    expect(() => sourceRepository.saveSourcePack(sourcePack())).toThrowError(/belongs to .* not/u);
    sourceDatabase.close();
  });

  it("rejects binding context drift and makes binding identity immutable", () => {
    const database = new DatabaseSync(":memory:");
    seedRawArtifact(database);
    seedAssignment(database);
    const repository = new SqliteAiSourcePackRepository(database);
    repository.saveSourcePack(sourcePack());
    repository.saveBinding(binding());

    expect(() =>
      repository.saveBinding({ ...binding(), createdAt: "2026-08-24T07:46:00.000Z" }),
    ).toThrowError(/already exists with different content/u);

    expect(() =>
      repository.saveBinding({
        ...binding(),
        bindingId: "asb_us_trademark_section_8_revision_drift",
        instructionSetRevision: 2,
      }),
    ).toThrowError(/instruction-set identity mismatch/u);
    database.close();
  });

  it("rejects bindings whose assignment or source-pack evidence is missing", () => {
    const missingAssignmentDatabase = new DatabaseSync(":memory:");
    seedRawArtifact(missingAssignmentDatabase);
    const missingAssignmentRepository = new SqliteAiSourcePackRepository(missingAssignmentDatabase);
    missingAssignmentRepository.saveSourcePack(sourcePack());
    expect(() => missingAssignmentRepository.saveBinding(binding())).toThrowError(
      /references missing assignment/u,
    );
    missingAssignmentDatabase.close();

    const missingPackDatabase = new DatabaseSync(":memory:");
    seedAssignment(missingPackDatabase);
    const missingPackRepository = new SqliteAiSourcePackRepository(missingPackDatabase);
    expect(() => missingPackRepository.saveBinding(binding())).toThrowError(
      /references missing source pack/u,
    );
    missingPackDatabase.close();
  });
});
