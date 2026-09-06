import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  EVIDENCE_SET_CONTRACT_VERSION,
  EVIDENCE_SET_ORDERING,
  evidenceSetExportV1,
  isEvidenceSetV1,
  isRawArtifact,
  type EvidenceSetCreatorV1,
  type EvidenceSetDriftReportV1,
  type EvidenceSetExportV1,
  type EvidenceSetMemberDriftV1,
  type EvidenceSetMemberV1,
  type EvidenceSetV1,
  type RawArtifact,
  type RetrievalDocument,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";

const MIGRATION_ID = "0032_evidence_sets_v1";
const MAX_MEMBERS = 100;
const MAX_TITLE = 200;
const MAX_NOTE = 1_000;
const MAX_LIST = 100;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type CreateEvidenceSetInput = {
  workspaceId: string;
  title: string;
  note?: string | null;
  stagingDocumentIds: string[];
  idempotencyKey: string;
  creator: EvidenceSetCreatorV1;
};

export type CreateEvidenceSetResult = {
  evidenceSet: EvidenceSetV1;
  replayed: boolean;
};

export interface EvidenceSetRegistryRepository {
  create(input: CreateEvidenceSetInput): CreateEvidenceSetResult;
  getById(workspaceId: string, evidenceSetId: string): EvidenceSetV1 | null;
  list(workspaceId: string, limit?: number): EvidenceSetV1[];
  drift(workspaceId: string, evidenceSetId: string): EvidenceSetDriftReportV1;
  exportById(workspaceId: string, evidenceSetId: string): EvidenceSetExportV1;
}

type RetrievalRow = Record<string, unknown>;
type ArtifactRow = { document_json: string };

type NormalizedCreate = {
  workspaceId: string;
  title: string;
  note: string | null;
  stagingDocumentIds: string[];
  idempotencyKey: string;
  creator: EvidenceSetCreatorV1;
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function encodeBase32(value: bigint, length: number): string {
  let output = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    output = CROCKFORD[Number(remaining & 31n)] + output;
    remaining >>= 5n;
  }
  return output;
}

export function generateEvidenceSetId(now = Date.now()): string {
  const timestamp = encodeBase32(BigInt(now), 10);
  const randomValue = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `evs_${timestamp}${encodeBase32(randomValue, 16)}`;
}

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function normalize(input: CreateEvidenceSetInput): NormalizedCreate {
  const workspaceId = required(input.workspaceId, "workspaceId");
  const title = required(input.title, "title");
  if (title.length > MAX_TITLE)
    throw new RegistryValidationError(`title exceeds ${MAX_TITLE} characters`);
  const noteValue = input.note?.trim() || null;
  if (noteValue && noteValue.length > MAX_NOTE) {
    throw new RegistryValidationError(`note exceeds ${MAX_NOTE} characters`);
  }
  if (!Array.isArray(input.stagingDocumentIds) || input.stagingDocumentIds.length < 1) {
    throw new RegistryValidationError("Evidence Set requires at least one selected document");
  }
  if (input.stagingDocumentIds.length > MAX_MEMBERS) {
    throw new RegistryValidationError(`Evidence Set is limited to ${MAX_MEMBERS} members`);
  }
  const stagingDocumentIds = input.stagingDocumentIds.map((value, index) =>
    required(value, `stagingDocumentIds[${index}]`),
  );
  if (new Set(stagingDocumentIds).size !== stagingDocumentIds.length) {
    throw new RegistryValidationError("Evidence Set selection cannot contain duplicate documents");
  }
  const idempotencyKey = required(input.idempotencyKey, "idempotencyKey");
  if (!KEY.test(idempotencyKey))
    throw new RegistryValidationError("Invalid Evidence Set idempotency key");
  const creator = {
    userId: required(input.creator?.userId, "creator.userId"),
    membershipId: required(input.creator?.membershipId, "creator.membershipId"),
    role: required(input.creator?.role, "creator.role"),
  };
  return { workspaceId, title, note: noteValue, stagingDocumentIds, idempotencyKey, creator };
}

function requestDigest(input: NormalizedCreate): string {
  return sha256(
    stable({
      workspaceId: input.workspaceId,
      title: input.title,
      note: input.note,
      stagingDocumentIds: input.stagingDocumentIds,
      creator: input.creator,
    }),
  );
}

