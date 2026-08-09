import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  SOURCE_INTELLIGENCE_MANUAL_SLA_POLICY_ID,
  SOURCE_INTELLIGENCE_MANUAL_SLA_PROTOCOL_VERSION,
  type SourceIntelligenceManualEscalationAction,
  type SourceIntelligenceManualEscalationEventV2,
  type SourceIntelligenceManualEscalationRecordV2,
  type SourceIntelligenceManualSlaPolicyV2,
  type SourceIntelligenceObservationFlagKind,
  type SourceIntelligencePolicyAuditEventV2,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "./index";

const REVIEW_KEY = /^sir_[0-9a-f]{32}$/;
const MAX_OPERATOR_LENGTH = 120;
const MAX_NOTE_LENGTH = 2000;
const MAX_KEYS = 500;
const MAX_SOURCE_IDS = 100;
const MAX_EVENT_LIMIT = 500;
const MAX_TARGET_HOURS = 8760;
const FLAG_KINDS = new Set<SourceIntelligenceObservationFlagKind>([
  "HIGH_VALUE_UNOBSERVED",
  "EVIDENCE_MATURITY_REGRESSION",
  "SOURCE_VALUE_BAND_CHANGED",
  "ACQUISITION_COST_INCREASED",
]);

export type SaveSourceIntelligenceManualSlaPolicyInput = {
  actor: string;
  claimTargetHours: number | null;
  reviewTargetHours: number | null;
  expectedUpdatedAt: string | null;
};

export type SaveSourceIntelligenceManualEscalationInput = {
  observationKey: string;
  sourceId: string;
  flagKind: SourceIntelligenceObservationFlagKind;
  action: SourceIntelligenceManualEscalationAction;
  actor: string;
  note?: string;
  expectedEscalated: boolean;
};

export type SourceIntelligenceManualEscalationEventFilters = {
  sourceIds?: string[];
  limit?: number;
  offset?: number;
};

export type SourceIntelligencePolicyAuditEventFilters = {
  limit?: number;
  offset?: number;
};

export interface SourceIntelligenceManualSlaRepository {
  getPolicy(): SourceIntelligenceManualSlaPolicyV2 | null;
  savePolicy(
    input: SaveSourceIntelligenceManualSlaPolicyInput,
  ): SourceIntelligenceManualSlaPolicyV2;
  listPolicyAuditEvents(
    filters?: SourceIntelligencePolicyAuditEventFilters,
  ): SourceIntelligencePolicyAuditEventV2[];
  getEscalation(observationKey: string): SourceIntelligenceManualEscalationRecordV2 | null;
  listEscalationsByObservationKeys(
    observationKeys: string[],
  ): SourceIntelligenceManualEscalationRecordV2[];
  listEscalationEvents(
    filters?: SourceIntelligenceManualEscalationEventFilters,
  ): SourceIntelligenceManualEscalationEventV2[];
  saveEscalation(
    input: SaveSourceIntelligenceManualEscalationInput,
  ): SourceIntelligenceManualEscalationRecordV2;
}

function requiredText(value: string, field: string, maxLength = 500): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  if (normalized.length > maxLength) {
    throw new RegistryValidationError(`${field} must be at most ${maxLength} characters`);
  }
  return normalized;
}

function operatorLabel(value: string, field: string): string {
  return requiredText(value, field, MAX_OPERATOR_LENGTH);
}

function normalizedKey(value: string): string {
  const key = requiredText(value, "observationKey", 100);
  if (!REVIEW_KEY.test(key)) {
    throw new RegistryValidationError("observationKey must be a D2.9 review occurrence key");
  }
  return key;
}

function targetHours(value: number | null, field: string): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value <= 0 || value > MAX_TARGET_HOURS) {
    throw new RegistryValidationError(
      `${field} must be null or an integer between 1 and ${MAX_TARGET_HOURS}`,
    );
  }
  return value;
}

