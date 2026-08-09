import type { DatabaseSync } from "node:sqlite";
import {
  SOURCE_INTELLIGENCE_HISTORICAL_POLICY_RESOLUTION_PROTOCOL_VERSION,
  type SourceIntelligencePolicyCohortMembershipV2,
  type SourceIntelligencePolicyCohortV2,
  type SourceIntelligencePolicyResolutionCheckpointV2,
} from "@markorbit/contracts";

const CHECKPOINT_ID = "source-intelligence-policy-resolution-baseline" as const;

export interface SourceIntelligencePolicyResolutionRepository {
  getCheckpoint(): SourceIntelligencePolicyResolutionCheckpointV2 | null;
  ensureCheckpoint(): SourceIntelligencePolicyResolutionCheckpointV2;
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function parseCohort(row: Record<string, unknown>): SourceIntelligencePolicyCohortV2 {
  return {
    cohortId: String(row.cohort_id),
    name: String(row.name),
    ...(row.description ? { description: String(row.description) } : {}),
    priority: Number(row.priority),
    enabled: Number(row.enabled) === 1,
    claimTargetHours: nullableNumber(row.claim_target_hours),
    reviewTargetHours: nullableNumber(row.review_target_hours),
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

function parseCheckpoint(
  row: Record<string, unknown>,
): SourceIntelligencePolicyResolutionCheckpointV2 {
  return {
    protocolVersion: SOURCE_INTELLIGENCE_HISTORICAL_POLICY_RESOLUTION_PROTOCOL_VERSION,
    checkpointId: CHECKPOINT_ID,
    checkpointAt: String(row.checkpoint_at),
    globalPolicy: JSON.parse(
      String(row.global_policy_json),
    ) as SourceIntelligencePolicyResolutionCheckpointV2["globalPolicy"],
    cohorts: JSON.parse(String(row.cohorts_json)) as SourceIntelligencePolicyCohortV2[],
    memberships: JSON.parse(
      String(row.memberships_json),
    ) as SourceIntelligencePolicyCohortMembershipV2[],
  };
}

export class SqliteSourceIntelligencePolicyResolutionRepository implements SourceIntelligencePolicyResolutionRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS source_intelligence_policy_resolution_checkpoints (
        checkpoint_id TEXT PRIMARY KEY,
        checkpoint_at TEXT NOT NULL,
        global_policy_json TEXT NOT NULL,
        cohorts_json TEXT NOT NULL,
        memberships_json TEXT NOT NULL
      ) STRICT;
    `);
  }

  getCheckpoint(): SourceIntelligencePolicyResolutionCheckpointV2 | null {
    const row = this.database
      .prepare(
        "SELECT * FROM source_intelligence_policy_resolution_checkpoints WHERE checkpoint_id = ?",
      )
      .get(CHECKPOINT_ID) as Record<string, unknown> | undefined;
    return row ? parseCheckpoint(row) : null;
  }

  ensureCheckpoint(): SourceIntelligencePolicyResolutionCheckpointV2 {
    const existing = this.getCheckpoint();
    if (existing) return existing;

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const raced = this.database
        .prepare(
          "SELECT * FROM source_intelligence_policy_resolution_checkpoints WHERE checkpoint_id = ?",
        )
        .get(CHECKPOINT_ID) as Record<string, unknown> | undefined;
      if (raced) {
        this.database.exec("COMMIT;");
        return parseCheckpoint(raced);
      }

      const policyRow = this.database
        .prepare(
          `SELECT claim_target_hours, review_target_hours, updated_by, updated_at
 FROM source_intelligence_manual_sla_policy
 WHERE policy_id = 'source-intelligence-review-workflow'`,
        )
        .get() as Record<string, unknown> | undefined;
      const globalPolicy = policyRow
        ? {
            claimTargetHours: nullableNumber(policyRow.claim_target_hours),
            reviewTargetHours: nullableNumber(policyRow.review_target_hours),
            updatedBy: String(policyRow.updated_by),
            updatedAt: String(policyRow.updated_at),
          }
        : null;
      const cohorts = this.database
        .prepare("SELECT * FROM source_intelligence_policy_cohorts ORDER BY cohort_id ASC")
        .all()
        .map((row) => parseCohort(row as Record<string, unknown>));
      const memberships = this.database
        .prepare(
          `SELECT * FROM source_intelligence_policy_cohort_memberships
 ORDER BY source_id ASC, cohort_id ASC`,
        )
        .all()
        .map((row) => parseMembership(row as Record<string, unknown>));
      const checkpointAt = this.clock().toISOString();

      this.database
        .prepare(
          `INSERT INTO source_intelligence_policy_resolution_checkpoints (
   checkpoint_id, checkpoint_at, global_policy_json, cohorts_json, memberships_json
 ) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          CHECKPOINT_ID,
          checkpointAt,
          JSON.stringify(globalPolicy),
          JSON.stringify(cohorts),
          JSON.stringify(memberships),
        );
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }

    const checkpoint = this.getCheckpoint();
    if (!checkpoint) throw new Error("Failed to create D2.17 policy resolution checkpoint");
    return checkpoint;
  }
}
