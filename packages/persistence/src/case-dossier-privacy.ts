import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  isCaseDossierPrivacyReviewV1,
  isCaseDossierRedactedDerivativeV1,
  type CaseDossierPrivacyReviewV1,
  type CaseDossierRedactedDerivativeV1,
} from "@markorbit/contracts";
import { ensureCaseDossierRegistry, SqliteCaseDossierRepository } from "./case-dossier";
import { RegistryConflictError, RegistryValidationError } from "./index";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export type CaseDossierPrivacyReviewEvent = {
  revision: number;
  eventType: "OPENED" | "NEEDS_REDACTION" | "FINALIZED" | "REJECTED";
  review: CaseDossierPrivacyReviewV1;
  recordedAt: string;
};

export type SaveCaseDossierPrivacyReviewResult = {
  review: CaseDossierPrivacyReviewV1;
  revision: number;
  replayed: boolean;
};

export type SaveCaseDossierRedactedDerivativeResult = {
  derivative: CaseDossierRedactedDerivativeV1;
  replayed: boolean;
};

type ReviewRow = {
  review_id: string;
  dossier_id: string;
  dossier_version: number;
  revision: number;
  state: string;
  document_sha256: string;
  document_json: string;
};

export function ensureCaseDossierPrivacyRegistry(database: DatabaseSync): void {
  ensureCaseDossierRegistry(database);
  if (INITIALIZED_DATABASES.has(database)) return;
  database.exec(`
    CREATE TABLE IF NOT EXISTS case_dossier_privacy_reviews (
      review_id TEXT PRIMARY KEY,
      dossier_id TEXT NOT NULL,
      dossier_version INTEGER NOT NULL CHECK (dossier_version >= 1),
      revision INTEGER NOT NULL CHECK (revision >= 1),
      state TEXT NOT NULL CHECK (state IN ('REVIEW_REQUIRED', 'NEEDS_REDACTION', 'FINALIZED', 'REJECTED')),
      source_access_classification TEXT NOT NULL,
      audience_access_classification TEXT NOT NULL,
      document_sha256 TEXT NOT NULL CHECK (length(document_sha256) = 64),
      document_json TEXT NOT NULL,
      opened_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(dossier_id, dossier_version),
      FOREIGN KEY(dossier_id, dossier_version) REFERENCES case_dossiers(dossier_id, version)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS case_dossier_privacy_review_events (
      review_id TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision >= 1),
      event_type TEXT NOT NULL CHECK (event_type IN ('OPENED', 'NEEDS_REDACTION', 'FINALIZED', 'REJECTED')),
      document_sha256 TEXT NOT NULL CHECK (length(document_sha256) = 64),
      document_json TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      PRIMARY KEY(review_id, revision),
      FOREIGN KEY(review_id) REFERENCES case_dossier_privacy_reviews(review_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS case_dossier_redacted_derivatives (
      derivative_id TEXT PRIMARY KEY,
      source_dossier_id TEXT NOT NULL,
      source_dossier_version INTEGER NOT NULL CHECK (source_dossier_version >= 1),
      review_id TEXT NOT NULL UNIQUE,
      access_classification TEXT NOT NULL,
      document_sha256 TEXT NOT NULL CHECK (length(document_sha256) = 64),
      document_json TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      FOREIGN KEY(review_id) REFERENCES case_dossier_privacy_reviews(review_id),
      FOREIGN KEY(source_dossier_id, source_dossier_version)
        REFERENCES case_dossiers(dossier_id, version)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS case_dossier_privacy_review_state_idx
      ON case_dossier_privacy_reviews(state, updated_at ASC, review_id ASC);
  `);
  INITIALIZED_DATABASES.add(database);
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

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function documentSha256(value: unknown): string {
  return sha256(canonical(value));
}

function parseReview(value: string): CaseDossierPrivacyReviewV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new RegistryValidationError("Stored Case Dossier privacy review JSON is invalid");
  }
  if (!isCaseDossierPrivacyReviewV1(parsed)) {
    throw new RegistryValidationError("Stored Case Dossier privacy review is invalid");
  }
  return parsed;
}

