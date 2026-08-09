import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type {
  SourceIntelligenceObservationFlagKind,
  SourceIntelligenceObservationOwnershipAction,
  SourceIntelligenceObservationOwnershipEventV2,
  SourceIntelligenceObservationOwnershipRecordV2,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "./index";

const MAX_KEYS = 500;
const MAX_SOURCE_IDS = 100;
const MAX_EVENT_LIMIT = 500;
const MAX_OPERATOR_LENGTH = 120;
const REVIEW_KEY = /^sir_[0-9a-f]{32}$/;
const FLAG_KINDS = new Set<SourceIntelligenceObservationFlagKind>([
  "HIGH_VALUE_UNOBSERVED",
  "EVIDENCE_MATURITY_REGRESSION",
  "SOURCE_VALUE_BAND_CHANGED",
  "ACQUISITION_COST_INCREASED",
]);

export type SaveSourceIntelligenceObservationOwnershipInput = {
  observationKey: string;
  sourceId: string;
  flagKind: SourceIntelligenceObservationFlagKind;
  action: SourceIntelligenceObservationOwnershipAction;
  actor: string;
  owner?: string;
  expectedOwner?: string | null;
};

export type SourceIntelligenceObservationOwnershipEventFilters = {
  sourceIds?: string[];
  limit?: number;
  offset?: number;
};

export interface SourceIntelligenceObservationOwnershipRepository {
  get(observationKey: string): SourceIntelligenceObservationOwnershipRecordV2 | null;
  listByObservationKeys(observationKeys: string[]): SourceIntelligenceObservationOwnershipRecordV2[];
  listEvents(
    filters?: SourceIntelligenceObservationOwnershipEventFilters,
  ): SourceIntelligenceObservationOwnershipEventV2[];
  save(
    input: SaveSourceIntelligenceObservationOwnershipInput,
  ): SourceIntelligenceObservationOwnershipRecordV2;
}

function requiredText(value: string, field: string, maxLength = 500): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  if (normalized.length > maxLength) {
    throw new RegistryValidationError(`${field} must be at most ${maxLength} characters`);
  }
  return normalized;
}

function normalizedKey(value: string): string {
  const normalized = requiredText(value, "observationKey", 100);
  if (!REVIEW_KEY.test(normalized)) {
    throw new RegistryValidationError("observationKey must be a D2.9 review occurrence key");
  }
  return normalized;
}

function operatorLabel(value: string, field: string): string {
  return requiredText(value, field, MAX_OPERATOR_LENGTH);
}

function normalizeEventLimit(value: number | undefined): number {
  if (value === undefined) return 100;
  if (!Number.isInteger(value) || value <= 0 || value > MAX_EVENT_LIMIT) {
    throw new RegistryValidationError(
      `ownership event limit must be an integer between 1 and ${MAX_EVENT_LIMIT}`,
    );
  }
  return value;
}

function normalizeEventOffset(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0) {
    throw new RegistryValidationError("ownership event offset must be a non-negative integer");
  }
  return value;
}

function normalizeSourceIds(values: string[] | undefined): string[] {
  const normalized = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
  if (normalized.length > MAX_SOURCE_IDS) {
    throw new RegistryValidationError(`At most ${MAX_SOURCE_IDS} source ids may be read at once`);
  }
  return normalized;
}

function parseOwnership(row: Record<string, unknown>): SourceIntelligenceObservationOwnershipRecordV2 {
  return {
    observationKey: String(row.observation_key),
    sourceId: String(row.source_id),
    flagKind: String(row.flag_kind) as SourceIntelligenceObservationFlagKind,
    owner: row.owner ? String(row.owner) : null,
    changedBy: String(row.changed_by),
    assignedAt: row.assigned_at ? String(row.assigned_at) : null,
    updatedAt: String(row.updated_at),
  };
}

function parseEvent(row: Record<string, unknown>): SourceIntelligenceObservationOwnershipEventV2 {
  return {
    eventId: String(row.event_id),
    observationKey: String(row.observation_key),
    sourceId: String(row.source_id),
    flagKind: String(row.flag_kind) as SourceIntelligenceObservationFlagKind,
    action: String(row.action) as SourceIntelligenceObservationOwnershipAction,
    previousOwner: row.previous_owner ? String(row.previous_owner) : null,
    owner: row.owner ? String(row.owner) : null,
    actor: String(row.actor),
    occurredAt: String(row.occurred_at),
  };
}