function optionalNote(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > MAX_NOTE_LENGTH) {
    throw new RegistryValidationError(`note must be at most ${MAX_NOTE_LENGTH} characters`);
  }
  return normalized;
}

function normalizeSourceIds(values: string[] | undefined): string[] {
  const normalized = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
  if (normalized.length > MAX_SOURCE_IDS) {
    throw new RegistryValidationError(`At most ${MAX_SOURCE_IDS} source ids may be read at once`);
  }
  return normalized;
}

function normalizeEventLimit(value: number | undefined): number {
  if (value === undefined) return 100;
  if (!Number.isInteger(value) || value <= 0 || value > MAX_EVENT_LIMIT) {
    throw new RegistryValidationError(
      `event limit must be an integer between 1 and ${MAX_EVENT_LIMIT}`,
    );
  }
  return value;
}

function normalizeEventOffset(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0) {
    throw new RegistryValidationError("event offset must be a non-negative integer");
  }
  return value;
}

function parsePolicy(row: Record<string, unknown>): SourceIntelligenceManualSlaPolicyV2 {
  return {
    protocolVersion: SOURCE_INTELLIGENCE_MANUAL_SLA_PROTOCOL_VERSION,
    policyId: SOURCE_INTELLIGENCE_MANUAL_SLA_POLICY_ID,
    claimTargetHours:
      row.claim_target_hours === null || row.claim_target_hours === undefined
        ? null
        : Number(row.claim_target_hours),
    reviewTargetHours:
      row.review_target_hours === null || row.review_target_hours === undefined
        ? null
        : Number(row.review_target_hours),
    updatedBy: String(row.updated_by),
    updatedAt: String(row.updated_at),
  };
}

function parsePolicyAuditEvent(row: Record<string, unknown>): SourceIntelligencePolicyAuditEventV2 {
  const action = String(row.action) as SourceIntelligencePolicyAuditEventV2["action"];
  const previousClaim =
    row.previous_claim_target_hours === null || row.previous_claim_target_hours === undefined
      ? null
      : Number(row.previous_claim_target_hours);
  const previousReview =
    row.previous_review_target_hours === null || row.previous_review_target_hours === undefined
      ? null
      : Number(row.previous_review_target_hours);
  const claim =
    row.claim_target_hours === null || row.claim_target_hours === undefined
      ? null
      : Number(row.claim_target_hours);
  const review =
    row.review_target_hours === null || row.review_target_hours === undefined
      ? null
      : Number(row.review_target_hours);
  return {
    eventId: String(row.event_id),
    scope: "GLOBAL_POLICY",
    action,
    actorLabel: String(row.actor_label),
    occurredAt: String(row.occurred_at),
    policyId: SOURCE_INTELLIGENCE_MANUAL_SLA_POLICY_ID,
    cohortId: null,
    sourceId: null,
    changes: [
      { field: "claimTargetHours", before: previousClaim, after: claim },
      { field: "reviewTargetHours", before: previousReview, after: review },
    ],
    historicalCompleteness: action === "SNAPSHOT_BACKFILL" ? "SNAPSHOT_BACKFILL" : "EVENT_SOURCED",
  };
}

function parseEscalation(row: Record<string, unknown>): SourceIntelligenceManualEscalationRecordV2 {
  return {
    observationKey: String(row.observation_key),
    sourceId: String(row.source_id),
    flagKind: String(row.flag_kind) as SourceIntelligenceObservationFlagKind,
    escalated: Number(row.escalated) === 1,
    actor: String(row.actor),
    ...(row.note ? { note: String(row.note) } : {}),
    updatedAt: String(row.updated_at),
  };
}

function parseEscalationEvent(
  row: Record<string, unknown>,
): SourceIntelligenceManualEscalationEventV2 {
  return {
    eventId: String(row.event_id),
    observationKey: String(row.observation_key),
    sourceId: String(row.source_id),
    flagKind: String(row.flag_kind) as SourceIntelligenceObservationFlagKind,
    action: String(row.action) as SourceIntelligenceManualEscalationAction,
    previousEscalated: Number(row.previous_escalated) === 1,
    escalated: Number(row.escalated) === 1,
    actor: String(row.actor),
    ...(row.note ? { note: String(row.note) } : {}),
    occurredAt: String(row.occurred_at),
  };
}

