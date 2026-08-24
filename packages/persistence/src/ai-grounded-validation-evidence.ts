import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  isAiGroundedOutputValidationReceiptV1,
  isAiResearchSubmissionV1,
  isRawArtifact,
  type AiGroundedOutputValidationReceiptV1,
  type AiResearchSubmissionV1,
  type RawArtifact,
} from "@markorbit/contracts";
import {
  SqliteAiSourcePackRepository,
  ensureAiSourcePackRegistry,
} from "./ai-source-pack-registry";
import { RegistryConflictError, RegistryValidationError } from "./index";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export type AiGroundedValidationEvidenceV1 = {
  submission: AiResearchSubmissionV1;
  receipt: AiGroundedOutputValidationReceiptV1;
  rawProviderArtifactId: string;
  markdownArtifactId: string;
};

export function ensureAiGroundedValidationEvidenceRegistry(database: DatabaseSync): void {
  if (INITIALIZED_DATABASES.has(database)) return;
  ensureAiSourcePackRegistry(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS ai_grounded_validation_evidence (
      submission_id TEXT PRIMARY KEY CHECK (submission_id LIKE 'ars_%'),
      assignment_id TEXT NOT NULL,
      binding_id TEXT NOT NULL,
      source_pack_id TEXT NOT NULL,
      source_pack_revision INTEGER NOT NULL CHECK (source_pack_revision > 0),
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      raw_provider_artifact_id TEXT NOT NULL UNIQUE,
      markdown_artifact_id TEXT NOT NULL UNIQUE,
      prompt_sha256 TEXT NOT NULL CHECK (length(prompt_sha256) = 64),
      raw_response_sha256 TEXT NOT NULL CHECK (length(raw_response_sha256) = 64),
      output_sha256 TEXT NOT NULL CHECK (length(output_sha256) = 64),
      evidence_sha256 TEXT NOT NULL CHECK (length(evidence_sha256) = 64),
      evidence_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(assignment_id) REFERENCES ai_knowledge_assignments(assignment_id),
      FOREIGN KEY(binding_id) REFERENCES ai_assignment_source_bindings(binding_id),
      FOREIGN KEY(source_pack_id, source_pack_revision)
        REFERENCES ai_source_packs(source_pack_id, revision)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS ai_grounded_validation_binding_idx
      ON ai_grounded_validation_evidence(binding_id, created_at, submission_id);
  `);
  INITIALIZED_DATABASES.add(database);
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function parseEvidence(value: string): AiGroundedValidationEvidenceV1 {
  const parsed = JSON.parse(value) as Partial<AiGroundedValidationEvidenceV1>;
  if (
    !parsed ||
    !isAiResearchSubmissionV1(parsed.submission) ||
    !isAiGroundedOutputValidationReceiptV1(parsed.receipt) ||
    typeof parsed.rawProviderArtifactId !== "string" ||
    typeof parsed.markdownArtifactId !== "string"
  ) {
    throw new RegistryValidationError("Stored AI grounded validation evidence is invalid");
  }
  return parsed as AiGroundedValidationEvidenceV1;
}

type RawArtifactRow = {
  source_id: string;
  content_digest: string;
  document_json: string;
};

function readArtifact(database: DatabaseSync, artifactId: string): RawArtifact {
  let row: RawArtifactRow | undefined;
  try {
    row = database
      .prepare(
        `SELECT source_id, content_digest, document_json
         FROM raw_artifacts
         WHERE id = ?`,
      )
      .get(artifactId) as RawArtifactRow | undefined;
  } catch (error) {
    if (error instanceof Error && /no such table:\s*raw_artifacts/iu.test(error.message)) {
      throw new RegistryValidationError(
        "RawArtifact registry must be initialized before saving grounded validation evidence",
      );
    }
    throw error;
  }
  if (!row) {
    throw new RegistryValidationError(
      `Grounded validation evidence references missing RawArtifact ${artifactId}`,
    );
  }
  const parsed = JSON.parse(row.document_json) as unknown;
  if (!isRawArtifact(parsed)) {
    throw new RegistryValidationError(`Stored RawArtifact ${artifactId} is invalid`);
  }
  if (
    parsed.id !== artifactId ||
    parsed.sourceId !== row.source_id ||
    parsed.binaryHash.value !== row.content_digest
  ) {
    throw new RegistryValidationError(
      `RawArtifact ${artifactId} registry row is internally inconsistent`,
    );
  }
  return parsed;
}

function providerSlug(provider: string): string {
  return provider.toLowerCase().replace(/[^a-z0-9-]/gu, "-");
}

function modelSlug(model: string): string {
  return encodeURIComponent(model.toLowerCase());
}

function assertArtifactEvidence(input: {
  submission: AiResearchSubmissionV1;
  receipt: AiGroundedOutputValidationReceiptV1;
  rawProviderArtifact: RawArtifact;
  markdownArtifact: RawArtifact;
  rawProviderArtifactId: string;
}): void {
  const provider = providerSlug(input.submission.provider);
  const expectedCanonicalUri = `ai+markorbit://${provider}/assignments/${input.submission.assignmentId}/models/${modelSlug(input.submission.model)}`;
  const expectedRawSourceUri = `ai+markorbit://${provider}/submissions/${input.submission.submissionId}/raw`;
  const expectedMarkdownSourceUri = `ai+markorbit://${provider}/submissions/${input.submission.submissionId}/markdown`;
  const parentArtifactIds = input.markdownArtifact.provenance.parentArtifactIds ?? [];
  const rawProviderContentSha256 = input.rawProviderArtifact.contentHash?.value;
  const markdownContentSha256 = input.markdownArtifact.contentHash?.value;

  if (
    input.rawProviderArtifact.artifactKind !== "JSON" ||
    input.rawProviderArtifact.mimeType !== "application/json" ||
    input.rawProviderArtifact.binaryHash.value !== input.submission.rawResponseSha256 ||
    rawProviderContentSha256 !== input.submission.rawResponseSha256 ||
    input.rawProviderArtifact.originalName !==
      `${input.submission.submissionId}.provider-response.json` ||
    input.rawProviderArtifact.canonicalUri !== expectedCanonicalUri ||
    input.rawProviderArtifact.provenance.sourceUri !== expectedRawSourceUri ||
    input.rawProviderArtifact.publishedAt !== input.submission.completedAt
  ) {
    throw new RegistryConflictError(
      "AI_GROUNDED_RAW_PROVIDER_ARTIFACT_MISMATCH",
      "Raw provider artifact does not match the frozen AI research submission",
    );
  }

  if (
    input.markdownArtifact.artifactKind !== "MARKDOWN" ||
    input.markdownArtifact.mimeType !== "text/markdown" ||
    input.markdownArtifact.binaryHash.value !== input.submission.markdownSha256 ||
    markdownContentSha256 !== input.submission.markdownSha256 ||
    markdownContentSha256 !== input.receipt.outputSha256 ||
    input.markdownArtifact.sizeBytes !== input.submission.markdownSizeBytes ||
    input.markdownArtifact.originalName !== `${input.submission.submissionId}.md` ||
    input.markdownArtifact.canonicalUri !== expectedCanonicalUri ||
    input.markdownArtifact.provenance.sourceUri !== expectedMarkdownSourceUri ||
    input.markdownArtifact.publishedAt !== input.submission.completedAt ||
    parentArtifactIds.length !== 1 ||
    parentArtifactIds[0] !== input.rawProviderArtifactId
  ) {
    throw new RegistryConflictError(
      "AI_GROUNDED_MARKDOWN_ARTIFACT_MISMATCH",
      "Distilled Markdown artifact does not match the frozen submission and validation receipt",
    );
  }

  if (
    input.rawProviderArtifact.workspaceId !== input.markdownArtifact.workspaceId ||
    input.rawProviderArtifact.sourceId !== input.markdownArtifact.sourceId
  ) {
    throw new RegistryConflictError(
      "AI_GROUNDED_ARTIFACT_SCOPE_MISMATCH",
      "AI provider and Markdown artifacts must share one workspace/source execution scope",
    );
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

export class SqliteAiGroundedValidationEvidenceRepository {
  private readonly sourcePacks: SqliteAiSourcePackRepository;

  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.database.exec("PRAGMA foreign_keys = ON;");
    ensureAiGroundedValidationEvidenceRegistry(database);
    this.sourcePacks = new SqliteAiSourcePackRepository(database);
  }

  save(value: AiGroundedValidationEvidenceV1): AiGroundedValidationEvidenceV1 {
    if (!isAiResearchSubmissionV1(value.submission)) {
      throw new RegistryValidationError("AI grounded validation evidence submission is invalid");
    }
    if (!isAiGroundedOutputValidationReceiptV1(value.receipt)) {
      throw new RegistryValidationError("AI grounded validation receipt is invalid");
    }

    const binding = this.sourcePacks.getBinding(value.receipt.bindingId);
    if (!binding) {
      throw new RegistryValidationError(
        `AI grounded validation receipt references missing binding ${value.receipt.bindingId}`,
      );
    }
    const sourcePack = this.sourcePacks.getSourcePack(
      value.receipt.sourcePackId,
      value.receipt.sourcePackRevision,
    );
    if (!sourcePack) {
      throw new RegistryValidationError(
        `AI grounded validation receipt references missing source pack ${value.receipt.sourcePackId}@${value.receipt.sourcePackRevision}`,
      );
    }

    if (
      value.submission.assignmentId !== value.receipt.assignmentId ||
      value.submission.promptSha256 !== value.receipt.renderedPromptSha256 ||
      value.submission.markdownSha256 !== value.receipt.outputSha256 ||
      binding.assignmentId !== value.receipt.assignmentId ||
      binding.sourcePackId !== value.receipt.sourcePackId ||
      binding.sourcePackRevision !== value.receipt.sourcePackRevision
    ) {
      throw new RegistryConflictError(
        "AI_GROUNDED_VALIDATION_CONTEXT_MISMATCH",
        "Submission, validation receipt and persisted binding identities do not match",
      );
    }

    const receiptSourceIds = [
      ...value.receipt.citedSourceIds,
      ...value.receipt.unreferencedSourceIds,
    ];
    const sourcePackIds = sourcePack.sources.map((source) => source.sourceId);
    if (!sameStringSet(receiptSourceIds, sourcePackIds)) {
      throw new RegistryConflictError(
        "AI_GROUNDED_VALIDATION_SOURCE_SET_MISMATCH",
        "Validation receipt source identities do not cover the exact persisted SourcePack",
      );
    }

    const rawProviderArtifact = readArtifact(this.database, value.rawProviderArtifactId);
    const markdownArtifact = readArtifact(this.database, value.markdownArtifactId);
    assertArtifactEvidence({
      submission: value.submission,
      receipt: value.receipt,
      rawProviderArtifact,
      markdownArtifact,
      rawProviderArtifactId: value.rawProviderArtifactId,
    });

    const json = JSON.stringify(value);
    const sha256 = digest(value);
    const existing = this.database
      .prepare(
        `SELECT evidence_sha256, evidence_json
         FROM ai_grounded_validation_evidence
         WHERE submission_id = ?`,
      )
      .get(value.submission.submissionId) as
      { evidence_sha256: string; evidence_json: string } | undefined;
    if (existing) {
      if (existing.evidence_sha256 !== sha256 || existing.evidence_json !== json) {
        throw new RegistryConflictError(
          "AI_GROUNDED_VALIDATION_EVIDENCE_IMMUTABLE_CONFLICT",
          `Grounded validation evidence for ${value.submission.submissionId} already exists with different content`,
        );
      }
      return parseEvidence(existing.evidence_json);
    }

    this.database
      .prepare(
        `INSERT INTO ai_grounded_validation_evidence(
          submission_id, assignment_id, binding_id, source_pack_id, source_pack_revision,
          provider, model, raw_provider_artifact_id, markdown_artifact_id,
          prompt_sha256, raw_response_sha256, output_sha256,
          evidence_sha256, evidence_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        value.submission.submissionId,
        value.receipt.assignmentId,
        value.receipt.bindingId,
        value.receipt.sourcePackId,
        value.receipt.sourcePackRevision,
        value.submission.provider,
        value.submission.model,
        value.rawProviderArtifactId,
        value.markdownArtifactId,
        value.receipt.renderedPromptSha256,
        value.submission.rawResponseSha256,
        value.receipt.outputSha256,
        sha256,
        json,
        this.clock().toISOString(),
      );
    return value;
  }

  getBySubmission(submissionId: string): AiGroundedValidationEvidenceV1 | null {
    const row = this.database
      .prepare(
        `SELECT evidence_json
         FROM ai_grounded_validation_evidence
         WHERE submission_id = ?`,
      )
      .get(submissionId) as { evidence_json: string } | undefined;
    return row ? parseEvidence(row.evidence_json) : null;
  }

  listByBinding(bindingId: string): AiGroundedValidationEvidenceV1[] {
    const rows = this.database
      .prepare(
        `SELECT evidence_json
         FROM ai_grounded_validation_evidence
         WHERE binding_id = ?
         ORDER BY created_at ASC, submission_id ASC`,
      )
      .all(bindingId) as { evidence_json: string }[];
    return rows.map((row) => parseEvidence(row.evidence_json));
  }
}
