import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  CANDIDATE_OBSERVATION_VERSION,
  type CandidateChangeObservationV1,
  type CandidateObservationBatchSummaryV1,
  type CandidateObservationDelta,
  type CandidateObservationEvidenceKind,
  type SourceCandidate,
  type SourceCandidateStatus,
} from "@markorbit/contracts";
import { initializeRegistry, RegistryValidationError } from "./index";

const MIGRATION_ID = "1002_source_candidate_observations";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export type CandidateObservationRecordInput = {
  batchId: string;
  candidate: SourceCandidate;
  previousCandidate?: SourceCandidate;
  candidateStatusAtObservation?: SourceCandidateStatus;
  observedAt?: string;
};

function metadataString(candidate: SourceCandidate, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = candidate.metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function metadataBoolean(candidate: SourceCandidate, key: string): boolean | undefined {
  const value = candidate.metadata?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function stableJson(value: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

function observedFacts(candidate: SourceCandidate): CandidateChangeObservationV1["facts"] {
  const kind = metadataString(candidate, "kind");
  const host = metadataString(candidate, "host");
  const contentSha256 = metadataString(
    candidate,
    "contentSha256",
    "observedContentSha256",
    "bodySha256",
  );
  const httpEtag = metadataString(candidate, "httpEtag", "etag");
  const httpLastModified = metadataString(candidate, "httpLastModified", "lastModified");
  const httpContentType = metadataString(candidate, "httpContentType", "contentType");
  const robotsAllowed = metadataBoolean(candidate, "robotsAllowed");
  return {
    ...(candidate.title ? { title: candidate.title } : {}),
    ...(kind ? { kind } : {}),
    ...(host ? { host } : {}),
    ...(robotsAllowed !== undefined ? { robotsAllowed } : {}),
    ...(contentSha256 ? { contentSha256 } : {}),
    ...(httpEtag ? { httpEtag } : {}),
    ...(httpLastModified ? { httpLastModified } : {}),
    ...(httpContentType ? { httpContentType } : {}),
  };
}

function evidenceFor(candidate: SourceCandidate): {
  evidenceKind: CandidateObservationEvidenceKind;
  fingerprint: string;
  facts: CandidateChangeObservationV1["facts"];
} {
  const facts = observedFacts(candidate);
  if (facts.contentSha256) {
    return {
      evidenceKind: "CONTENT_SHA256",
      fingerprint: facts.contentSha256.toLowerCase(),
      facts,
    };
  }

  const hasHttpMetadata = Boolean(
    facts.httpEtag || facts.httpLastModified || facts.httpContentType,
  );
  const payload = stableJson({ locator: candidate.locator, ...facts });
  return {
    evidenceKind: hasHttpMetadata ? "HTTP_METADATA" : "STRUCTURAL",
    fingerprint: createHash("sha256").update(payload).digest("hex"),
    facts,
  };
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value < 1) {
    throw new RegistryValidationError("limit must be a positive integer");
  }
  return Math.min(value, MAX_LIMIT);
}

function parseObservation(row: Record<string, unknown>): CandidateChangeObservationV1 {
  return JSON.parse(String(row.document_json)) as CandidateChangeObservationV1;
}

function ensureMigration(database: DatabaseSync): void {
  initializeRegistry(database);
  const applied = database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID);
  if (applied) return;

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS source_candidate_observations (
        observation_id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL,
        locator TEXT NOT NULL,
        batch_id TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        evidence_kind TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        delta TEXT NOT NULL,
        previous_observation_id TEXT,
        document_json TEXT NOT NULL,
        FOREIGN KEY (candidate_id) REFERENCES source_candidates(candidate_id),
        FOREIGN KEY (batch_id) REFERENCES discovery_batches(batch_id)
      ) STRICT;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_observations_batch_candidate
        ON source_candidate_observations(batch_id, candidate_id);
      CREATE INDEX IF NOT EXISTS idx_candidate_observations_candidate_time
        ON source_candidate_observations(candidate_id, observed_at DESC, observation_id DESC);
      CREATE INDEX IF NOT EXISTS idx_candidate_observations_delta_time
        ON source_candidate_observations(delta, observed_at DESC, observation_id DESC);
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

export class SqliteSourceCandidateObservationRepository {
  constructor(private readonly database: DatabaseSync) {
    ensureMigration(database);
  }

  latest(candidateId: string): CandidateChangeObservationV1 | null {
    const row = this.database
      .prepare(
        `SELECT * FROM source_candidate_observations
         WHERE candidate_id = ?
         ORDER BY observed_at DESC, observation_id DESC
         LIMIT 1`,
      )
      .get(candidateId) as Record<string, unknown> | undefined;
    return row ? parseObservation(row) : null;
  }

  previous(observationId: string): CandidateChangeObservationV1 | null {
    const current = this.database
      .prepare("SELECT previous_observation_id FROM source_candidate_observations WHERE observation_id = ?")
      .get(observationId) as { previous_observation_id?: string | null } | undefined;
    if (!current?.previous_observation_id) return null;
    const row = this.database
      .prepare("SELECT * FROM source_candidate_observations WHERE observation_id = ?")
      .get(current.previous_observation_id) as Record<string, unknown> | undefined;
    return row ? parseObservation(row) : null;
  }

  list(input: { candidateId?: string; delta?: CandidateObservationDelta; limit?: number } = {}): CandidateChangeObservationV1[] {
    const clauses: string[] = [];
    const values: string[] = [];
    if (input.candidateId) {
      clauses.push("candidate_id = ?");
      values.push(input.candidateId);
    }
    if (input.delta) {
      clauses.push("delta = ?");
      values.push(input.delta);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.database
      .prepare(
        `SELECT * FROM source_candidate_observations
         ${where}
         ORDER BY observed_at DESC, observation_id DESC
         LIMIT ?`,
      )
      .all(...values, normalizeLimit(input.limit))
      .map((row) => parseObservation(row as Record<string, unknown>));
  }

  record(input: CandidateObservationRecordInput): CandidateChangeObservationV1 {
    const existingForBatch = this.database
      .prepare(
        "SELECT * FROM source_candidate_observations WHERE batch_id = ? AND candidate_id = ?",
      )
      .get(input.batchId, input.candidate.candidateId) as Record<string, unknown> | undefined;
    if (existingForBatch) return parseObservation(existingForBatch);

    const latest = this.latest(input.candidate.candidateId);
    const currentEvidence = evidenceFor(input.candidate);
    const previousEvidence = latest
      ? { fingerprint: latest.fingerprint }
      : input.previousCandidate
        ? evidenceFor(input.previousCandidate)
        : null;
    const status = input.candidateStatusAtObservation ?? input.candidate.status;
    let delta: CandidateObservationDelta;
    if (!previousEvidence) delta = "NEW";
    else if (previousEvidence.fingerprint === currentEvidence.fingerprint) delta = "KNOWN";
    else delta = status === "REJECTED" ? "REJECTED_CHANGED" : "CHANGED";

    const observation: CandidateChangeObservationV1 = {
      version: CANDIDATE_OBSERVATION_VERSION,
      observationId: `obs_${randomUUID().replaceAll("-", "")}`,
      candidateId: input.candidate.candidateId,
      locator: input.candidate.locator,
      batchId: input.batchId,
      observedAt: input.observedAt ?? input.candidate.discoveredAt,
      evidenceKind: currentEvidence.evidenceKind,
      fingerprint: currentEvidence.fingerprint,
      delta,
      ...(latest ? { previousObservationId: latest.observationId } : {}),
      candidateStatusAtObservation: status,
      facts: currentEvidence.facts,
    };
    this.database
      .prepare(
        `INSERT INTO source_candidate_observations (
           observation_id, candidate_id, locator, batch_id, observed_at, evidence_kind,
           fingerprint, delta, previous_observation_id, document_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        observation.observationId,
        observation.candidateId,
        observation.locator,
        observation.batchId,
        observation.observedAt,
        observation.evidenceKind,
        observation.fingerprint,
        observation.delta,
        observation.previousObservationId ?? null,
        JSON.stringify(observation),
      );
    return observation;
  }

  summary(batchId: string): CandidateObservationBatchSummaryV1 {
    const batch = this.database
      .prepare("SELECT completed_at, created_at FROM discovery_batches WHERE batch_id = ?")
      .get(batchId) as { completed_at?: string | null; created_at?: string | null } | undefined;
    if (!batch) throw new RegistryValidationError(`Discovery batch ${batchId} was not found`);
    const rows = this.database
      .prepare(
        `SELECT delta, COUNT(*) AS total
         FROM source_candidate_observations
         WHERE batch_id = ?
         GROUP BY delta`,
      )
      .all(batchId) as Array<{ delta: CandidateObservationDelta; total: number }>;
    const counts = new Map(rows.map((row) => [row.delta, Number(row.total)]));
    return {
      batchId,
      observedAt: batch.completed_at ?? batch.created_at ?? new Date(0).toISOString(),
      total: rows.reduce((sum, row) => sum + Number(row.total), 0),
      newCount: counts.get("NEW") ?? 0,
      knownCount: counts.get("KNOWN") ?? 0,
      changedCount: counts.get("CHANGED") ?? 0,
      rejectedChangedCount: counts.get("REJECTED_CHANGED") ?? 0,
    };
  }
}
