import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  assertAiAssignmentSourceBindingContext,
  isAiAssignmentSourceBindingV1,
  isAiSourcePackV1,
  isRawArtifact,
  type AiAssignmentSourceBindingV1,
  type AiSourcePackV1,
  type AiSourceSnapshotRefV1,
  type RawArtifact,
} from "@markorbit/contracts";
import {
  SqliteAiKnowledgeAssignmentRepository,
  ensureAiKnowledgeAssignmentRegistry,
} from "./ai-knowledge-assignment-registry";
import { RegistryConflictError, RegistryValidationError } from "./index";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export function ensureAiSourcePackRegistry(database: DatabaseSync): void {
  if (INITIALIZED_DATABASES.has(database)) return;
  ensureAiKnowledgeAssignmentRegistry(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS ai_source_packs (
      source_pack_id TEXT NOT NULL CHECK (source_pack_id LIKE 'asp_%'),
      revision INTEGER NOT NULL CHECK (revision > 0),
      jurisdiction TEXT NOT NULL,
      domain TEXT NOT NULL,
      topic TEXT NOT NULL,
      document_sha256 TEXT NOT NULL CHECK (length(document_sha256) = 64),
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(source_pack_id, revision)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS ai_source_packs_scope_idx
      ON ai_source_packs(jurisdiction, domain, topic, revision DESC);

    CREATE TABLE IF NOT EXISTS ai_source_pack_sources (
      source_pack_id TEXT NOT NULL,
      source_pack_revision INTEGER NOT NULL,
      sequence INTEGER NOT NULL CHECK (sequence > 0),
      source_id TEXT NOT NULL,
      artifact_id TEXT NOT NULL,
      canonical_uri TEXT NOT NULL,
      content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64),
      authority TEXT NOT NULL,
      role TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      PRIMARY KEY(source_pack_id, source_pack_revision, sequence),
      UNIQUE(source_pack_id, source_pack_revision, source_id),
      UNIQUE(source_pack_id, source_pack_revision, artifact_id),
      FOREIGN KEY(source_pack_id, source_pack_revision)
        REFERENCES ai_source_packs(source_pack_id, revision)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS ai_source_pack_sources_artifact_idx
      ON ai_source_pack_sources(artifact_id, source_pack_id, source_pack_revision);

    CREATE TABLE IF NOT EXISTS ai_assignment_source_bindings (
      binding_id TEXT PRIMARY KEY CHECK (binding_id LIKE 'asb_%'),
      assignment_id TEXT NOT NULL,
      instruction_set_id TEXT NOT NULL,
      instruction_set_revision INTEGER NOT NULL CHECK (instruction_set_revision > 0),
      source_pack_id TEXT NOT NULL,
      source_pack_revision INTEGER NOT NULL CHECK (source_pack_revision > 0),
      document_sha256 TEXT NOT NULL CHECK (length(document_sha256) = 64),
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(assignment_id) REFERENCES ai_knowledge_assignments(assignment_id),
      FOREIGN KEY(source_pack_id, source_pack_revision)
        REFERENCES ai_source_packs(source_pack_id, revision)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS ai_assignment_source_bindings_assignment_idx
      ON ai_assignment_source_bindings(assignment_id, created_at, binding_id);
  `);
  INITIALIZED_DATABASES.add(database);
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function parseSourcePack(value: string): AiSourcePackV1 {
  const parsed = JSON.parse(value) as unknown;
  if (!isAiSourcePackV1(parsed)) {
    throw new RegistryValidationError("Stored AI source pack is invalid");
  }
  return parsed;
}

function parseBinding(value: string): AiAssignmentSourceBindingV1 {
  const parsed = JSON.parse(value) as unknown;
  if (!isAiAssignmentSourceBindingV1(parsed)) {
    throw new RegistryValidationError("Stored AI assignment source binding is invalid");
  }
  return parsed;
}

type RawArtifactEvidenceRow = {
  source_id: string;
  content_digest: string;
  canonical_uri: string | null;
  document_json: string;
};

function readRawArtifactEvidence(database: DatabaseSync, artifactId: string): RawArtifact | null {
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
        "RawArtifact registry must be initialized before saving AI source packs",
      );
    }
    throw error;
  }
  if (!row) return null;

  const parsed = JSON.parse(row.document_json) as unknown;
  if (!isRawArtifact(parsed)) {
    throw new RegistryValidationError(`Stored RawArtifact ${artifactId} is invalid`);
  }
  if (
    parsed.id !== artifactId ||
    parsed.sourceId !== row.source_id ||
    parsed.canonicalUri !== (row.canonical_uri ?? undefined) ||
    parsed.binaryHash.value !== row.content_digest
  ) {
    throw new RegistryValidationError(`RawArtifact ${artifactId} registry row is internally inconsistent`);
  }
  return parsed;
}

function assertSourceArtifactEvidence(
  database: DatabaseSync,
  source: AiSourceSnapshotRefV1,
): void {
  const artifact = readRawArtifactEvidence(database, source.artifactId);
  if (!artifact) {
    throw new RegistryValidationError(
      `AI source pack references missing finalized RawArtifact ${source.artifactId}`,
    );
  }
  if (artifact.sourceId !== source.sourceId) {
    throw new RegistryConflictError(
      "AI_SOURCE_PACK_ARTIFACT_SOURCE_MISMATCH",
      `RawArtifact ${source.artifactId} belongs to ${artifact.sourceId}, not ${source.sourceId}`,
    );
  }
  if (artifact.binaryHash.value !== source.contentSha256) {
    throw new RegistryConflictError(
      "AI_SOURCE_PACK_ARTIFACT_DIGEST_MISMATCH",
      `RawArtifact ${source.artifactId} does not match the bound source SHA-256`,
    );
  }
  if (artifact.canonicalUri !== source.canonicalUri) {
    throw new RegistryConflictError(
      "AI_SOURCE_PACK_ARTIFACT_URI_MISMATCH",
      `RawArtifact ${source.artifactId} canonical URI does not match the source snapshot`,
    );
  }
  if (artifact.capturedAt !== source.capturedAt) {
    throw new RegistryConflictError(
      "AI_SOURCE_PACK_ARTIFACT_CAPTURE_MISMATCH",
      `RawArtifact ${source.artifactId} capture time does not match the source snapshot`,
    );
  }
  if (artifact.publishedAt !== source.publishedAt) {
    throw new RegistryConflictError(
      "AI_SOURCE_PACK_ARTIFACT_PUBLICATION_MISMATCH",
      `RawArtifact ${source.artifactId} publication time does not match the source snapshot`,
    );
  }
}

export class SqliteAiSourcePackRepository {
  private readonly assignments: SqliteAiKnowledgeAssignmentRepository;

  constructor(private readonly database: DatabaseSync) {
    this.database.exec("PRAGMA foreign_keys = ON;");
    ensureAiSourcePackRegistry(database);
    this.assignments = new SqliteAiKnowledgeAssignmentRepository(database);
  }

  saveSourcePack(value: AiSourcePackV1): AiSourcePackV1 {
    if (!isAiSourcePackV1(value)) {
      throw new RegistryValidationError("AI source pack is invalid");
    }

    const json = JSON.stringify(value);
    const sha256 = digest(value);
    const existing = this.database
      .prepare(
        `SELECT document_sha256, document_json
         FROM ai_source_packs
         WHERE source_pack_id = ? AND revision = ?`,
      )
      .get(value.sourcePackId, value.revision) as
      | { document_sha256: string; document_json: string }
      | undefined;
    if (existing) {
      if (existing.document_sha256 !== sha256 || existing.document_json !== json) {
        throw new RegistryConflictError(
          "AI_SOURCE_PACK_IMMUTABLE_CONFLICT",
          `AI source pack ${value.sourcePackId} revision ${value.revision} already exists with different content`,
        );
      }
      return parseSourcePack(existing.document_json);
    }

    const latest = this.database
      .prepare(
        `SELECT MAX(revision) AS revision
         FROM ai_source_packs
         WHERE source_pack_id = ?`,
      )
      .get(value.sourcePackId) as { revision: number | null };
    if (latest.revision === null && value.revision !== 1) {
      throw new RegistryConflictError(
        "AI_SOURCE_PACK_FIRST_REVISION_INVALID",
        `AI source pack ${value.sourcePackId} must begin at revision 1`,
      );
    }
    if (latest.revision !== null && value.revision !== latest.revision + 1) {
      throw new RegistryConflictError(
        "AI_SOURCE_PACK_REVISION_GAP",
        `AI source pack ${value.sourcePackId} must advance from revision ${latest.revision} to ${latest.revision + 1}`,
      );
    }

    for (const source of value.sources) {
      assertSourceArtifactEvidence(this.database, source);
    }

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database
        .prepare(
          `INSERT INTO ai_source_packs(
            source_pack_id, revision, jurisdiction, domain, topic,
            document_sha256, document_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          value.sourcePackId,
          value.revision,
          value.jurisdiction,
          value.domain,
          value.topic,
          sha256,
          json,
          value.createdAt,
        );

      const insertSource = this.database.prepare(
        `INSERT INTO ai_source_pack_sources(
          source_pack_id, source_pack_revision, sequence, source_id, artifact_id,
          canonical_uri, content_sha256, authority, role, captured_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      value.sources.forEach((source, index) => {
        insertSource.run(
          value.sourcePackId,
          value.revision,
          index + 1,
          source.sourceId,
          source.artifactId,
          source.canonicalUri,
          source.contentSha256,
          source.authority,
          source.role,
          source.capturedAt,
        );
      });
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
    return value;
  }

  getSourcePack(sourcePackId: string, revision: number): AiSourcePackV1 | null {
    const row = this.database
      .prepare(
        `SELECT document_json
         FROM ai_source_packs
         WHERE source_pack_id = ? AND revision = ?`,
      )
      .get(sourcePackId, revision) as { document_json: string } | undefined;
    return row ? parseSourcePack(row.document_json) : null;
  }

  getLatestSourcePack(sourcePackId: string): AiSourcePackV1 | null {
    const row = this.database
      .prepare(
        `SELECT document_json
         FROM ai_source_packs
         WHERE source_pack_id = ?
         ORDER BY revision DESC
         LIMIT 1`,
      )
      .get(sourcePackId) as { document_json: string } | undefined;
    return row ? parseSourcePack(row.document_json) : null;
  }

  listLatestSourcePacksByScope(input: {
    jurisdiction: string;
    domain: string;
    topic: string;
  }): AiSourcePackV1[] {
    const rows = this.database
      .prepare(
        `SELECT pack.document_json
         FROM ai_source_packs pack
         JOIN (
           SELECT source_pack_id, MAX(revision) AS revision
           FROM ai_source_packs
           WHERE jurisdiction = ? AND domain = ? AND topic = ?
           GROUP BY source_pack_id
         ) latest
           ON latest.source_pack_id = pack.source_pack_id AND latest.revision = pack.revision
         ORDER BY pack.source_pack_id ASC`,
      )
      .all(input.jurisdiction, input.domain, input.topic) as { document_json: string }[];
    return rows.map((row) => parseSourcePack(row.document_json));
  }

  saveBinding(value: AiAssignmentSourceBindingV1): AiAssignmentSourceBindingV1 {
    if (!isAiAssignmentSourceBindingV1(value)) {
      throw new RegistryValidationError("AI assignment source binding is invalid");
    }

    const json = JSON.stringify(value);
    const sha256 = digest(value);
    const existing = this.database
      .prepare(
        `SELECT document_sha256, document_json
         FROM ai_assignment_source_bindings
         WHERE binding_id = ?`,
      )
      .get(value.bindingId) as
      | { document_sha256: string; document_json: string }
      | undefined;
    if (existing) {
      if (existing.document_sha256 !== sha256 || existing.document_json !== json) {
        throw new RegistryConflictError(
          "AI_ASSIGNMENT_SOURCE_BINDING_IMMUTABLE_CONFLICT",
          `AI assignment source binding ${value.bindingId} already exists with different content`,
        );
      }
      return parseBinding(existing.document_json);
    }

    const assignment = this.assignments.getAssignment(value.assignmentId);
    if (!assignment) {
      throw new RegistryValidationError(
        `AI assignment source binding references missing assignment ${value.assignmentId}`,
      );
    }
    const sourcePack = this.getSourcePack(value.sourcePackId, value.sourcePackRevision);
    if (!sourcePack) {
      throw new RegistryValidationError(
        `AI assignment source binding references missing source pack ${value.sourcePackId}@${value.sourcePackRevision}`,
      );
    }
    try {
      assertAiAssignmentSourceBindingContext(value, assignment, sourcePack);
    } catch (error) {
      throw new RegistryConflictError(
        "AI_ASSIGNMENT_SOURCE_BINDING_CONTEXT_MISMATCH",
        error instanceof Error ? error.message : "AI assignment source binding context mismatch",
      );
    }

    this.database
      .prepare(
        `INSERT INTO ai_assignment_source_bindings(
          binding_id, assignment_id, instruction_set_id, instruction_set_revision,
          source_pack_id, source_pack_revision, document_sha256, document_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        value.bindingId,
        value.assignmentId,
        value.instructionSetId,
        value.instructionSetRevision,
        value.sourcePackId,
        value.sourcePackRevision,
        sha256,
        json,
        value.createdAt,
      );
    return value;
  }

  getBinding(bindingId: string): AiAssignmentSourceBindingV1 | null {
    const row = this.database
      .prepare(
        `SELECT document_json
         FROM ai_assignment_source_bindings
         WHERE binding_id = ?`,
      )
      .get(bindingId) as { document_json: string } | undefined;
    return row ? parseBinding(row.document_json) : null;
  }

  listBindingsByAssignment(assignmentId: string): AiAssignmentSourceBindingV1[] {
    const rows = this.database
      .prepare(
        `SELECT document_json
         FROM ai_assignment_source_bindings
         WHERE assignment_id = ?
         ORDER BY created_at ASC, binding_id ASC`,
      )
      .all(assignmentId) as { document_json: string }[];
    return rows.map((row) => parseBinding(row.document_json));
  }
}
