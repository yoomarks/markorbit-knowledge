import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  isCaseDossierV1,
  type CaseDossierEvidenceRefV1,
  type CaseDossierV1,
  type CaseEvidenceCollectionV1,
} from "@markorbit/contracts";
import {
  ensureCaseEvidenceCollectionRegistry,
  SqliteCaseEvidenceCollectionRepository,
} from "./case-evidence-collection";
import { SqliteCaseCandidateIntakeRepository } from "./case-candidate-intake";
import { RegistryConflictError, RegistryValidationError } from "./index";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export type SaveCaseDossierResult = {
  dossier: CaseDossierV1;
  replayed: boolean;
};

type StoredCaseDossierRow = {
  document_sha256: string;
  document_json: string;
};

export function ensureCaseDossierRegistry(database: DatabaseSync): void {
  ensureCaseEvidenceCollectionRegistry(database);
  if (INITIALIZED_DATABASES.has(database)) return;
  database.exec(`
    CREATE TABLE IF NOT EXISTS case_dossiers (
      dossier_id TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version >= 1),
      candidate_id TEXT NOT NULL,
      evidence_collection_id TEXT NOT NULL,
      document_sha256 TEXT NOT NULL CHECK (length(document_sha256) = 64),
      document_json TEXT NOT NULL,
      dossier_state TEXT NOT NULL,
      assembled_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(dossier_id, version),
      UNIQUE(candidate_id, evidence_collection_id, version),
      FOREIGN KEY(candidate_id) REFERENCES case_candidates(candidate_id),
      FOREIGN KEY(evidence_collection_id) REFERENCES case_evidence_collections(collection_id)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS case_dossiers_candidate_idx
      ON case_dossiers(candidate_id, version DESC, assembled_at DESC, dossier_id ASC);
  `);
  INITIALIZED_DATABASES.add(database);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
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

function parseStoredDossier(value: string): CaseDossierV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new RegistryValidationError("Stored Case Dossier JSON is invalid");
  }
  if (!isCaseDossierV1(parsed)) {
    throw new RegistryValidationError("Stored Case Dossier is invalid");
  }
  return parsed;
}

function evidenceKey(value: CaseDossierEvidenceRefV1): string {
  return [
    value.collectionId,
    value.surface,
    value.sourceRef,
    value.sha256,
    value.documentPackageId ?? "",
  ].join("\u001f");
}