function setDigest(value: Omit<EvidenceSetV1, "digest">): string {
  return sha256(stable(value));
}

function parseEvidenceSet(value: string): EvidenceSetV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new RegistryConflictError(
      "EVIDENCE_SET_PERSISTED_STATE_INVALID",
      "Persisted Evidence Set is not valid JSON",
    );
  }
  if (!isEvidenceSetV1(parsed)) {
    throw new RegistryConflictError(
      "EVIDENCE_SET_PERSISTED_STATE_INVALID",
      "Persisted Evidence Set no longer satisfies its immutable contract",
    );
  }
  const { digest, ...base } = parsed;
  if (setDigest(base) !== digest) {
    throw new RegistryConflictError(
      "EVIDENCE_SET_DIGEST_MISMATCH",
      "Persisted Evidence Set digest does not match its frozen manifest",
    );
  }
  return parsed;
}

function retrievalDocument(row: RetrievalRow): RetrievalDocument {
  return {
    protocolVersion: "1.0",
    objectType: "RETRIEVAL_DOCUMENT",
    documentId: String(row.document_id),
    workspaceId: String(row.workspace_id),
    sourceId: String(row.source_id),
    stagingDocumentId: String(row.staging_document_id),
    readyPackageId: String(row.ready_package_id),
    rawArtifactId: String(row.raw_artifact_id),
    logicalDocumentId: row.logical_document_id === null ? null : String(row.logical_document_id),
    artifactVersion: Number(row.artifact_version),
    title: String(row.title),
    targetPath: String(row.target_path),
    canonicalUri: row.canonical_uri === null ? null : String(row.canonical_uri),
    sourceUri: String(row.source_uri),
    sourceName: String(row.source_name),
    sourceCategory: String(row.source_category) as RetrievalDocument["sourceCategory"],
    authorityLevel: String(row.authority_level) as RetrievalDocument["authorityLevel"],
    jurisdictions: JSON.parse(String(row.jurisdictions_json)) as string[],
    languages: JSON.parse(String(row.languages_json)) as string[],
    capturedAt: String(row.captured_at),
    publishedAt: row.published_at === null ? null : String(row.published_at),
    contentSha256: String(row.content_sha256),
    keywords: JSON.parse(String(row.keywords_json)) as string[],
    chunkCount: Number(row.chunk_count),
    indexedAt: String(row.indexed_at),
    isCurrent: Number(row.is_current) === 1,
  };
}

function parseArtifact(row: ArtifactRow): RawArtifact {
  const parsed = JSON.parse(row.document_json) as unknown;
  if (!isRawArtifact(parsed)) {
    throw new RegistryConflictError(
      "EVIDENCE_SET_RAW_ARTIFACT_INVALID",
      "Selected evidence points to an invalid persisted RawArtifact",
    );
  }
  return parsed;
}

const RETRIEVAL_COLUMNS = `
  staging_document_id, workspace_id, document_id, source_id, ready_package_id,
  raw_artifact_id, logical_document_id, artifact_version, title, target_path,
  canonical_uri, source_uri, source_name, source_category, authority_level,
  jurisdictions_json, languages_json, captured_at, published_at, content_sha256,
  keywords_json, chunk_count, indexed_at, is_current`;

