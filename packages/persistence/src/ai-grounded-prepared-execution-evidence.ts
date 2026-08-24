import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  AI_GROUNDED_PREPARED_EVIDENCE_OBJECT_TYPE,
  AI_GROUNDED_PREPARED_EVIDENCE_PROTOCOL_VERSION,
  isAiGroundedExecutionEnvelopeV1,
  isAiGroundedPreparedExecutionEvidenceV1,
  isRawArtifact,
  type AiGroundedExecutionEnvelopeV1,
  type AiGroundedPreparedExecutionEvidenceV1,
  type RawArtifact,
} from "@markorbit/contracts";
import { SqliteAiKnowledgeAssignmentRepository } from "./ai-knowledge-assignment-registry";
import {
  SqliteAiSourcePackRepository,
  ensureAiSourcePackRegistry,
} from "./ai-source-pack-registry";
import {
  groundedPromptCanonicalUri,
  groundedPromptSourceUri,
} from "./ai-grounded-prepared-execution-ingestion";
import { RegistryConflictError, RegistryValidationError } from "./index";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export function ensureAiGroundedPreparedExecutionEvidenceRegistry(database: DatabaseSync): void {
  if (INITIALIZED_DATABASES.has(database)) return;
  ensureAiSourcePackRegistry(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS ai_grounded_prepared_execution_evidence (
      execution_input_sha256 TEXT PRIMARY KEY CHECK (length(execution_input_sha256) = 64),
      assignment_id TEXT NOT NULL,
      binding_id TEXT NOT NULL,
      source_pack_id TEXT NOT NULL,
      source_pack_revision INTEGER NOT NULL CHECK (source_pack_revision > 0),
      renderer_version TEXT NOT NULL,
      rendered_prompt_sha256 TEXT NOT NULL CHECK (length(rendered_prompt_sha256) = 64),
      source_receipts_sha256 TEXT NOT NULL CHECK (length(source_receipts_sha256) = 64),
      prompt_artifact_id TEXT NOT NULL UNIQUE,
      prompt_workspace_id TEXT NOT NULL,
      prompt_source_id TEXT NOT NULL,
      evidence_sha256 TEXT NOT NULL CHECK (length(evidence_sha256) = 64),
      document_json TEXT NOT NULL,
      canonical_prepared_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      FOREIGN KEY(binding_id) REFERENCES ai_assignment_source_bindings(binding_id),
      FOREIGN KEY(source_pack_id, source_pack_revision)
        REFERENCES ai_source_packs(source_pack_id, revision)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS ai_grounded_prepared_evidence_binding_idx
      ON ai_grounded_prepared_execution_evidence(binding_id, persisted_at DESC);

    CREATE TABLE IF NOT EXISTS ai_grounded_prepared_execution_sources (
      execution_input_sha256 TEXT NOT NULL,
      sequence INTEGER NOT NULL CHECK (sequence > 0),
      source_id TEXT NOT NULL,
      artifact_id TEXT NOT NULL,
      canonical_uri TEXT NOT NULL,
      media_type TEXT NOT NULL,
      content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64),
      size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
      PRIMARY KEY(execution_input_sha256, sequence),
      UNIQUE(execution_input_sha256, source_id),
      UNIQUE(execution_input_sha256, artifact_id),
      FOREIGN KEY(execution_input_sha256)
        REFERENCES ai_grounded_prepared_execution_evidence(execution_input_sha256)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS ai_grounded_prepared_sources_artifact_idx
      ON ai_grounded_prepared_execution_sources(artifact_id, execution_input_sha256);
  `);
  INITIALIZED_DATABASES.add(database);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseEvidence(
  value: string,
  expectedSha256?: string,
): AiGroundedPreparedExecutionEvidenceV1 {
  if (expectedSha256 !== undefined && sha256(value) !== expectedSha256) {
    throw new RegistryValidationError(
      "Stored grounded PREPARED execution evidence SHA-256 does not match document JSON",
    );
  }
  const parsed = JSON.parse(value) as unknown;
  if (!isAiGroundedPreparedExecutionEvidenceV1(parsed)) {
    throw new RegistryValidationError("Stored grounded PREPARED execution evidence is invalid");
  }
  return parsed;
}

function verifyEnvelopeHashes(envelope: AiGroundedExecutionEnvelopeV1): void {
  if (!isAiGroundedExecutionEnvelopeV1(envelope)) {
    throw new RegistryValidationError("Grounded execution envelope is invalid");
  }
  const sourceReceiptsSha256 = sha256(JSON.stringify(envelope.sourceReceipts));
  if (sourceReceiptsSha256 !== envelope.sourceReceiptsSha256) {
    throw new RegistryConflictError(
      "AI_GROUNDED_SOURCE_RECEIPTS_DIGEST_MISMATCH",
      "Grounded execution source receipts do not match their frozen SHA-256 identity",
    );
  }
  const executionInputSha256 = sha256(
    JSON.stringify({
      assignmentId: envelope.assignmentId,
      bindingId: envelope.bindingId,
      sourcePackId: envelope.sourcePackId,
      sourcePackRevision: envelope.sourcePackRevision,
      rendererVersion: envelope.rendererVersion,
      renderedPromptSha256: envelope.renderedPromptSha256,
      sourceReceiptsSha256: envelope.sourceReceiptsSha256,
    }),
  );
  if (executionInputSha256 !== envelope.executionInputSha256) {
    throw new RegistryConflictError(
      "AI_GROUNDED_EXECUTION_INPUT_DIGEST_MISMATCH",
      "Grounded execution input does not match its frozen SHA-256 identity",
    );
  }
}

type RawArtifactEvidenceRow = {
  source_id: string;
  content_digest: string;
  canonical_uri: string | null;
  document_json: string;
};

function rawArtifact(database: DatabaseSync, artifactId: string): RawArtifact {
  let row: RawArtifactEvidenceRow | undefined;
  try {
    row = database
      .prepare(
        `SELECT source_id, content_digest, canonical_uri, document_json
         FROM raw_artifacts
         WHERE id = ?`,
      )
      .get(artifactId) as RawArtifactEvidenceRow | undefined;
  } catch (error) {
    if (error instanceof Error && /no such table:\s*raw_artifacts/iu.test(error.message)) {
      throw new RegistryValidationError(
        "RawArtifact registry must be initialized before saving grounded PREPARED evidence",
      );
    }
    throw error;
  }
  if (!row) {
    throw new RegistryValidationError(`RawArtifact ${artifactId} was not found`);
  }
  const parsed = JSON.parse(row.document_json) as unknown;
  if (!isRawArtifact(parsed)) {
    throw new RegistryValidationError(`Stored RawArtifact ${artifactId} is invalid`);
  }
  if (
    parsed.id !== artifactId ||
    parsed.sourceId !== row.source_id ||
    parsed.binaryHash.value !== row.content_digest ||
    parsed.canonicalUri !== (row.canonical_uri ?? undefined)
  ) {
    throw new RegistryValidationError(`RawArtifact ${artifactId} registry row is inconsistent`);
  }
  return parsed;
}

function assertPersistedGovernedContext(
  database: DatabaseSync,
  envelope: AiGroundedExecutionEnvelopeV1,
): void {
  const assignments = new SqliteAiKnowledgeAssignmentRepository(database);
  const sourcePacks = new SqliteAiSourcePackRepository(database);
  const binding = sourcePacks.getBinding(envelope.bindingId);
  if (!binding) {
    throw new RegistryValidationError(`Grounded binding ${envelope.bindingId} was not found`);
  }
  const assignment = assignments.getAssignment(envelope.assignmentId);
  if (!assignment) {
    throw new RegistryValidationError(`Grounded assignment ${envelope.assignmentId} was not found`);
  }
  const sourcePack = sourcePacks.getSourcePack(envelope.sourcePackId, envelope.sourcePackRevision);
  if (!sourcePack) {
    throw new RegistryValidationError(
      `Grounded source pack ${envelope.sourcePackId}@${envelope.sourcePackRevision} was not found`,
    );
  }
  if (
    binding.assignmentId !== assignment.assignmentId ||
    binding.sourcePackId !== sourcePack.sourcePackId ||
    binding.sourcePackRevision !== sourcePack.revision
  ) {
    throw new RegistryConflictError(
      "AI_GROUNDED_PERSISTED_CONTEXT_MISMATCH",
      "Grounded envelope identities do not match the persisted Assignment/Binding/SourcePack context",
    );
  }
  if (sourcePack.sources.length !== envelope.sourceReceipts.length) {
    throw new RegistryConflictError(
      "AI_GROUNDED_SOURCE_SET_MISMATCH",
      "Grounded envelope does not contain the complete persisted SourcePack source set",
    );
  }
  sourcePack.sources.forEach((source, index) => {
    const receipt = envelope.sourceReceipts[index];
    if (
      !receipt ||
      receipt.sourceId !== source.sourceId ||
      receipt.artifactId !== source.artifactId ||
      receipt.canonicalUri !== source.canonicalUri ||
      receipt.contentSha256 !== source.contentSha256
    ) {
      throw new RegistryConflictError(
        "AI_GROUNDED_SOURCE_SET_MISMATCH",
        "Grounded envelope source receipt order or identity does not match the persisted SourcePack",
      );
    }
    const artifact = rawArtifact(database, receipt.artifactId);
    if (
      artifact.sourceId !== receipt.sourceId ||
      artifact.canonicalUri !== receipt.canonicalUri ||
      artifact.binaryHash.value !== receipt.contentSha256 ||
      artifact.contentHash?.value !== receipt.contentSha256 ||
      artifact.mimeType !== receipt.mediaType ||
      artifact.sizeBytes !== receipt.sizeBytes
    ) {
      throw new RegistryConflictError(
        "AI_GROUNDED_SOURCE_ARTIFACT_MISMATCH",
        `Grounded source receipt ${receipt.sourceId} no longer matches its finalized RawArtifact`,
      );
    }
  });
}

function promptArtifactLink(
  database: DatabaseSync,
  envelope: AiGroundedExecutionEnvelopeV1,
  promptArtifactId: string,
): AiGroundedPreparedExecutionEvidenceV1["promptArtifact"] {
  const artifact = rawArtifact(database, promptArtifactId);
  const canonicalUri = groundedPromptCanonicalUri(envelope.executionInputSha256);
  const sourceUri = groundedPromptSourceUri(envelope.executionInputSha256);
  if (
    artifact.artifactKind !== "MARKDOWN" ||
    artifact.mimeType !== "text/markdown" ||
    artifact.binaryHash.value !== envelope.renderedPromptSha256 ||
    artifact.contentHash?.value !== envelope.renderedPromptSha256 ||
    artifact.canonicalUri !== canonicalUri ||
    artifact.provenance.sourceUri !== sourceUri ||
    artifact.sizeBytes < 1
  ) {
    throw new RegistryConflictError(
      "AI_GROUNDED_PROMPT_ARTIFACT_MISMATCH",
      "Grounded rendered-prompt RawArtifact does not match the PREPARED execution envelope",
    );
  }
  return {
    artifactId: artifact.id,
    workspaceId: artifact.workspaceId,
    sourceId: artifact.sourceId,
    contentSha256: artifact.contentHash.value,
    sizeBytes: artifact.sizeBytes,
    canonicalUri,
    sourceUri,
  };
}

function assertReplayCompatible(
  existing: AiGroundedPreparedExecutionEvidenceV1,
  envelope: AiGroundedExecutionEnvelopeV1,
  currentPromptArtifact: AiGroundedPreparedExecutionEvidenceV1["promptArtifact"],
): void {
  if (
    existing.executionInputSha256 !== envelope.executionInputSha256 ||
    existing.assignmentId !== envelope.assignmentId ||
    existing.bindingId !== envelope.bindingId ||
    existing.sourcePackId !== envelope.sourcePackId ||
    existing.sourcePackRevision !== envelope.sourcePackRevision ||
    existing.rendererVersion !== envelope.rendererVersion ||
    existing.renderedPromptSha256 !== envelope.renderedPromptSha256 ||
    existing.sourceReceiptsSha256 !== envelope.sourceReceiptsSha256 ||
    JSON.stringify(existing.sourceReceipts) !== JSON.stringify(envelope.sourceReceipts) ||
    JSON.stringify(existing.promptArtifact) !== JSON.stringify(currentPromptArtifact)
  ) {
    throw new RegistryConflictError(
      "AI_GROUNDED_PREPARED_EVIDENCE_REPLAY_CONFLICT",
      "Grounded PREPARED execution identity was replayed with different governed evidence",
    );
  }
}

export class SqliteAiGroundedPreparedExecutionEvidenceRepository {
  constructor(private readonly database: DatabaseSync) {
    this.database.exec("PRAGMA foreign_keys = ON;");
    ensureAiGroundedPreparedExecutionEvidenceRegistry(database);
  }

  get(executionInputSha256: string): AiGroundedPreparedExecutionEvidenceV1 | null {
    const row = this.database
      .prepare(
        `SELECT document_json, evidence_sha256
         FROM ai_grounded_prepared_execution_evidence
         WHERE execution_input_sha256 = ?`,
      )
      .get(executionInputSha256) as
      | { document_json: string; evidence_sha256: string }
      | undefined;
    return row ? parseEvidence(row.document_json, row.evidence_sha256) : null;
  }

  listByBinding(bindingId: string): AiGroundedPreparedExecutionEvidenceV1[] {
    const rows = this.database
      .prepare(
        `SELECT document_json, evidence_sha256
         FROM ai_grounded_prepared_execution_evidence
         WHERE binding_id = ?
         ORDER BY persisted_at ASC, execution_input_sha256 ASC`,
      )
      .all(bindingId) as { document_json: string; evidence_sha256: string }[];
    return rows.map((row) => parseEvidence(row.document_json, row.evidence_sha256));
  }

  save(input: {
    envelope: AiGroundedExecutionEnvelopeV1;
    promptArtifactId: string;
    persistedAt?: string;
  }): { evidence: AiGroundedPreparedExecutionEvidenceV1; replayed: boolean } {
    verifyEnvelopeHashes(input.envelope);
    assertPersistedGovernedContext(this.database, input.envelope);

    const existing = this.get(input.envelope.executionInputSha256);
    if (existing) {
      const currentPromptArtifact = promptArtifactLink(
        this.database,
        input.envelope,
        input.promptArtifactId,
      );
      assertReplayCompatible(existing, input.envelope, currentPromptArtifact);
      return { evidence: existing, replayed: true };
    }

    const promptArtifact = promptArtifactLink(
      this.database,
      input.envelope,
      input.promptArtifactId,
    );
    const persistedAt = input.persistedAt ?? new Date().toISOString();
    if (!Number.isFinite(Date.parse(persistedAt))) {
      throw new RegistryValidationError("persistedAt must be a valid timestamp");
    }
    const evidence: AiGroundedPreparedExecutionEvidenceV1 = {
      protocolVersion: AI_GROUNDED_PREPARED_EVIDENCE_PROTOCOL_VERSION,
      objectType: AI_GROUNDED_PREPARED_EVIDENCE_OBJECT_TYPE,
      executionInputSha256: input.envelope.executionInputSha256,
      assignmentId: input.envelope.assignmentId,
      bindingId: input.envelope.bindingId,
      sourcePackId: input.envelope.sourcePackId,
      sourcePackRevision: input.envelope.sourcePackRevision,
      rendererVersion: input.envelope.rendererVersion,
      renderedPromptSha256: input.envelope.renderedPromptSha256,
      sourceReceiptsSha256: input.envelope.sourceReceiptsSha256,
      sourceReceipts: input.envelope.sourceReceipts,
      promptArtifact,
      canonicalPreparedAt: input.envelope.preparedAt,
      persistedAt,
      providerCallAuthorized: false,
      providerCallExecuted: false,
      externalBrowsingAllowed: false,
      legalTruthVerified: false,
      executionAuthorityGranted: false,
    };
    if (!isAiGroundedPreparedExecutionEvidenceV1(evidence)) {
      throw new RegistryValidationError("Generated grounded PREPARED execution evidence is invalid");
    }
    const json = JSON.stringify(evidence);
    const evidenceSha256 = sha256(json);

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database
        .prepare(
          `INSERT INTO ai_grounded_prepared_execution_evidence(
            execution_input_sha256, assignment_id, binding_id, source_pack_id,
            source_pack_revision, renderer_version, rendered_prompt_sha256,
            source_receipts_sha256, prompt_artifact_id, prompt_workspace_id,
            prompt_source_id, evidence_sha256, document_json, canonical_prepared_at, persisted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          evidence.executionInputSha256,
          evidence.assignmentId,
          evidence.bindingId,
          evidence.sourcePackId,
          evidence.sourcePackRevision,
          evidence.rendererVersion,
          evidence.renderedPromptSha256,
          evidence.sourceReceiptsSha256,
          evidence.promptArtifact.artifactId,
          evidence.promptArtifact.workspaceId,
          evidence.promptArtifact.sourceId,
          evidenceSha256,
          json,
          evidence.canonicalPreparedAt,
          evidence.persistedAt,
        );
      const insertSource = this.database.prepare(
        `INSERT INTO ai_grounded_prepared_execution_sources(
          execution_input_sha256, sequence, source_id, artifact_id, canonical_uri,
          media_type, content_sha256, size_bytes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      evidence.sourceReceipts.forEach((receipt, index) => {
        insertSource.run(
          evidence.executionInputSha256,
          index + 1,
          receipt.sourceId,
          receipt.artifactId,
          receipt.canonicalUri,
          receipt.mediaType,
          receipt.contentSha256,
          receipt.sizeBytes,
        );
      });
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
    return { evidence, replayed: false };
  }
}