function parseDerivative(value: string): CaseDossierRedactedDerivativeV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new RegistryValidationError("Stored Case Dossier redacted derivative JSON is invalid");
  }
  if (!isCaseDossierRedactedDerivativeV1(parsed)) {
    throw new RegistryValidationError("Stored Case Dossier redacted derivative is invalid");
  }
  return parsed;
}

function eventType(review: CaseDossierPrivacyReviewV1): CaseDossierPrivacyReviewEvent["eventType"] {
  return review.state === "REVIEW_REQUIRED" ? "OPENED" : review.state;
}

function assertReviewLineage(
  existing: CaseDossierPrivacyReviewV1,
  incoming: CaseDossierPrivacyReviewV1,
): void {
  if (
    existing.reviewId !== incoming.reviewId ||
    existing.dossierId !== incoming.dossierId ||
    existing.dossierVersion !== incoming.dossierVersion ||
    existing.sourceAccessClassification !== incoming.sourceAccessClassification ||
    existing.audienceAccessClassification !== incoming.audienceAccessClassification ||
    existing.reviewerRef !== incoming.reviewerRef ||
    existing.openedAt !== incoming.openedAt ||
    canonical(existing.audienceExpansionApproval) !== canonical(incoming.audienceExpansionApproval)
  ) {
    throw new RegistryConflictError(
      "CASE_DOSSIER_PRIVACY_REVIEW_LINEAGE_CONFLICT",
      "Case Dossier privacy review lineage cannot change after the review is opened",
    );
  }
}

function transitionAllowed(
  current: CaseDossierPrivacyReviewV1["state"],
  next: CaseDossierPrivacyReviewV1["state"],
): boolean {
  if (current === "REVIEW_REQUIRED") {
    return next === "NEEDS_REDACTION" || next === "FINALIZED" || next === "REJECTED";
  }
  if (current === "NEEDS_REDACTION") return next === "FINALIZED" || next === "REJECTED";
  return false;
}

export class SqliteCaseDossierPrivacyRepository {
  private readonly dossiers: SqliteCaseDossierRepository;

  constructor(private readonly database: DatabaseSync) {
    ensureCaseDossierPrivacyRegistry(database);
    this.dossiers = new SqliteCaseDossierRepository(database);
  }

