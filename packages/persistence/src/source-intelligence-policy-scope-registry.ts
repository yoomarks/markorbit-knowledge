import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  type SourceIntelligencePolicyAuditChangeV2,
  type SourceIntelligencePolicyAuditEventV2,
  type SourceIntelligencePolicyCohortMembershipV2,
  type SourceIntelligencePolicyCohortV2,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "./index";

const COHORT_ID = /^sic_[0-9a-f]{32}$/;
const MAX_OPERATOR_LENGTH = 120;
const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_TARGET_HOURS = 8760;
const MAX_PRIORITY = 10000;
const MAX_FILTER_VALUES = 100;
const MAX_EVENT_LIMIT = 500;

export type SaveSourceIntelligencePolicyCohortInput = {
  cohortId?: string;
  name: string;
  description?: string;
  priority: number;
  enabled: boolean;
  claimTargetHours: number | null;
  reviewTargetHours: number | null;
  actor: string;
  expectedUpdatedAt: string | null;
};

export type SaveSourceIntelligencePolicyCohortMembershipInput = {
  cohortId: string;
  sourceId: string;
  action: "ADDED" | "REMOVED";
  actor: string;
  expectedPresent: boolean;
};

export type SourceIntelligencePolicyAuditEventFilters = {
  sourceIds?: string[];
  cohortIds?: string[];
  limit?: number;
  offset?: number;
};

export interface SourceIntelligencePolicyScopeRepository {
  getCohort(cohortId: string): SourceIntelligencePolicyCohortV2 | null;
  listCohorts(): SourceIntelligencePolicyCohortV2[];
  saveCohort(input: SaveSourceIntelligencePolicyCohortInput): SourceIntelligencePolicyCohortV2;
  listMemberships(filters?: {
    sourceIds?: string[];
    cohortIds?: string[];
  }): SourceIntelligencePolicyCohortMembershipV2[];
  saveMembership(
    input: SaveSourceIntelligencePolicyCohortMembershipInput,
  ): SourceIntelligencePolicyCohortMembershipV2 | null;
  listCohortAuditEvents(
    filters?: SourceIntelligencePolicyAuditEventFilters,
  ): SourceIntelligencePolicyAuditEventV2[];
  listMembershipAuditEvents(
    filters?: SourceIntelligencePolicyAuditEventFilters,
  ): SourceIntelligencePolicyAuditEventV2[];
}

function requiredText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  if (normalized.length > maxLength) {
    throw new RegistryValidationError(`${field} must be at most ${maxLength} characters`);
  }
  return normalized;
}

function optionalText(
  value: string | undefined,
  field: string,
  maxLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) {
    throw new RegistryValidationError(`${field} must be at most ${maxLength} characters`);
  }
  return normalized;
}

function normalizedCohortId(value: string): string {
  const id = requiredText(value, "cohortId", 100);
  if (!COHORT_ID.test(id)) {
    throw new RegistryValidationError("cohortId must be a D2.14 cohort id");
  }
  return id;
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

function priorityValue(value: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > MAX_PRIORITY) {
    throw new RegistryValidationError(`priority must be an integer between 1 and ${MAX_PRIORITY}`);
  }
  return value;
}