export function ensureEvidenceSetRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS evidence_sets (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision = 1),
        digest TEXT NOT NULL,
        creator_user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS evidence_set_idempotency (
        workspace_id TEXT NOT NULL,
        creator_user_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_digest TEXT NOT NULL,
        evidence_set_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, creator_user_id, idempotency_key),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY (evidence_set_id) REFERENCES evidence_sets(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_evidence_sets_workspace_created
        ON evidence_sets(workspace_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_evidence_sets_workspace_digest
        ON evidence_sets(workspace_id, digest);
    `);
    database
      .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
      .run(MIGRATION_ID, new Date().toISOString());
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

export class SqliteEvidenceSetRegistryRepository implements EvidenceSetRegistryRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = () => generateEvidenceSetId(),
  ) {
    ensureEvidenceSetRegistry(database);
  }

  create(rawInput: CreateEvidenceSetInput): CreateEvidenceSetResult {
    const input = normalize(rawInput);
    const digest = requestDigest(input);
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const replay = this.database
        .prepare(
          `SELECT request_digest, evidence_set_id FROM evidence_set_idempotency
         WHERE workspace_id = ? AND creator_user_id = ? AND idempotency_key = ?`,
        )
        .get(input.workspaceId, input.creator.userId, input.idempotencyKey) as
        { request_digest: string; evidence_set_id: string } | undefined;
      if (replay) {
        if (replay.request_digest !== digest) {
          throw new RegistryConflictError(
            "EVIDENCE_SET_IDEMPOTENCY_CONFLICT",
            "Evidence Set idempotency key was reused with a different explicit selection or metadata",
          );
        }
        const existing = this.getById(input.workspaceId, replay.evidence_set_id);
        if (!existing)
          throw new RegistryConflictError(
            "EVIDENCE_SET_IDEMPOTENCY_BROKEN",
            "Evidence Set idempotency ledger points to a missing set",
          );
        this.database.exec("COMMIT;");
        return { evidenceSet: existing, replayed: true };
      }

      const members = input.stagingDocumentIds.map((stagingDocumentId, index) =>
        this.resolveMember(input.workspaceId, stagingDocumentId, index + 1),
      );
      const createdAt = this.clock().toISOString();
      const base: Omit<EvidenceSetV1, "digest"> = {
        schemaVersion: EVIDENCE_SET_CONTRACT_VERSION,
        contractVersion: EVIDENCE_SET_CONTRACT_VERSION,
        objectType: "EVIDENCE_SET",
        evidenceSetId: this.idFactory(),
        revision: 1,
        workspaceId: input.workspaceId,
        title: input.title,
        note: input.note,
        ordering: EVIDENCE_SET_ORDERING,
        members,
        creator: input.creator,
        createdAt,
      };
      const evidenceSet: EvidenceSetV1 = { ...base, digest: setDigest(base) };
      if (!isEvidenceSetV1(evidenceSet)) {
        throw new RegistryValidationError("Generated Evidence Set does not satisfy contract v1");
      }
      this.database
        .prepare(
          `INSERT INTO evidence_sets
         (id, workspace_id, revision, digest, creator_user_id, title, document_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          evidenceSet.evidenceSetId,
          evidenceSet.workspaceId,
          evidenceSet.revision,
          evidenceSet.digest,
          evidenceSet.creator.userId,
          evidenceSet.title,
          JSON.stringify(evidenceSet),
          evidenceSet.createdAt,
        );
      this.database
        .prepare(
          `INSERT INTO evidence_set_idempotency
         (workspace_id, creator_user_id, idempotency_key, request_digest, evidence_set_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.workspaceId,
          input.creator.userId,
          input.idempotencyKey,
          digest,
          evidenceSet.evidenceSetId,
          createdAt,
        );
      this.database.exec("COMMIT;");
      return { evidenceSet, replayed: false };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  getById(workspaceIdValue: string, evidenceSetIdValue: string): EvidenceSetV1 | null {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const evidenceSetId = required(evidenceSetIdValue, "evidenceSetId");
    const row = this.database
      .prepare("SELECT document_json FROM evidence_sets WHERE workspace_id = ? AND id = ?")
      .get(workspaceId, evidenceSetId) as { document_json: string } | undefined;
    return row ? parseEvidenceSet(row.document_json) : null;
  }

  list(workspaceIdValue: string, limitValue = 25): EvidenceSetV1[] {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    if (!Number.isSafeInteger(limitValue) || limitValue <= 0) {
      throw new RegistryValidationError("limit must be a positive safe integer");
    }
    const rows = this.database
      .prepare(
        `SELECT document_json FROM evidence_sets
       WHERE workspace_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .all(workspaceId, Math.min(limitValue, MAX_LIST)) as Array<{ document_json: string }>;
    return rows.map((row) => parseEvidenceSet(row.document_json));
  }

  drift(workspaceIdValue: string, evidenceSetIdValue: string): EvidenceSetDriftReportV1 {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const evidenceSet = this.getById(workspaceId, evidenceSetIdValue);
    if (!evidenceSet)
      throw new RegistryError(
        "EVIDENCE_SET_NOT_FOUND",
        `Evidence Set ${evidenceSetIdValue} was not found`,
      );
    const members = evidenceSet.members.map((member) => this.memberDrift(workspaceId, member));
    return {
      schemaVersion: EVIDENCE_SET_CONTRACT_VERSION,
      contractVersion: EVIDENCE_SET_CONTRACT_VERSION,
      objectType: "EVIDENCE_SET_DRIFT_REPORT",
      evidenceSetId: evidenceSet.evidenceSetId,
      revision: evidenceSet.revision,
      workspaceId,
      setDigest: evidenceSet.digest,
      changedCount: members.filter((member) => member.state !== "CURRENT").length,
      members,
      observedAt: this.clock().toISOString(),
    };
  }

  exportById(workspaceId: string, evidenceSetId: string): EvidenceSetExportV1 {
    const evidenceSet = this.getById(workspaceId, evidenceSetId);
    if (!evidenceSet)
      throw new RegistryError(
        "EVIDENCE_SET_NOT_FOUND",
        `Evidence Set ${evidenceSetId} was not found`,
      );
    return evidenceSetExportV1(evidenceSet);
  }

  private resolveMember(
    workspaceId: string,
    stagingDocumentId: string,
    ordinal: number,
  ): EvidenceSetMemberV1 {
    const row = this.database
      .prepare(
        `SELECT ${RETRIEVAL_COLUMNS} FROM retrieval_documents
       WHERE workspace_id = ? AND staging_document_id = ?`,
      )
      .get(workspaceId, stagingDocumentId) as RetrievalRow | undefined;
    if (!row) {
      const other = this.database
        .prepare(
          "SELECT workspace_id FROM retrieval_documents WHERE staging_document_id = ? LIMIT 1",
        )
        .get(stagingDocumentId) as { workspace_id: string } | undefined;
      if (other && other.workspace_id !== workspaceId) {
        throw new RegistryConflictError(
          "EVIDENCE_SET_WORKSPACE_MISMATCH",
          "Selected evidence belongs to another Workspace",
          { stagingDocumentId },
        );
      }
      throw new RegistryConflictError(
        "EVIDENCE_SET_MEMBER_LINEAGE_UNRESOLVED",
        "Selected document does not have exact indexed evidence lineage",
        { stagingDocumentId },
      );
    }
    const retrieval = retrievalDocument(row);
    const artifactRow = this.database
      .prepare("SELECT document_json FROM raw_artifacts WHERE workspace_id = ? AND id = ?")
      .get(workspaceId, retrieval.rawArtifactId) as ArtifactRow | undefined;
    if (!artifactRow) {
      throw new RegistryConflictError(
        "EVIDENCE_SET_RAW_ARTIFACT_MISSING",
        "Selected document points to a missing RawArtifact",
        { stagingDocumentId, rawArtifactId: retrieval.rawArtifactId },
      );
    }
    const artifact = parseArtifact(artifactRow);
    if (
      artifact.workspaceId !== workspaceId ||
      artifact.id !== retrieval.rawArtifactId ||
      artifact.sourceId !== retrieval.sourceId ||
      artifact.version !== retrieval.artifactVersion ||
      (artifact.logicalDocumentId ?? null) !== retrieval.logicalDocumentId
    ) {
      throw new RegistryConflictError(
        "EVIDENCE_SET_MEMBER_LINEAGE_CONFLICT",
        "Selected document and RawArtifact do not agree on exact evidence lineage",
        { stagingDocumentId, rawArtifactId: retrieval.rawArtifactId },
      );
    }
    if (!SHA256.test(retrieval.contentSha256)) {
      throw new RegistryConflictError(
        "EVIDENCE_SET_STAGING_DIGEST_INVALID",
        "Selected indexed document does not carry a valid Staging SHA-256",
      );
    }
    return {
      ordinal,
      documentId: retrieval.documentId,
      stagingDocumentId: retrieval.stagingDocumentId,
      readyPackageId: retrieval.readyPackageId,
      rawArtifactId: retrieval.rawArtifactId,
      logicalDocumentId: retrieval.logicalDocumentId,
      artifactVersion: retrieval.artifactVersion,
      sourceId: retrieval.sourceId,
      sourceName: retrieval.sourceName,
      sourceCategory: retrieval.sourceCategory,
      authorityLevel: retrieval.authorityLevel,
      jurisdictions: [...retrieval.jurisdictions],
      languages: [...retrieval.languages],
      canonicalUri: retrieval.canonicalUri,
      sourceUri: retrieval.sourceUri,
      capturedAt: retrieval.capturedAt,
      publishedAt: retrieval.publishedAt,
      stagingContentSha256: retrieval.contentSha256,
      rawBinarySha256: artifact.binaryHash.value,
      rawContentSha256: artifact.contentHash?.value ?? null,
      rawArtifactStatus: artifact.status,
    };
  }

  private memberDrift(workspaceId: string, member: EvidenceSetMemberV1): EvidenceSetMemberDriftV1 {
    const sourceRow = this.database
      .prepare("SELECT status FROM source_definitions WHERE workspace_id = ? AND id = ?")
      .get(workspaceId, member.sourceId) as { status: string } | undefined;
    if (!sourceRow) {
      return {
        ordinal: member.ordinal,
        stagingDocumentId: member.stagingDocumentId,
        documentId: member.documentId,
        frozenArtifactVersion: member.artifactVersion,
        currentArtifactVersion: null,
        currentStagingDocumentId: null,
        state: "SOURCE_MISSING",
      };
    }
    if (sourceRow.status === "ARCHIVED") {
      return {
        ordinal: member.ordinal,
        stagingDocumentId: member.stagingDocumentId,
        documentId: member.documentId,
        frozenArtifactVersion: member.artifactVersion,
        currentArtifactVersion: null,
        currentStagingDocumentId: null,
        state: "SOURCE_ARCHIVED",
      };
    }
    const artifactRow = this.database
      .prepare("SELECT document_json FROM raw_artifacts WHERE workspace_id = ? AND id = ?")
      .get(workspaceId, member.rawArtifactId) as ArtifactRow | undefined;
    if (!artifactRow) {
      return {
        ordinal: member.ordinal,
        stagingDocumentId: member.stagingDocumentId,
        documentId: member.documentId,
        frozenArtifactVersion: member.artifactVersion,
        currentArtifactVersion: null,
        currentStagingDocumentId: null,
        state: "RAW_ARTIFACT_MISSING",
      };
    }
    const artifact = parseArtifact(artifactRow);
    if (artifact.status === "ARCHIVED") {
      return {
        ordinal: member.ordinal,
        stagingDocumentId: member.stagingDocumentId,
        documentId: member.documentId,
        frozenArtifactVersion: member.artifactVersion,
        currentArtifactVersion: null,
        currentStagingDocumentId: null,
        state: "RAW_ARTIFACT_ARCHIVED",
      };
    }
    const row = this.database
      .prepare(
        `SELECT ${RETRIEVAL_COLUMNS} FROM retrieval_documents
       WHERE workspace_id = ? AND document_id = ? AND is_current = 1
       ORDER BY artifact_version DESC LIMIT 1`,
      )
      .get(workspaceId, member.documentId) as RetrievalRow | undefined;
    if (!row) {
      return {
        ordinal: member.ordinal,
        stagingDocumentId: member.stagingDocumentId,
        documentId: member.documentId,
        frozenArtifactVersion: member.artifactVersion,
        currentArtifactVersion: null,
        currentStagingDocumentId: null,
        state: "CURRENT_DOCUMENT_UNRESOLVED",
      };
    }
    const current = retrievalDocument(row);
    const state =
      current.artifactVersion > member.artifactVersion
        ? ("NEWER_VERSION_AVAILABLE" as const)
        : current.artifactVersion === member.artifactVersion &&
            current.stagingDocumentId === member.stagingDocumentId
          ? ("CURRENT" as const)
          : ("CURRENT_DOCUMENT_UNRESOLVED" as const);
    return {
      ordinal: member.ordinal,
      stagingDocumentId: member.stagingDocumentId,
      documentId: member.documentId,
      frozenArtifactVersion: member.artifactVersion,
      currentArtifactVersion: current.artifactVersion,
      currentStagingDocumentId: current.stagingDocumentId,
      state,
    };
  }
}