  openReview(value: CaseDossierPrivacyReviewV1): SaveCaseDossierPrivacyReviewResult {
    if (!isCaseDossierPrivacyReviewV1(value) || value.state !== "REVIEW_REQUIRED") {
      throw new RegistryValidationError(
        "A valid REVIEW_REQUIRED Case Dossier privacy review is required",
      );
    }
    const dossier = this.dossiers.getDossier(value.dossierId, value.dossierVersion);
    if (!dossier) {
      throw new RegistryValidationError(
        `Case Dossier ${value.dossierId} version ${value.dossierVersion} does not exist`,
      );
    }
    if (dossier.accessClassification !== value.sourceAccessClassification) {
      throw new RegistryConflictError(
        "CASE_DOSSIER_PRIVACY_SOURCE_ACCESS_MISMATCH",
        "Privacy review source access classification does not match the source Dossier",
      );
    }

    const existing = this.getReview(value.reviewId);
    if (existing) {
      assertReviewLineage(existing.review, value);
      return { ...existing, replayed: true };
    }
    const byDossier = this.database
      .prepare(
        `SELECT review_id
           FROM case_dossier_privacy_reviews
          WHERE dossier_id = ? AND dossier_version = ?`,
      )
      .get(value.dossierId, value.dossierVersion) as { review_id: string } | undefined;
    if (byDossier) {
      throw new RegistryConflictError(
        "CASE_DOSSIER_PRIVACY_REVIEW_ALREADY_EXISTS",
        "The Case Dossier version already has a privacy review lineage",
        { reviewId: byDossier.review_id },
      );
    }

    const json = JSON.stringify(value);
    const hash = documentSha256(value);
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database
        .prepare(
          `INSERT INTO case_dossier_privacy_reviews(
            review_id, dossier_id, dossier_version, revision, state,
            source_access_classification, audience_access_classification,
            document_sha256, document_json, opened_at, updated_at
          ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          value.reviewId,
          value.dossierId,
          value.dossierVersion,
          value.state,
          value.sourceAccessClassification,
          value.audienceAccessClassification,
          hash,
          json,
          value.openedAt,
          value.openedAt,
        );
      this.database
        .prepare(
          `INSERT INTO case_dossier_privacy_review_events(
            review_id, revision, event_type, document_sha256, document_json, recorded_at
          ) VALUES (?, 1, 'OPENED', ?, ?, ?)`,
        )
        .run(value.reviewId, hash, json, value.openedAt);
      this.database.exec("COMMIT;");
      return { review: value, revision: 1, replayed: false };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  recordDecision(value: CaseDossierPrivacyReviewV1): SaveCaseDossierPrivacyReviewResult {
    if (!isCaseDossierPrivacyReviewV1(value) || value.state === "REVIEW_REQUIRED") {
      throw new RegistryValidationError("A decided Case Dossier privacy review is required");
    }
    const current = this.getReview(value.reviewId);
    if (!current) {
      throw new RegistryValidationError(
        `Case Dossier privacy review ${value.reviewId} does not exist`,
      );
    }
    assertReviewLineage(current.review, value);
    const incomingHash = documentSha256(value);
    const currentHash = documentSha256(current.review);
    if (incomingHash === currentHash) return { ...current, replayed: true };
    if (!transitionAllowed(current.review.state, value.state)) {
      throw new RegistryConflictError(
        "CASE_DOSSIER_PRIVACY_TRANSITION_INVALID",
        `Privacy review cannot transition from ${current.review.state} to ${value.state}`,
      );
    }
    const revision = current.revision + 1;
    const json = JSON.stringify(value);
    const recordedAt = value.decidedAt!;

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database
        .prepare(
          `INSERT INTO case_dossier_privacy_review_events(
            review_id, revision, event_type, document_sha256, document_json, recorded_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(value.reviewId, revision, eventType(value), incomingHash, json, recordedAt);
      this.database
        .prepare(
          `UPDATE case_dossier_privacy_reviews
              SET revision = ?, state = ?, document_sha256 = ?, document_json = ?, updated_at = ?
            WHERE review_id = ? AND revision = ?`,
        )
        .run(
          revision,
          value.state,
          incomingHash,
          json,
          recordedAt,
          value.reviewId,
          current.revision,
        );
      this.database.exec("COMMIT;");
      return { review: value, revision, replayed: false };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  saveDerivative(value: CaseDossierRedactedDerivativeV1): SaveCaseDossierRedactedDerivativeResult {
    if (!isCaseDossierRedactedDerivativeV1(value)) {
      throw new RegistryValidationError("Case Dossier redacted derivative is invalid");
    }
    if (value.contentSha256 !== sha256(canonical(value.content))) {
      throw new RegistryValidationError(
        "Case Dossier redacted derivative contentSha256 does not match its audience content",
      );
    }
    const review = this.getReview(value.reviewId);
    if (!review || review.review.state !== "FINALIZED") {
      throw new RegistryConflictError(
        "CASE_DOSSIER_PRIVACY_REVIEW_NOT_FINALIZED",
        "A finalized privacy review is required before saving a redacted derivative",
      );
    }
    if (
      review.review.derivativeId !== value.derivativeId ||
      review.review.dossierId !== value.sourceDossierId ||
      review.review.dossierVersion !== value.sourceDossierVersion ||
      review.review.audienceAccessClassification !== value.accessClassification
    ) {
      throw new RegistryConflictError(
        "CASE_DOSSIER_REDACTED_DERIVATIVE_LINEAGE_MISMATCH",
        "Redacted derivative does not match its finalized privacy review lineage",
      );
    }
    const dossier = this.dossiers.getDossier(value.sourceDossierId, value.sourceDossierVersion);
    if (!dossier) {
      throw new RegistryValidationError("Source Case Dossier for redacted derivative is missing");
    }

    const json = JSON.stringify(value);
    const hash = documentSha256(value);
    const existing = this.getDerivative(value.derivativeId);
    if (existing) {
      if (documentSha256(existing) !== hash) {
        throw new RegistryConflictError(
          "CASE_DOSSIER_REDACTED_DERIVATIVE_IMMUTABLE_CONFLICT",
          `Redacted derivative ${value.derivativeId} already exists with different content`,
        );
      }
      return { derivative: existing, replayed: true };
    }

    const existingByReview = this.database
      .prepare(
        `SELECT document_json
           FROM case_dossier_redacted_derivatives
          WHERE review_id = ?`,
      )
      .get(value.reviewId) as { document_json: string } | undefined;
    if (existingByReview) {
      const stored = parseDerivative(existingByReview.document_json);
      if (documentSha256(stored) !== hash) {
        throw new RegistryConflictError(
          "CASE_DOSSIER_REDACTED_DERIVATIVE_REVIEW_CONFLICT",
          "The finalized privacy review already produced a different derivative",
        );
      }
      return { derivative: stored, replayed: true };
    }

    this.database
      .prepare(
        `INSERT INTO case_dossier_redacted_derivatives(
          derivative_id, source_dossier_id, source_dossier_version, review_id,
          access_classification, document_sha256, document_json, generated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        value.derivativeId,
        value.sourceDossierId,
        value.sourceDossierVersion,
        value.reviewId,
        value.accessClassification,
        hash,
        json,
        value.generatedAt,
      );
    return { derivative: value, replayed: false };
  }

  getReview(reviewId: string): { review: CaseDossierPrivacyReviewV1; revision: number } | null {
    const row = this.database
      .prepare(
        `SELECT review_id, dossier_id, dossier_version, revision, state,
                document_sha256, document_json
           FROM case_dossier_privacy_reviews
          WHERE review_id = ?`,
      )
      .get(reviewId) as ReviewRow | undefined;
    return row ? { review: parseReview(row.document_json), revision: row.revision } : null;
  }

  getReviewForDossier(
    dossierId: string,
    dossierVersion: number,
  ): { review: CaseDossierPrivacyReviewV1; revision: number } | null {
    const row = this.database
      .prepare(
        `SELECT review_id, dossier_id, dossier_version, revision, state,
                document_sha256, document_json
           FROM case_dossier_privacy_reviews
          WHERE dossier_id = ? AND dossier_version = ?`,
      )
      .get(dossierId, dossierVersion) as ReviewRow | undefined;
    return row ? { review: parseReview(row.document_json), revision: row.revision } : null;
  }

  listReviewEvents(reviewId: string): CaseDossierPrivacyReviewEvent[] {
    const rows = this.database
      .prepare(
        `SELECT revision, event_type, document_json, recorded_at
           FROM case_dossier_privacy_review_events
          WHERE review_id = ?
          ORDER BY revision ASC`,
      )
      .all(reviewId) as {
      revision: number;
      event_type: CaseDossierPrivacyReviewEvent["eventType"];
      document_json: string;
      recorded_at: string;
    }[];
    return rows.map((row) => ({
      revision: row.revision,
      eventType: row.event_type,
      review: parseReview(row.document_json),
      recordedAt: row.recorded_at,
    }));
  }

  getDerivative(derivativeId: string): CaseDossierRedactedDerivativeV1 | null {
    const row = this.database
      .prepare(
        `SELECT document_json
           FROM case_dossier_redacted_derivatives
          WHERE derivative_id = ?`,
      )
      .get(derivativeId) as { document_json: string } | undefined;
    return row ? parseDerivative(row.document_json) : null;
  }

  getDerivativeForReview(reviewId: string): CaseDossierRedactedDerivativeV1 | null {
    const row = this.database
      .prepare(
        `SELECT document_json
           FROM case_dossier_redacted_derivatives
          WHERE review_id = ?`,
      )
      .get(reviewId) as { document_json: string } | undefined;
    return row ? parseDerivative(row.document_json) : null;
  }
}