function normalizedValues(values: string[] | undefined, field: string): string[] {
  const normalized = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
  if (normalized.length > MAX_FILTER_VALUES) {
    throw new RegistryValidationError(`At most ${MAX_FILTER_VALUES} ${field} may be read at once`);
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

function parseCohort(row: Record<string, unknown>): SourceIntelligencePolicyCohortV2 {
  return {
    cohortId: String(row.cohort_id),
    name: String(row.name),
    ...(row.description ? { description: String(row.description) } : {}),
    priority: Number(row.priority),
    enabled: Number(row.enabled) === 1,
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

function parseMembership(row: Record<string, unknown>): SourceIntelligencePolicyCohortMembershipV2 {
  return {
    cohortId: String(row.cohort_id),
    sourceId: String(row.source_id),
    addedBy: String(row.added_by),
    addedAt: String(row.added_at),
  };
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function nullableTextValue(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function nullableBoolean(value: unknown): boolean | null {
  return value === null || value === undefined ? null : Number(value) === 1;
}

function changed(
  field: SourceIntelligencePolicyAuditChangeV2["field"],
  before: SourceIntelligencePolicyAuditChangeV2["before"],
  after: SourceIntelligencePolicyAuditChangeV2["after"],
): SourceIntelligencePolicyAuditChangeV2 | null {
  return before === after ? null : { field, before, after };
}

function parseCohortAuditEvent(row: Record<string, unknown>): SourceIntelligencePolicyAuditEventV2 {
  const action = String(row.action) as SourceIntelligencePolicyAuditEventV2["action"];
  const changes = [
    changed("name", nullableTextValue(row.previous_name), String(row.name)),
    changed(
      "description",
      nullableTextValue(row.previous_description),
      nullableTextValue(row.description),
    ),
    changed("priority", nullableNumber(row.previous_priority), Number(row.priority)),
    changed("enabled", nullableBoolean(row.previous_enabled), Number(row.enabled) === 1),
    changed(
      "claimTargetHours",
      nullableNumber(row.previous_claim_target_hours),
      nullableNumber(row.claim_target_hours),
    ),
    changed(
      "reviewTargetHours",
      nullableNumber(row.previous_review_target_hours),
      nullableNumber(row.review_target_hours),
    ),
  ].filter((entry): entry is SourceIntelligencePolicyAuditChangeV2 => entry !== null);
  return {
    eventId: String(row.event_id),
    scope: "COHORT",
    action,
    actorLabel: String(row.actor_label),
    occurredAt: String(row.occurred_at),
    policyId: null,
    cohortId: String(row.cohort_id),
    sourceId: null,
    changes,
    historicalCompleteness:
      action === "SNAPSHOT_BACKFILL" ? "SNAPSHOT_BACKFILL" : "EVENT_SOURCED",
  };
}

function parseMembershipAuditEvent(
  row: Record<string, unknown>,
): SourceIntelligencePolicyAuditEventV2 {
  const action = String(row.action) as SourceIntelligencePolicyAuditEventV2["action"];
  return {
    eventId: String(row.event_id),
    scope: "MEMBERSHIP",
    action,
    actorLabel: String(row.actor_label),
    occurredAt: String(row.occurred_at),
    policyId: null,
    cohortId: String(row.cohort_id),
    sourceId: String(row.source_id),
    changes: [
      {
        field: "membershipPresent",
        before: nullableBoolean(row.previous_present),
        after: Number(row.present) === 1,
      },
    ],
    historicalCompleteness:
      action === "SNAPSHOT_BACKFILL" ? "SNAPSHOT_BACKFILL" : "EVENT_SOURCED",
  };
}

function stableBackfillEventId(prefix: string, seed: string): string {
  return `${prefix}_${createHash("sha256").update(seed).digest("hex").slice(0, 32)}`;
}

export class SqliteSourceIntelligencePolicyScopeRepository implements SourceIntelligencePolicyScopeRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS source_intelligence_policy_cohorts (
        cohort_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        priority INTEGER NOT NULL,
        enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
        claim_target_hours INTEGER,
        review_target_hours INTEGER,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_source_intelligence_policy_cohort_priority
        ON source_intelligence_policy_cohorts(enabled DESC, priority DESC, cohort_id ASC);

      CREATE TABLE IF NOT EXISTS source_intelligence_policy_cohort_memberships (
        cohort_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        added_by TEXT NOT NULL,
        added_at TEXT NOT NULL,
        PRIMARY KEY(cohort_id, source_id),
        FOREIGN KEY(cohort_id) REFERENCES source_intelligence_policy_cohorts(cohort_id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_source_intelligence_policy_membership_source
        ON source_intelligence_policy_cohort_memberships(source_id, cohort_id);

      CREATE TABLE IF NOT EXISTS source_intelligence_policy_cohort_events (
        event_id TEXT PRIMARY KEY,
        cohort_id TEXT NOT NULL,
        action TEXT NOT NULL,
        previous_name TEXT,
        previous_description TEXT,
        previous_priority INTEGER,
        previous_enabled INTEGER CHECK(previous_enabled IS NULL OR previous_enabled IN (0, 1)),
        previous_claim_target_hours INTEGER,
        previous_review_target_hours INTEGER,
        name TEXT NOT NULL,
        description TEXT,
        priority INTEGER NOT NULL,
        enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
        claim_target_hours INTEGER,
        review_target_hours INTEGER,
        actor_label TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_source_intelligence_policy_cohort_events_time
        ON source_intelligence_policy_cohort_events(occurred_at DESC, event_id DESC);

      CREATE TABLE IF NOT EXISTS source_intelligence_policy_membership_events (
        event_id TEXT PRIMARY KEY,
        cohort_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        action TEXT NOT NULL,
        previous_present INTEGER CHECK(previous_present IS NULL OR previous_present IN (0, 1)),
        present INTEGER NOT NULL CHECK(present IN (0, 1)),
        actor_label TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_source_intelligence_policy_membership_events_time
        ON source_intelligence_policy_membership_events(occurred_at DESC, event_id DESC);
      CREATE INDEX IF NOT EXISTS idx_source_intelligence_policy_membership_events_source
        ON source_intelligence_policy_membership_events(source_id, occurred_at DESC);
    `);
    this.backfillAuditSnapshots();
  }

  private backfillAuditSnapshots(): void {
    const cohorts = this.database.prepare("SELECT * FROM source_intelligence_policy_cohorts").all();
    for (const raw of cohorts) {
      const row = raw as Record<string, unknown>;
      const cohortId = String(row.cohort_id);
      const event = this.database
        .prepare(
          "SELECT event_id FROM source_intelligence_policy_cohort_events WHERE cohort_id = ? LIMIT 1",
        )
        .get(cohortId) as Record<string, unknown> | undefined;
      if (event) continue;
      this.database
        .prepare(
          `INSERT OR IGNORE INTO source_intelligence_policy_cohort_events (
             event_id, cohort_id, action,
             previous_name, previous_description, previous_priority, previous_enabled,
             previous_claim_target_hours, previous_review_target_hours,
             name, description, priority, enabled, claim_target_hours, review_target_hours,
             actor_label, occurred_at
           ) VALUES (?, ?, 'SNAPSHOT_BACKFILL', NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          stableBackfillEventId("sica", `${cohortId}:${String(row.updated_at)}`),
          cohortId,
          String(row.name),
          row.description ?? null,
          Number(row.priority),
          Number(row.enabled),
          row.claim_target_hours ?? null,
          row.review_target_hours ?? null,
          String(row.updated_by),
          String(row.updated_at),
        );
    }

    const memberships = this.database
      .prepare("SELECT * FROM source_intelligence_policy_cohort_memberships")
      .all();
    for (const raw of memberships) {
      const row = raw as Record<string, unknown>;
      const cohortId = String(row.cohort_id);
      const sourceId = String(row.source_id);
      const event = this.database
        .prepare(
          `SELECT event_id FROM source_intelligence_policy_membership_events
           WHERE cohort_id = ? AND source_id = ? LIMIT 1`,
        )
        .get(cohortId, sourceId) as Record<string, unknown> | undefined;
      if (event) continue;
      this.database
        .prepare(
          `INSERT OR IGNORE INTO source_intelligence_policy_membership_events (
             event_id, cohort_id, source_id, action, previous_present, present,
             actor_label, occurred_at
           ) VALUES (?, ?, ?, 'SNAPSHOT_BACKFILL', NULL, 1, ?, ?)`,
        )
        .run(
          stableBackfillEventId("sima", `${cohortId}:${sourceId}:${String(row.added_at)}`),
          cohortId,
          sourceId,
          String(row.added_by),
          String(row.added_at),
        );
    }
  }

  getCohort(cohortId: string): SourceIntelligencePolicyCohortV2 | null {
    const id = normalizedCohortId(cohortId);
    const row = this.database
      .prepare("SELECT * FROM source_intelligence_policy_cohorts WHERE cohort_id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? parseCohort(row) : null;
  }

  listCohorts(): SourceIntelligencePolicyCohortV2[] {
    return this.database
      .prepare(
        `SELECT * FROM source_intelligence_policy_cohorts
         ORDER BY enabled DESC, priority DESC, name ASC, cohort_id ASC`,
      )
      .all()
      .map((row) => parseCohort(row as Record<string, unknown>));
  }

  saveCohort(input: SaveSourceIntelligencePolicyCohortInput): SourceIntelligencePolicyCohortV2 {
    const actor = requiredText(input.actor, "actor", MAX_OPERATOR_LENGTH);
    const name = requiredText(input.name, "name", MAX_NAME_LENGTH);
    const description = optionalText(input.description, "description", MAX_DESCRIPTION_LENGTH);
    const priority = priorityValue(input.priority);
    const claimTargetHours = targetHours(input.claimTargetHours, "claimTargetHours");
    const reviewTargetHours = targetHours(input.reviewTargetHours, "reviewTargetHours");
    const existing = input.cohortId ? this.getCohort(input.cohortId) : null;

    if (input.cohortId && !existing) {
      throw new RegistryConflictError(
        "SOURCE_INTELLIGENCE_POLICY_COHORT_MISSING",
        "Policy cohort no longer exists; reload before updating",
        { cohortId: input.cohortId },
      );
    }
    const currentUpdatedAt = existing?.updatedAt ?? null;
    if (input.expectedUpdatedAt !== currentUpdatedAt) {
      throw new RegistryConflictError(
        "SOURCE_INTELLIGENCE_POLICY_COHORT_CHANGED",
        "Policy cohort changed before this update was saved; reload before retrying",
        {
          cohortId: input.cohortId ?? null,
          expectedUpdatedAt: input.expectedUpdatedAt,
          currentUpdatedAt,
        },
      );
    }

    const cohortId = existing?.cohortId ?? `sic_${randomUUID().replaceAll("-", "")}`;
    if (input.enabled) {
      const conflict = this.database
        .prepare(
          `SELECT cohort_id, name FROM source_intelligence_policy_cohorts
           WHERE enabled = 1 AND priority = ? AND cohort_id <> ? LIMIT 1`,
        )
        .get(priority, cohortId) as Record<string, unknown> | undefined;
      if (conflict) {
        throw new RegistryConflictError(
          "SOURCE_INTELLIGENCE_POLICY_PRIORITY_CONFLICT",
          "Enabled policy cohort priorities must be unique; choose a different priority",
          {
            priority,
            conflictingCohortId: String(conflict.cohort_id),
            conflictingName: String(conflict.name),
          },
        );
      }
    }

    const timestamp = this.clock().toISOString();
    const eventId = `sica_${randomUUID().replaceAll("-", "")}`;
    const action = existing ? "COHORT_UPDATED" : "COHORT_CREATED";
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database
        .prepare(
          `INSERT INTO source_intelligence_policy_cohorts (
             cohort_id, name, description, priority, enabled,
             claim_target_hours, review_target_hours, updated_by, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(cohort_id) DO UPDATE SET
             name = excluded.name,
             description = excluded.description,
             priority = excluded.priority,
             enabled = excluded.enabled,
             claim_target_hours = excluded.claim_target_hours,
             review_target_hours = excluded.review_target_hours,
             updated_by = excluded.updated_by,
             updated_at = excluded.updated_at`,
        )
        .run(
          cohortId,
          name,
          description ?? null,
          priority,
          input.enabled ? 1 : 0,
          claimTargetHours,
          reviewTargetHours,
          actor,
          timestamp,
        );
      this.database
        .prepare(
          `INSERT INTO source_intelligence_policy_cohort_events (
             event_id, cohort_id, action,
             previous_name, previous_description, previous_priority, previous_enabled,
             previous_claim_target_hours, previous_review_target_hours,
             name, description, priority, enabled, claim_target_hours, review_target_hours,
             actor_label, occurred_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          eventId,
          cohortId,
          action,
          existing?.name ?? null,
          existing?.description ?? null,
          existing?.priority ?? null,
          existing ? (existing.enabled ? 1 : 0) : null,
          existing?.claimTargetHours ?? null,
          existing?.reviewTargetHours ?? null,
          name,
          description ?? null,
          priority,
          input.enabled ? 1 : 0,
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
    const saved = this.getCohort(cohortId);
    if (!saved) throw new Error("Failed to persist Source Intelligence policy cohort");
    return saved;
  }

  listMemberships(
    filters: { sourceIds?: string[]; cohortIds?: string[] } = {},
  ): SourceIntelligencePolicyCohortMembershipV2[] {
    const sourceIds = normalizedValues(filters.sourceIds, "source ids");
    const cohortIds = normalizedValues(filters.cohortIds, "cohort ids").map(normalizedCohortId);
    const clauses: string[] = [];
    const values: SQLInputValue[] = [];
    if (sourceIds.length > 0) {
      clauses.push(`source_id IN (${sourceIds.map(() => "?").join(", ")})`);
      values.push(...sourceIds);
    }
    if (cohortIds.length > 0) {
      clauses.push(`cohort_id IN (${cohortIds.map(() => "?").join(", ")})`);
      values.push(...cohortIds);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.database
      .prepare(
        `SELECT * FROM source_intelligence_policy_cohort_memberships
         ${where}
         ORDER BY source_id ASC, cohort_id ASC`,
      )
      .all(...values)
      .map((row) => parseMembership(row as Record<string, unknown>));
  }

  saveMembership(
    input: SaveSourceIntelligencePolicyCohortMembershipInput,
  ): SourceIntelligencePolicyCohortMembershipV2 | null {
    const cohortId = normalizedCohortId(input.cohortId);
    const sourceId = requiredText(input.sourceId, "sourceId", 500);
    const actor = requiredText(input.actor, "actor", MAX_OPERATOR_LENGTH);
    if (!this.getCohort(cohortId)) {
      throw new RegistryConflictError(
        "SOURCE_INTELLIGENCE_POLICY_COHORT_MISSING",
        "Policy cohort no longer exists; reload before changing membership",
        { cohortId },
      );
    }
    const existing = this.database
      .prepare(
        `SELECT * FROM source_intelligence_policy_cohort_memberships
         WHERE cohort_id = ? AND source_id = ?`,
      )
      .get(cohortId, sourceId) as Record<string, unknown> | undefined;
    const present = Boolean(existing);
    if (present !== input.expectedPresent) {
      throw new RegistryConflictError(
        "SOURCE_INTELLIGENCE_POLICY_MEMBERSHIP_CHANGED",
        "Cohort membership changed before this update was saved; reload before retrying",
        { cohortId, sourceId, expectedPresent: input.expectedPresent, currentPresent: present },
      );
    }

    const timestamp = this.clock().toISOString();
    const eventId = `sima_${randomUUID().replaceAll("-", "")}`;
    if (input.action === "ADDED") {
      if (present) {
        throw new RegistryConflictError(
          "SOURCE_INTELLIGENCE_POLICY_MEMBERSHIP_PRESENT",
          "Source is already a member of this cohort",
          { cohortId, sourceId },
        );
      }
      this.database.exec("BEGIN IMMEDIATE;");
      try {
        this.database
          .prepare(
            `INSERT INTO source_intelligence_policy_cohort_memberships (
               cohort_id, source_id, added_by, added_at
             ) VALUES (?, ?, ?, ?)`,
          )
          .run(cohortId, sourceId, actor, timestamp);
        this.database
          .prepare(
            `INSERT INTO source_intelligence_policy_membership_events (
               event_id, cohort_id, source_id, action, previous_present, present,
               actor_label, occurred_at
             ) VALUES (?, ?, ?, 'MEMBERSHIP_ADDED', 0, 1, ?, ?)`,
          )
          .run(eventId, cohortId, sourceId, actor, timestamp);
        this.database.exec("COMMIT;");
      } catch (error) {
        this.database.exec("ROLLBACK;");
        throw error;
      }
      const row = this.database
        .prepare(
          `SELECT * FROM source_intelligence_policy_cohort_memberships
           WHERE cohort_id = ? AND source_id = ?`,
        )
        .get(cohortId, sourceId) as Record<string, unknown> | undefined;
      if (!row) throw new Error("Failed to persist Source Intelligence cohort membership");
      return parseMembership(row);
    }

    if (input.action === "REMOVED") {
      if (!present) {
        throw new RegistryConflictError(
          "SOURCE_INTELLIGENCE_POLICY_MEMBERSHIP_MISSING",
          "Source is not a member of this cohort",
          { cohortId, sourceId },
        );
      }
      this.database.exec("BEGIN IMMEDIATE;");
      try {
        this.database
          .prepare(
            `DELETE FROM source_intelligence_policy_cohort_memberships
             WHERE cohort_id = ? AND source_id = ?`,
          )
          .run(cohortId, sourceId);
        this.database
          .prepare(
            `INSERT INTO source_intelligence_policy_membership_events (
               event_id, cohort_id, source_id, action, previous_present, present,
               actor_label, occurred_at
             ) VALUES (?, ?, ?, 'MEMBERSHIP_REMOVED', 1, 0, ?, ?)`,
          )
          .run(eventId, cohortId, sourceId, actor, timestamp);
        this.database.exec("COMMIT;");
      } catch (error) {
        this.database.exec("ROLLBACK;");
        throw error;
      }
      return null;
    }

    throw new RegistryValidationError("membership action must be ADDED or REMOVED");
  }

  listCohortAuditEvents(
    filters: SourceIntelligencePolicyAuditEventFilters = {},
  ): SourceIntelligencePolicyAuditEventV2[] {
    const cohortIds = normalizedValues(filters.cohortIds, "cohort ids").map(normalizedCohortId);
    const limit = normalizeEventLimit(filters.limit);
    const offset = normalizeEventOffset(filters.offset);
    const values: SQLInputValue[] = [];
    const where = cohortIds.length
      ? `WHERE cohort_id IN (${cohortIds.map(() => "?").join(", ")})`
      : "";
    values.push(...cohortIds);
    return this.database
      .prepare(
        `SELECT * FROM source_intelligence_policy_cohort_events
         ${where}
         ORDER BY occurred_at DESC, event_id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...values, limit, offset)
      .map((row) => parseCohortAuditEvent(row as Record<string, unknown>));
  }

  listMembershipAuditEvents(
    filters: SourceIntelligencePolicyAuditEventFilters = {},
  ): SourceIntelligencePolicyAuditEventV2[] {
    const sourceIds = normalizedValues(filters.sourceIds, "source ids");
    const cohortIds = normalizedValues(filters.cohortIds, "cohort ids").map(normalizedCohortId);
    const limit = normalizeEventLimit(filters.limit);
    const offset = normalizeEventOffset(filters.offset);
    const clauses: string[] = [];
    const values: SQLInputValue[] = [];
    if (sourceIds.length) {
      clauses.push(`source_id IN (${sourceIds.map(() => "?").join(", ")})`);
      values.push(...sourceIds);
    }
    if (cohortIds.length) {
      clauses.push(`cohort_id IN (${cohortIds.map(() => "?").join(", ")})`);
      values.push(...cohortIds);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.database
      .prepare(
        `SELECT * FROM source_intelligence_policy_membership_events
         ${where}
         ORDER BY occurred_at DESC, event_id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...values, limit, offset)
      .map((row) => parseMembershipAuditEvent(row as Record<string, unknown>));
  }
}
