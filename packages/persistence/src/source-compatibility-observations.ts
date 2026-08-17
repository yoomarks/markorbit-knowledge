import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  SOURCE_COMPATIBILITY_PROTOCOL_VERSION,
  SOURCE_COMPATIBILITY_STATES,
  type SourceCompatibilityObservation,
  type SourceCompatibilityObservationInput,
  type SourceCompatibilityState,
} from "@markorbit/contracts";
import { RegistryValidationError } from "./index";

const SQL_CHUNK_SIZE = 400;
const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export function ensureSourceCompatibilityObservationRegistry(database: DatabaseSync): void {
  if (INITIALIZED_DATABASES.has(database)) return;
  database.exec(`
    CREATE TABLE IF NOT EXISTS source_compatibility_observations (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL,
      jurisdiction TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('PASS', 'DEGRADED', 'BLOCKED')),
      observed_at TEXT NOT NULL,
      primary_uri TEXT NOT NULL,
      render_javascript INTEGER NOT NULL CHECK (render_javascript IN (0, 1)),
      error_code TEXT,
      error_message TEXT,
      baseline_target_id TEXT,
      baseline_state TEXT CHECK (baseline_state IS NULL OR baseline_state IN ('PASS', 'FAIL')),
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(target_id, observed_at)
    );
    CREATE INDEX IF NOT EXISTS source_compatibility_observations_target_observed_idx
      ON source_compatibility_observations(target_id, observed_at DESC, created_at DESC);
  `);
  INITIALIZED_DATABASES.add(database);
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function normalizeObservation(input: SourceCompatibilityObservationInput): SourceCompatibilityObservation {
  const targetId = requireText(input.targetId, "targetId");
  const jurisdiction = requireText(input.jurisdiction, "jurisdiction");
  const primaryUri = requireText(input.primaryUri, "primaryUri");
  if (!SOURCE_COMPATIBILITY_STATES.includes(input.state)) {
    throw new RegistryValidationError("state is invalid");
  }
  const observedAt = new Date(input.observedAt);
  if (Number.isNaN(observedAt.getTime())) {
    throw new RegistryValidationError("observedAt must be an ISO timestamp");
  }
  if (input.baselineState && !["PASS", "FAIL"].includes(input.baselineState)) {
    throw new RegistryValidationError("baselineState is invalid");
  }
  return {
    protocolVersion: SOURCE_COMPATIBILITY_PROTOCOL_VERSION,
    objectType: "SOURCE_COMPATIBILITY_OBSERVATION",
    id: input.id?.trim() || randomUUID(),
    targetId,
    jurisdiction,
    state: input.state,
    observedAt: observedAt.toISOString(),
    primaryUri,
    renderJavascript: input.renderJavascript,
    ...(input.errorCode?.trim() ? { errorCode: input.errorCode.trim() } : {}),
    ...(input.errorMessage?.trim() ? { errorMessage: input.errorMessage.trim() } : {}),
    ...(input.baselineTargetId?.trim() ? { baselineTargetId: input.baselineTargetId.trim() } : {}),
    ...(input.baselineState ? { baselineState: input.baselineState } : {}),
    ...(input.details ? { details: input.details } : {}),
  };
}

function rowToObservation(row: Record<string, unknown>): SourceCompatibilityObservation {
  const details = JSON.parse(String(row.details_json ?? "{}")) as Record<string, unknown>;
  return {
    protocolVersion: SOURCE_COMPATIBILITY_PROTOCOL_VERSION,
    objectType: "SOURCE_COMPATIBILITY_OBSERVATION",
    id: String(row.id),
    targetId: String(row.target_id),
    jurisdiction: String(row.jurisdiction),
    state: String(row.state) as SourceCompatibilityState,
    observedAt: String(row.observed_at),
    primaryUri: String(row.primary_uri),
    renderJavascript: Number(row.render_javascript) === 1,
    ...(row.error_code ? { errorCode: String(row.error_code) } : {}),
    ...(row.error_message ? { errorMessage: String(row.error_message) } : {}),
    ...(row.baseline_target_id ? { baselineTargetId: String(row.baseline_target_id) } : {}),
    ...(row.baseline_state
      ? { baselineState: String(row.baseline_state) as "PASS" | "FAIL" }
      : {}),
    ...(Object.keys(details).length > 0 ? { details } : {}),
  };
}

export class SqliteSourceCompatibilityObservationRepository {
  constructor(private readonly database: DatabaseSync) {
    ensureSourceCompatibilityObservationRegistry(database);
  }

  record(input: SourceCompatibilityObservationInput): SourceCompatibilityObservation {
    const observation = normalizeObservation(input);
    this.database
      .prepare(
        `INSERT INTO source_compatibility_observations (
           id, target_id, jurisdiction, state, observed_at, primary_uri, render_javascript,
           error_code, error_message, baseline_target_id, baseline_state, details_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(target_id, observed_at) DO UPDATE SET
           jurisdiction = excluded.jurisdiction,
           state = excluded.state,
           primary_uri = excluded.primary_uri,
           render_javascript = excluded.render_javascript,
           error_code = excluded.error_code,
           error_message = excluded.error_message,
           baseline_target_id = excluded.baseline_target_id,
           baseline_state = excluded.baseline_state,
           details_json = excluded.details_json`,
      )
      .run(
        observation.id,
        observation.targetId,
        observation.jurisdiction,
        observation.state,
        observation.observedAt,
        observation.primaryUri,
        observation.renderJavascript ? 1 : 0,
        observation.errorCode ?? null,
        observation.errorMessage ?? null,
        observation.baselineTargetId ?? null,
        observation.baselineState ?? null,
        JSON.stringify(observation.details ?? {}),
      );
    return this.latest([observation.targetId]).get(observation.targetId) ?? observation;
  }

  recordMany(inputs: readonly SourceCompatibilityObservationInput[]): SourceCompatibilityObservation[] {
    if (inputs.length === 0) return [];
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const items = inputs.map((input) => this.record(input));
      this.database.exec("COMMIT");
      return items;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  latest(targetIds: readonly string[]): Map<string, SourceCompatibilityObservation> {
    const unique = [...new Set(targetIds.map((value) => value.trim()).filter(Boolean))];
    const result = new Map<string, SourceCompatibilityObservation>();
    for (let offset = 0; offset < unique.length; offset += SQL_CHUNK_SIZE) {
      const chunk = unique.slice(offset, offset + SQL_CHUNK_SIZE);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = this.database
        .prepare(
          `SELECT * FROM (
             SELECT *, ROW_NUMBER() OVER (
               PARTITION BY target_id ORDER BY observed_at DESC, created_at DESC, id DESC
             ) AS row_number
             FROM source_compatibility_observations
             WHERE target_id IN (${placeholders})
           ) WHERE row_number = 1`,
        )
        .all(...chunk) as Array<Record<string, unknown>>;
      for (const row of rows) {
        const item = rowToObservation(row);
        result.set(item.targetId, item);
      }
    }
    return result;
  }
}