function allowedEvidence(collection: CaseEvidenceCollectionV1): Set<string> {
  const values: CaseDossierEvidenceRefV1[] = [
    {
      collectionId: collection.collectionId,
      surface: "FORMAL_MATTER",
      sourceRef: collection.formalMatter.sourceRef,
      sha256: collection.formalMatter.sha256,
    },
  ];
  if (collection.lifecycleProvenance) {
    values.push({
      collectionId: collection.collectionId,
      surface: "LIFECYCLE_PROVENANCE",
      sourceRef: collection.lifecycleProvenance.sourceRef,
      sha256: collection.lifecycleProvenance.sha256,
    });
  }
  for (const item of collection.documentPackages) {
    values.push({
      collectionId: collection.collectionId,
      surface: "DOCUMENT_PACKAGE",
      sourceRef: item.payload.sourceRef,
      sha256: item.payload.sha256,
      documentPackageId: item.documentPackageId,
    });
  }
  return new Set(values.map(evidenceKey));
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function collectEvidenceRefs(
  value: unknown,
  output: CaseDossierEvidenceRefV1[] = [],
): CaseDossierEvidenceRefV1[] {
  if (Array.isArray(value)) {
    for (const item of value) collectEvidenceRefs(item, output);
    return output;
  }
  const item = record(value);
  if (!item) return output;
  if (
    typeof item.collectionId === "string" &&
    typeof item.surface === "string" &&
    typeof item.sourceRef === "string" &&
    typeof item.sha256 === "string"
  ) {
    output.push(item as unknown as CaseDossierEvidenceRefV1);
    return output;
  }
  for (const nested of Object.values(item)) collectEvidenceRefs(nested, output);
  return output;
}

function assertSourceLineage(
  dossier: CaseDossierV1,
  collection: CaseEvidenceCollectionV1,
  candidates: SqliteCaseCandidateIntakeRepository,
): void {
  const candidate = candidates.getCandidate(dossier.candidateId);
  if (!candidate) {
    throw new RegistryValidationError(`Case Candidate ${dossier.candidateId} does not exist`);
  }
  const intake = candidates.getIntake(dossier.candidateId);
  if (
    !intake ||
    intake.collectionState !== "COLLECTED" ||
    intake.collectionRef !== dossier.evidenceCollectionId
  ) {
    throw new RegistryConflictError(
      "CASE_DOSSIER_COLLECTION_NOT_ACCEPTED",
      "Case Dossier requires the Candidate to point at the same completed evidence collection",
    );
  }
  if (
    collection.candidateId !== candidate.candidateId ||
    dossier.evidenceCollectionId !== collection.collectionId ||
    dossier.sourceMatter.sourceMatterId !== candidate.sourceMatterId ||
    dossier.sourceMatter.sourceMatterVersion !== candidate.sourceMatterVersion ||
    dossier.sourceMatter.sourceSnapshotSha256 !== candidate.sourceSnapshotSha256 ||
    dossier.sourceMatter.sourceWorkspaceId !== candidate.accessScope.sourceWorkspaceId ||
    dossier.accessClassification !== candidate.accessScope.classification
  ) {
    throw new RegistryConflictError(
      "CASE_DOSSIER_SOURCE_LINEAGE_MISMATCH",
      "Case Dossier does not match its durable Candidate and evidence source lineage",
    );
  }

  const allowed = allowedEvidence(collection);
  for (const evidence of collectEvidenceRefs(dossier)) {
    if (!allowed.has(evidenceKey(evidence))) {
      throw new RegistryConflictError(
        "CASE_DOSSIER_EVIDENCE_REF_MISMATCH",
        "Case Dossier contains an evidence reference not present in its immutable collection",
      );
    }
  }
}

export class SqliteCaseDossierRepository {
  private readonly candidates: SqliteCaseCandidateIntakeRepository;
  private readonly evidence: SqliteCaseEvidenceCollectionRepository;

  constructor(private readonly database: DatabaseSync) {
    ensureCaseDossierRegistry(database);
    this.candidates = new SqliteCaseCandidateIntakeRepository(database);
    this.evidence = new SqliteCaseEvidenceCollectionRepository(database);
  }

  saveDossier(value: CaseDossierV1): SaveCaseDossierResult {
    if (!isCaseDossierV1(value)) {
      throw new RegistryValidationError("Case Dossier is invalid");
    }
    const collection = this.evidence.getCollection(value.evidenceCollectionId);
    if (!collection) {
      throw new RegistryValidationError(
        `Case evidence collection ${value.evidenceCollectionId} does not exist`,
      );
    }
    assertSourceLineage(value, collection, this.candidates);

    if (value.version === 1 && value.supersedesDossierVersion !== undefined) {
      throw new RegistryConflictError(
        "CASE_DOSSIER_VERSION_LINEAGE_INVALID",
        "Case Dossier version 1 cannot supersede an earlier version",
      );
    }
    if (value.version > 1) {
      if (value.supersedesDossierVersion === undefined) {
        throw new RegistryConflictError(
          "CASE_DOSSIER_VERSION_LINEAGE_INVALID",
          "A later Case Dossier version must identify the version it supersedes",
        );
      }
      const prior = this.getDossier(value.dossierId, value.supersedesDossierVersion);
      if (!prior) {
        throw new RegistryConflictError(
          "CASE_DOSSIER_SUPERSEDED_VERSION_MISSING",
          "The referenced superseded Case Dossier version does not exist",
        );
      }
      if (
        prior.candidateId !== value.candidateId ||
        prior.evidenceCollectionId !== value.evidenceCollectionId
      ) {
        throw new RegistryConflictError(
          "CASE_DOSSIER_VERSION_LINEAGE_INVALID",
          "Case Dossier versions cannot cross Candidate or evidence collection lineage",
        );
      }
    }

    const documentJson = JSON.stringify(value);
    const documentSha256 = sha256(canonical(value));

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const byId = this.database
        .prepare(
          `SELECT document_sha256, document_json
             FROM case_dossiers
            WHERE dossier_id = ? AND version = ?`,
        )
        .get(value.dossierId, value.version) as StoredCaseDossierRow | undefined;
      if (byId) {
        const stored = this.attestStoredDossier(byId);
        if (byId.document_sha256 !== documentSha256) {
          throw new RegistryConflictError(
            "CASE_DOSSIER_IMMUTABLE_CONFLICT",
            `Case Dossier ${value.dossierId} version ${value.version} already exists with different content`,
          );
        }
        const result = { dossier: stored, replayed: true };
        this.database.exec("COMMIT;");
        return result;
      }

      const bySource = this.database
        .prepare(
          `SELECT document_sha256, document_json
             FROM case_dossiers
            WHERE candidate_id = ? AND evidence_collection_id = ? AND version = ?`,
        )
        .get(value.candidateId, value.evidenceCollectionId, value.version) as
        StoredCaseDossierRow | undefined;
      if (bySource) {
        const stored = this.attestStoredDossier(bySource);
        if (bySource.document_sha256 !== documentSha256) {
          throw new RegistryConflictError(
            "CASE_DOSSIER_SOURCE_VERSION_CONFLICT",
            "The same Candidate/evidence collection/version already produced different dossier content",
          );
        }
        const result = { dossier: stored, replayed: true };
        this.database.exec("COMMIT;");
        return result;
      }

      this.database
        .prepare(
          `INSERT INTO case_dossiers(
            dossier_id, version, candidate_id, evidence_collection_id,
            document_sha256, document_json, dossier_state, assembled_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          value.dossierId,
          value.version,
          value.candidateId,
          value.evidenceCollectionId,
          documentSha256,
          documentJson,
          value.state,
          value.assembledAt,
          value.updatedAt,
        );
      const result = { dossier: value, replayed: false };
      this.database.exec("COMMIT;");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  getDossier(dossierId: string, version?: number): CaseDossierV1 | null {
    const row =
      version === undefined
        ? (this.database
            .prepare(
              `SELECT document_sha256, document_json
                 FROM case_dossiers
                WHERE dossier_id = ?
                ORDER BY version DESC
                LIMIT 1`,
            )
            .get(dossierId) as StoredCaseDossierRow | undefined)
        : (this.database
            .prepare(
              `SELECT document_sha256, document_json
                 FROM case_dossiers
                WHERE dossier_id = ? AND version = ?`,
            )
            .get(dossierId, version) as StoredCaseDossierRow | undefined);
    return row ? this.attestStoredDossier(row) : null;
  }

  listDossiersForCandidate(candidateId: string): CaseDossierV1[] {
    const rows = this.database
      .prepare(
        `SELECT document_sha256, document_json
           FROM case_dossiers
          WHERE candidate_id = ?
          ORDER BY version DESC, assembled_at DESC, dossier_id ASC`,
      )
      .all(candidateId) as StoredCaseDossierRow[];
    return rows.map((row) => this.attestStoredDossier(row));
  }

  private attestStoredDossier(row: StoredCaseDossierRow): CaseDossierV1 {
    const dossier = parseStoredDossier(row.document_json);
    if (sha256(canonical(dossier)) !== row.document_sha256) {
      throw new RegistryConflictError(
        "CASE_DOSSIER_STORAGE_HASH_MISMATCH",
        "Stored Case Dossier document does not match its durable hash",
      );
    }
    const collection = this.evidence.getCollection(dossier.evidenceCollectionId);
    if (!collection) {
      throw new RegistryConflictError(
        "CASE_DOSSIER_EVIDENCE_COLLECTION_MISSING",
        `Stored Case Dossier ${dossier.dossierId} references a missing evidence collection`,
      );
    }
    assertSourceLineage(dossier, collection, this.candidates);
    return dossier;
  }
}