function stableBackfillEventId(seed: string): string {
  return `sipa_${createHash("sha256").update(seed).digest("hex").slice(0, 32)}`;
}

export class SqliteSourceIntelligenceManualSlaRepository implements SourceIntelligenceManualSlaRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS source_intelligence_manual_sla_policy (
        policy_id TEXT PRIMARY KEY,
        claim_target_hours INTEGER,
        review_target_hours INTEGER,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS source_intelligence_manual_sla_policy_events (
        event_id TEXT PRIMARY KEY,
        policy_id TEXT NOT NULL,
        action TEXT NOT NULL,
        previous_claim_target_hours INTEGER,
        previous_review_target_hours INTEGER,
        claim_target_hours INTEGER,
        review_target_hours INTEGER,
        actor_label TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_source_intelligence_manual_sla_policy_events_time
        ON source_intelligence_manual_sla_policy_events(occurred_at DESC, event_id DESC);

      CREATE TABLE IF NOT EXISTS source_intelligence_manual_escalations (
        observation_key TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        flag_kind TEXT NOT NULL,
        escalated INTEGER NOT NULL CHECK(escalated IN (0, 1)),
        actor TEXT NOT NULL,
        note TEXT,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_source_intelligence_manual_escalation_source
        ON source_intelligence_manual_escalations(source_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS source_intelligence_manual_escalation_events (
        event_id TEXT PRIMARY KEY,
        observation_key TEXT NOT NULL,
        source_id TEXT NOT NULL,
        flag_kind TEXT NOT NULL,
        action TEXT NOT NULL,
        previous_escalated INTEGER NOT NULL CHECK(previous_escalated IN (0, 1)),
        escalated INTEGER NOT NULL CHECK(escalated IN (0, 1)),
        actor TEXT NOT NULL,
        note TEXT,
        occurred_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_source_intelligence_manual_escalation_event_source
        ON source_intelligence_manual_escalation_events(source_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_source_intelligence_manual_escalation_event_observation
        ON source_intelligence_manual_escalation_events(observation_key, occurred_at ASC);
    `);
    this.backfillPolicyAuditSnapshot();
  }

  private backfillPolicyAuditSnapshot(): void {
    const policy = this.getPolicy();
    if (!policy) return;
    const existing = this.database
      .prepare(
        "SELECT event_id FROM source_intelligence_manual_sla_policy_events WHERE policy_id = ? LIMIT 1",
      )
      .get(SOURCE_INTELLIGENCE_MANUAL_SLA_POLICY_ID) as Record<string, unknown> | undefined;
    if (existing) return;
    this.database
      .prepare(
        `INSERT OR IGNORE INTO source_intelligence_manual_sla_policy_events (
           event_id, policy_id, action,
           previous_claim_target_hours, previous_review_target_hours,
           claim_target_hours, review_target_hours, actor_label, occurred_at
         ) VALUES (?, ?, 'SNAPSHOT_BACKFILL', NULL, NULL, ?, ?, ?, ?)`,
      )
      .run(
        stableBackfillEventId(`${policy.policyId}:${policy.updatedAt}`),
        policy.policyId,
        policy.claimTargetHours,
        policy.reviewTargetHours,
        policy.updatedBy,
        policy.updatedAt,
      );
  }

  getPolicy(): SourceIntelligenceManualSlaPolicyV2 | null {
    const row = this.database
      .prepare("SELECT * FROM source_intelligence_manual_sla_policy WHERE policy_id = ?")
      .get(SOURCE_INTELLIGENCE_MANUAL_SLA_POLICY_ID) as Record<string, unknown> | undefined;
    return row ? parsePolicy(row) : null;
  }

  savePolicy(
    input: SaveSourceIntelligenceManualSlaPolicyInput,
  ): SourceIntelligenceManualSlaPolicyV2 {
    const actor = operatorLabel(input.actor, "actor");
    const claimTargetHours = targetHours(input.claimTargetHours, "claimTargetHours");
    const reviewTargetHours = targetHours(input.reviewTargetHours, "reviewTargetHours");
    const existing = this.getPolicy();
    const currentUpdatedAt = existing?.updatedAt ?? null;
    if (input.expectedUpdatedAt !== currentUpdatedAt) {
      throw new RegistryConflictError(
        "SOURCE_INTELLIGENCE_MANUAL_SLA_POLICY_CHANGED",
        "Manual SLA policy changed before this update was saved; reload before retrying",
        { expectedUpdatedAt: input.expectedUpdatedAt, currentUpdatedAt },
      );
    }
    const timestamp = this.clock().toISOString();
    const eventId = `sipa_${randomUUID().replaceAll("-", "")}`;
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database
        .prepare(
          `INSERT INTO source_intelligence_manual_sla_policy (
             policy_id, claim_target_hours, review_target_hours, updated_by, updated_at
           ) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(policy_id) DO UPDATE SET
             claim_target_hours = excluded.claim_target_hours,
             review_target_hours = excluded.review_target_hours,
             updated_by = excluded.updated_by,
             updated_at = excluded.updated_at`,
        )
        .run(
          SOURCE_INTELLIGENCE_MANUAL_SLA_POLICY_ID,
          claimTargetHours,
          reviewTargetHours,
          actor,
          timestamp,
        );
      this.database
        .prepare(
          `INSERT INTO source_intelligence_manual_sla_policy_events (
             event_id, policy_id, action,
             previous_claim_target_hours, previous_review_target_hours,
             claim_target_hours, review_target_hours, actor_label, occurred_at
           ) VALUES (?, ?, 'GLOBAL_POLICY_CHANGED', ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          eventId,
          SOURCE_INTELLIGENCE_MANUAL_SLA_POLICY_ID,
          existing?.claimTargetHours ?? null,
          existing?.reviewTargetHours ?? null,
          claimTargetHours,
          reviewTargetHours,
          actor,
          timestamp,
        );
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
    const saved = this.getPolicy();
    if (!saved) throw new Error("Failed to persist Source Intelligence manual SLA policy");
    return saved;
  }

  listPolicyAuditEvents(
    filters: SourceIntelligencePolicyAuditEventFilters = {},
  ): SourceIntelligencePolicyAuditEventV2[] {
    const limit = normalizeEventLimit(filters.limit);
    const offset = normalizeEventOffset(filters.offset);
    return this.database
      .prepare(
        `SELECT * FROM source_intelligence_manual_sla_policy_events
         ORDER BY occurred_at DESC, event_id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(limit, offset)
      .map((row) => parsePolicyAuditEvent(row as Record<string, unknown>));
  }

  getEscalation(observationKey: string): SourceIntelligenceManualEscalationRecordV2 | null {
    const key = normalizedKey(observationKey);
    const row = this.database
      .prepare("SELECT * FROM source_intelligence_manual_escalations WHERE observation_key = ?")
      .get(key) as Record<string, unknown> | undefined;
    return row ? parseEscalation(row) : null;
  }

  listEscalationsByObservationKeys(
    observationKeys: string[],
  ): SourceIntelligenceManualEscalationRecordV2[] {
    const keys = [...new Set(observationKeys.map(normalizedKey))];
    if (keys.length === 0) return [];
    if (keys.length > MAX_KEYS) {
      throw new RegistryValidationError(`At most ${MAX_KEYS} observation keys may be read at once`);
    }
    const placeholders = keys.map(() => "?").join(", ");
    return this.database
      .prepare(
        `SELECT * FROM source_intelligence_manual_escalations
         WHERE observation_key IN (${placeholders})
         ORDER BY updated_at DESC, observation_key ASC`,
      )
      .all(...(keys as SQLInputValue[]))
      .map((row) => parseEscalation(row as Record<string, unknown>));
  }

  listEscalationEvents(
    filters: SourceIntelligenceManualEscalationEventFilters = {},
  ): SourceIntelligenceManualEscalationEventV2[] {
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
        `SELECT * FROM source_intelligence_manual_escalation_events
         ${where}
         ORDER BY occurred_at DESC, event_id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...values, limit, offset)
      .map((row) => parseEscalationEvent(row as Record<string, unknown>));
  }

  saveEscalation(
    input: SaveSourceIntelligenceManualEscalationInput,
  ): SourceIntelligenceManualEscalationRecordV2 {
    const observationKey = normalizedKey(input.observationKey);
    const sourceId = requiredText(input.sourceId, "sourceId");
    if (!FLAG_KINDS.has(input.flagKind)) {
      throw new RegistryValidationError("flagKind is not supported by D2.13");
    }
    const actor = operatorLabel(input.actor, "actor");
    const note = optionalNote(input.note);
    const existing = this.getEscalation(observationKey);
    if (existing && (existing.sourceId !== sourceId || existing.flagKind !== input.flagKind)) {
      throw new RegistryConflictError(
        "SOURCE_INTELLIGENCE_ESCALATION_IDENTITY_MISMATCH",
        "Escalation occurrence identity does not match the persisted record",
        { observationKey, sourceId, flagKind: input.flagKind },
      );
    }
    const previousEscalated = existing?.escalated ?? false;
    if (input.expectedEscalated !== previousEscalated) {
      throw new RegistryConflictError(
        "SOURCE_INTELLIGENCE_ESCALATION_CHANGED",
        "Manual escalation state changed before this update was saved; reload before retrying",
        {
          observationKey,
          expectedEscalated: input.expectedEscalated,
          currentEscalated: previousEscalated,
        },
      );
    }

    let escalated: boolean;
    if (input.action === "ESCALATED") {
      if (previousEscalated) {
        throw new RegistryConflictError(
          "SOURCE_INTELLIGENCE_ALREADY_ESCALATED",
          "Observation occurrence is already manually escalated",
          { observationKey },
        );
      }
      escalated = true;
    } else if (input.action === "CLEARED") {
      if (!previousEscalated) {
        throw new RegistryConflictError(
          "SOURCE_INTELLIGENCE_ESCALATION_MISSING",
          "Observation occurrence is not manually escalated",
          { observationKey },
        );
      }
      escalated = false;
    } else {
      throw new RegistryValidationError("escalation action must be ESCALATED or CLEARED");
    }

    const timestamp = this.clock().toISOString();
    const eventId = `sise_${randomUUID().replaceAll("-", "")}`;
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database
        .prepare(
          `INSERT INTO source_intelligence_manual_escalations (
             observation_key, source_id, flag_kind, escalated, actor, note, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(observation_key) DO UPDATE SET
             source_id = excluded.source_id,
             flag_kind = excluded.flag_kind,
             escalated = excluded.escalated,
             actor = excluded.actor,
             note = excluded.note,
             updated_at = excluded.updated_at`,
        )
        .run(
          observationKey,
          sourceId,
          input.flagKind,
          escalated ? 1 : 0,
          actor,
          note ?? null,
          timestamp,
        );
      this.database
        .prepare(
          `INSERT INTO source_intelligence_manual_escalation_events (
             event_id, observation_key, source_id, flag_kind, action,
             previous_escalated, escalated, actor, note, occurred_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          eventId,
          observationKey,
          sourceId,
          input.flagKind,
          input.action,
          previousEscalated ? 1 : 0,
          escalated ? 1 : 0,
          actor,
          note ?? null,
          timestamp,
        );
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }

    const saved = this.getEscalation(observationKey);
    if (!saved) throw new Error(`Failed to persist manual escalation ${observationKey}`);
    return saved;
  }
}