export class SqliteSourceIntelligenceObservationOwnershipRepository implements SourceIntelligenceObservationOwnershipRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS source_intelligence_observation_review_ownership (
        observation_key TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        flag_kind TEXT NOT NULL,
        owner TEXT,
        changed_by TEXT NOT NULL,
        assigned_at TEXT,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_source_intelligence_ownership_owner
        ON source_intelligence_observation_review_ownership(owner, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_source_intelligence_ownership_source
        ON source_intelligence_observation_review_ownership(source_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS source_intelligence_observation_ownership_events (
        event_id TEXT PRIMARY KEY,
        observation_key TEXT NOT NULL,
        source_id TEXT NOT NULL,
        flag_kind TEXT NOT NULL,
        action TEXT NOT NULL,
        previous_owner TEXT,
        owner TEXT,
        actor TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_source_intelligence_ownership_event_source
        ON source_intelligence_observation_ownership_events(source_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_source_intelligence_ownership_event_observation
        ON source_intelligence_observation_ownership_events(observation_key, occurred_at ASC);
    `);
  }

  get(observationKey: string): SourceIntelligenceObservationOwnershipRecordV2 | null {
    const key = normalizedKey(observationKey);
    const row = this.database
      .prepare(
        "SELECT * FROM source_intelligence_observation_review_ownership WHERE observation_key = ?",
      )
      .get(key) as Record<string, unknown> | undefined;
    return row ? parseOwnership(row) : null;
  }

  listByObservationKeys(
    observationKeys: string[],
  ): SourceIntelligenceObservationOwnershipRecordV2[] {
    const keys = [...new Set(observationKeys.map(normalizedKey))];
    if (keys.length === 0) return [];
    if (keys.length > MAX_KEYS) {
      throw new RegistryValidationError(`At most ${MAX_KEYS} observation keys may be read at once`);
    }
    const placeholders = keys.map(() => "?").join(", ");
    return this.database
      .prepare(
        `SELECT * FROM source_intelligence_observation_review_ownership
         WHERE observation_key IN (${placeholders})
         ORDER BY updated_at DESC, observation_key ASC`,
      )
      .all(...(keys as SQLInputValue[]))
      .map((row) => parseOwnership(row as Record<string, unknown>));
  }

  listEvents(
    filters: SourceIntelligenceObservationOwnershipEventFilters = {},
  ): SourceIntelligenceObservationOwnershipEventV2[] {
    const sourceIds = normalizeSourceIds(filters.sourceIds);
    const limit = normalizeEventLimit(filters.limit);
    const offset = normalizeEventOffset(filters.offset);
    const values: SQLInputValue[] = [];
    let where = "";
    if (sourceIds.length > 0) {
      where = `WHERE source_id IN (${sourceIds.map(() => "?").join(", ")})`;
      values.push(...sourceIds);
    }
    return this.database
      .prepare(
        `SELECT * FROM source_intelligence_observation_ownership_events
         ${where}
         ORDER BY occurred_at DESC, event_id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...values, limit, offset)
      .map((row) => parseEvent(row as Record<string, unknown>));
  }

  save(
    input: SaveSourceIntelligenceObservationOwnershipInput,
  ): SourceIntelligenceObservationOwnershipRecordV2 {
    const observationKey = normalizedKey(input.observationKey);
    const sourceId = requiredText(input.sourceId, "sourceId");
    if (!FLAG_KINDS.has(input.flagKind)) {
      throw new RegistryValidationError("flagKind is not supported by D2.11");
    }
    const actor = operatorLabel(input.actor, "actor");
    const existing = this.get(observationKey);
    const previousOwner = existing?.owner ?? null;
    if (Object.prototype.hasOwnProperty.call(input, "expectedOwner")) {
      const expectedOwner = input.expectedOwner ? operatorLabel(input.expectedOwner, "expectedOwner") : null;
      if (expectedOwner !== previousOwner) {
        throw new RegistryConflictError(
          "SOURCE_INTELLIGENCE_OWNERSHIP_CHANGED",
          "Observation ownership changed before this handoff was saved; reload before retrying",
          { observationKey, expectedOwner, currentOwner: previousOwner },
        );
      }
    }

    let nextOwner: string | null;
    if (input.action === "CLAIMED") {
      if (previousOwner !== null) {
        throw new RegistryConflictError(
          "SOURCE_INTELLIGENCE_ALREADY_OWNED",
          "Observation is already owned; use an explicit transfer instead of claiming it",
          { observationKey, currentOwner: previousOwner },
        );
      }
      nextOwner = operatorLabel(input.owner ?? actor, "owner");
    } else if (input.action === "TRANSFERRED") {
      if (previousOwner === null) {
        throw new RegistryConflictError(
          "SOURCE_INTELLIGENCE_OWNERSHIP_MISSING",
          "Observation is unassigned; claim it instead of transferring it",
          { observationKey },
        );
      }
      nextOwner = operatorLabel(input.owner ?? "", "owner");
      if (nextOwner === previousOwner) {
        throw new RegistryValidationError("transfer owner must differ from the current owner");
      }
    } else if (input.action === "RELEASED") {
      if (previousOwner === null) {
        throw new RegistryConflictError(
          "SOURCE_INTELLIGENCE_OWNERSHIP_MISSING",
          "Observation is already unassigned",
          { observationKey },
        );
      }
      nextOwner = null;
    } else {
      throw new RegistryValidationError("ownership action must be CLAIMED, TRANSFERRED, or RELEASED");
    }

    const timestamp = this.clock().toISOString();
    const eventId = `sioe_${randomUUID().replaceAll("-", "")}`;
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database
        .prepare(
          `INSERT INTO source_intelligence_observation_review_ownership (
             observation_key, source_id, flag_kind, owner, changed_by, assigned_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(observation_key) DO UPDATE SET
             source_id = excluded.source_id,
             flag_kind = excluded.flag_kind,
             owner = excluded.owner,
             changed_by = excluded.changed_by,
             assigned_at = excluded.assigned_at,
             updated_at = excluded.updated_at`,
        )
        .run(
          observationKey,
          sourceId,
          input.flagKind,
          nextOwner,
          actor,
          nextOwner ? timestamp : null,
          timestamp,
        );
      this.database
        .prepare(
          `INSERT INTO source_intelligence_observation_ownership_events (
             event_id, observation_key, source_id, flag_kind, action,
             previous_owner, owner, actor, occurred_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          eventId,
          observationKey,
          sourceId,
          input.flagKind,
          input.action,
          previousOwner,
          nextOwner,
          actor,
          timestamp,
        );
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }

    const saved = this.get(observationKey);
    if (!saved) throw new Error(`Failed to persist observation ownership ${observationKey}`);
    return saved;
  }
}
