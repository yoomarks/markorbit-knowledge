import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  isCaseEvidenceCollectionV1,
  type CaseCandidateV1,
  type CaseEvidenceCollectionV1,
  type ExactCaseSourcePayloadV1,
} from "@markorbit/contracts";
import {
  ensureCaseCandidateIntakeRegistry,
  SqliteCaseCandidateIntakeRepository,
} from "./case-candidate-intake";
import { RegistryConflictError, RegistryValidationError } from "./index";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export type SaveCaseEvidenceCollectionResult = {
  collection: CaseEvidenceCollectionV1;
  replayed: boolean;
};

type StoredCaseEvidenceCollectionRow = {
  evidence_identity_sha256: string;
  document_sha256: string;
  document_json: string;
};

export function ensureCaseEvidenceCollectionRegistry(database: DatabaseSync): void {
  ensureCaseCandidateIntakeRegistry(database);
  if (INITIALIZED_DATABASES.has(database)) return;
  database.exec(`
    CREATE TABLE IF NOT EXISTS case_evidence_collections (
      collection_id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL,
      evidence_identity_sha256 TEXT NOT NULL CHECK (length(evidence_identity_sha256) = 64),
      document_sha256 TEXT NOT NULL CHECK (length(document_sha256) = 64),
      document_json TEXT NOT NULL,
      collected_at TEXT NOT NULL,
      UNIQUE(candidate_id, evidence_identity_sha256),
      FOREIGN KEY(candidate_id) REFERENCES case_candidates(candidate_id)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS case_evidence_collections_candidate_idx
      ON case_evidence_collections(candidate_id, collected_at ASC, collection_id ASC);
  `);
  INITIALIZED_DATABASES.add(database);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function parseStoredCollection(value: string): CaseEvidenceCollectionV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new RegistryValidationError("Stored Case evidence collection JSON is invalid");
  }
  if (!isCaseEvidenceCollectionV1(parsed)) {
    throw new RegistryValidationError("Stored Case evidence collection is invalid");
  }
  return parsed;
}

function verifyPayload(payload: ExactCaseSourcePayloadV1, label: string): void {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(payload.dataBase64, "base64");
  } catch {
    throw new RegistryValidationError(`${label} exact payload is not valid base64`);
  }
  if (bytes.byteLength !== payload.sizeBytes || sha256(bytes) !== payload.sha256) {
    throw new RegistryValidationError(`${label} exact payload does not match its byte identity`);
  }
}

function verifyExactEvidence(value: CaseEvidenceCollectionV1): void {
  verifyPayload(value.formalMatter, "Formal Matter");
  if (value.lifecycleProvenance) {
    verifyPayload(value.lifecycleProvenance, "Lifecycle provenance");
  }
  for (const item of value.documentPackages) {
    verifyPayload(item.payload, `Document Package ${item.documentPackageId}`);
  }
  if (
    value.lifecycleProvenance &&
    value.omissions.some((item) => item.surface === "LIFECYCLE_PROVENANCE")
  ) {
    throw new RegistryValidationError(
      "Lifecycle provenance cannot be both captured and recorded as omitted",
    );
  }
  if (
    value.documentPackages.length > 0 &&
    value.omissions.some((item) => item.surface === "DOCUMENT_PACKAGES")
  ) {
    throw new RegistryValidationError(
      "Document Packages cannot be both captured and recorded as omitted",
    );
  }
}

function assertCandidateLineage(
  collection: CaseEvidenceCollectionV1,
  candidate: CaseCandidateV1,
): void {
  const source = collection.sourceMatter;
  if (
    collection.candidateId !== candidate.candidateId ||
    source.sourceMatterId !== candidate.sourceMatterId ||
    source.sourceMatterVersion !== candidate.sourceMatterVersion ||
    source.sourceSnapshotSha256 !== candidate.sourceSnapshotSha256 ||
    source.sourceRetrievalRef !== candidate.sourceRetrievalRef ||
    source.sourceWorkspaceId !== candidate.accessScope.sourceWorkspaceId
  ) {
    throw new RegistryConflictError(
      "CASE_EVIDENCE_SOURCE_IDENTITY_MISMATCH",
      "Case evidence collection does not match the durable Case Candidate source identity",
    );
  }
  if (
    collection.documentPackages.some(
      (item) =>
        item.sourceFormalMatterVersion !== candidate.sourceMatterVersion ||
        item.sourceFormalMatterHash !== candidate.sourceSnapshotSha256,
    )
  ) {
    throw new RegistryConflictError(
      "CASE_EVIDENCE_DOCUMENT_LINEAGE_MISMATCH",
      "A captured Document Package does not match the candidate Formal Matter snapshot",
    );
  }
}

function evidenceIdentity(value: CaseEvidenceCollectionV1): string {
  return sha256(
    canonical({
      candidateId: value.candidateId,
      sourceSystem: value.sourceSystem,
      sourceMatter: value.sourceMatter,
      formalMatter: {
        sourceRef: value.formalMatter.sourceRef,
        sha256: value.formalMatter.sha256,
        sizeBytes: value.formalMatter.sizeBytes,
      },
      lifecycleProvenance: value.lifecycleProvenance
        ? {
            sourceRef: value.lifecycleProvenance.sourceRef,
            sha256: value.lifecycleProvenance.sha256,
            sizeBytes: value.lifecycleProvenance.sizeBytes,
          }
        : undefined,
      documentPackages: value.documentPackages.map((item) => ({
        documentPackageId: item.documentPackageId,
        sourceFormalMatterVersion: item.sourceFormalMatterVersion,
        sourceFormalMatterHash: item.sourceFormalMatterHash,
        sourceRef: item.payload.sourceRef,
        sha256: item.payload.sha256,
        sizeBytes: item.payload.sizeBytes,
      })),
      omissions: [...value.omissions].sort((left, right) =>
        left.surface.localeCompare(right.surface),
      ),
      provenance: value.provenance,
    }),
  );
}

export class SqliteCaseEvidenceCollectionRepository {
  private readonly candidates: SqliteCaseCandidateIntakeRepository;

  constructor(private readonly database: DatabaseSync) {
    ensureCaseEvidenceCollectionRegistry(database);
    this.candidates = new SqliteCaseCandidateIntakeRepository(database);
  }

  saveCollection(value: CaseEvidenceCollectionV1): SaveCaseEvidenceCollectionResult {
    if (!isCaseEvidenceCollectionV1(value)) {
      throw new RegistryValidationError("Case evidence collection is invalid");
    }
    verifyExactEvidence(value);
    const candidate = this.candidates.getCandidate(value.candidateId);
    if (!candidate) {
      throw new RegistryValidationError(`Case Candidate ${value.candidateId} does not exist`);
    }
    assertCandidateLineage(value, candidate);

    const identitySha256 = evidenceIdentity(value);
    const documentJson = JSON.stringify(value);
    const documentSha256 = sha256(documentJson);

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const byId = this.database
        .prepare(
          `SELECT evidence_identity_sha256, document_sha256, document_json
             FROM case_evidence_collections
            WHERE collection_id = ?`,
        )
        .get(value.collectionId) as StoredCaseEvidenceCollectionRow | undefined;
      if (byId) {
        const stored = this.attestStoredCollection(byId);
        if (byId.evidence_identity_sha256 !== identitySha256) {
          throw new RegistryConflictError(
            "CASE_EVIDENCE_COLLECTION_IMMUTABLE_CONFLICT",
            `Case evidence collection ${value.collectionId} already exists with different evidence`,
          );
        }
        const result = { collection: stored, replayed: true };
        this.database.exec("COMMIT;");
        return result;
      }

      const byEvidence = this.database
        .prepare(
          `SELECT evidence_identity_sha256, document_sha256, document_json
             FROM case_evidence_collections
            WHERE candidate_id = ? AND evidence_identity_sha256 = ?`,
        )
        .get(value.candidateId, identitySha256) as StoredCaseEvidenceCollectionRow | undefined;
      if (byEvidence) {
        const result = {
          collection: this.attestStoredCollection(byEvidence),
          replayed: true,
        };
        this.database.exec("COMMIT;");
        return result;
      }

      this.database
        .prepare(
          `INSERT INTO case_evidence_collections(
            collection_id, candidate_id, evidence_identity_sha256,
            document_sha256, document_json, collected_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          value.collectionId,
          value.candidateId,
          identitySha256,
          documentSha256,
          documentJson,
          value.collectedAt,
        );
      const result = { collection: value, replayed: false };
      this.database.exec("COMMIT;");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  getCollection(collectionId: string): CaseEvidenceCollectionV1 | null {
    const row = this.database
      .prepare(
        `SELECT evidence_identity_sha256, document_sha256, document_json
           FROM case_evidence_collections
          WHERE collection_id = ?`,
      )
      .get(collectionId) as StoredCaseEvidenceCollectionRow | undefined;
    return row ? this.attestStoredCollection(row) : null;
  }

  listCollectionsForCandidate(candidateId: string): CaseEvidenceCollectionV1[] {
    const rows = this.database
      .prepare(
        `SELECT evidence_identity_sha256, document_sha256, document_json
           FROM case_evidence_collections
          WHERE candidate_id = ?
          ORDER BY collected_at ASC, collection_id ASC`,
      )
      .all(candidateId) as StoredCaseEvidenceCollectionRow[];
    return rows.map((row) => this.attestStoredCollection(row));
  }

  private attestStoredCollection(row: StoredCaseEvidenceCollectionRow): CaseEvidenceCollectionV1 {
    if (sha256(row.document_json) !== row.document_sha256) {
      throw new RegistryConflictError(
        "CASE_EVIDENCE_COLLECTION_STORAGE_HASH_MISMATCH",
        "Stored Case evidence collection document does not match its durable hash",
      );
    }
    const collection = parseStoredCollection(row.document_json);
    verifyExactEvidence(collection);
    if (evidenceIdentity(collection) !== row.evidence_identity_sha256) {
      throw new RegistryConflictError(
        "CASE_EVIDENCE_COLLECTION_STORAGE_IDENTITY_MISMATCH",
        "Stored Case evidence collection does not match its durable evidence identity",
      );
    }
    const candidate = this.candidates.getCandidate(collection.candidateId);
    if (!candidate) {
      throw new RegistryConflictError(
        "CASE_EVIDENCE_COLLECTION_CANDIDATE_MISSING",
        `Stored Case evidence collection ${collection.collectionId} references a missing Candidate`,
      );
    }
    assertCandidateLineage(collection, candidate);
    return collection;
  }
}
