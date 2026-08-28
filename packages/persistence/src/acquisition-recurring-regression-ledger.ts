import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  isAcquisitionRecurringRegressionResult,
  type AcquisitionRecurringRegressionResultV1,
  type AcquisitionStrategyGovernanceActor,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "./index";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export type PersistedAcquisitionRegressionSnapshot = {
  id: string;
  result: AcquisitionRecurringRegressionResultV1;
  createdAt: string;
};

export type AcquisitionAcceptedBaseline = {
  sourceId: string;
  playbookId: string;
  playbookRevision: number;
  runId: string;
  finishedAt: string;
  version: number;
  advancementEventId: string;
  updatedAt: string;
};

export type AcquisitionBaselineAdvancementEvent = {
  id: string;
  sourceId: string;
  playbookId: string;
  playbookRevision: number;
  previousBaselineRunId: string | null;
  newBaselineRunId: string;
  advancedAt: string;
  actor: AcquisitionStrategyGovernanceActor;
  authorizationRef: string;
  rationale: string;
  evidenceRefs: string[];
  boundaries: {
    autoDispatchApplied: false;
    autoPromotionApplied: false;
    collectionAuthorityGranted: false;
    activePlaybookRewritten: false;
  };
};

export type AcquisitionBaselineAdvancementAuthorization = {
  decision: "APPROVED";
  authorizationRef: string;
  actor: AcquisitionStrategyGovernanceActor;
  rationale: string;
  advancedAt: string;
  evidenceRefs: string[];
};

export function ensureAcquisitionRecurringRegressionLedger(database: DatabaseSync): void {
  if (INITIALIZED_DATABASES.has(database)) return;
  database.exec(`
    CREATE TABLE IF NOT EXISTS acquisition_recurring_regression_snapshots (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      playbook_id TEXT NOT NULL,
      playbook_revision INTEGER NOT NULL,
      baseline_run_id TEXT NOT NULL,
      current_run_id TEXT NOT NULL,
      current_finished_at TEXT NOT NULL,
      state TEXT NOT NULL CHECK (
        state IN (
          'UNCHANGED',
          'EXPECTED_CHANGE',
          'COVERAGE_DEGRADED',
          'SOURCE_IDENTITY_DRIFT',
          'PLAYBOOK_BEHAVIOR_DRIFT',
          'INSUFFICIENT_EVIDENCE'
        )
      ),
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, playbook_id, playbook_revision, baseline_run_id, current_run_id)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS acquisition_recurring_regression_history_idx
      ON acquisition_recurring_regression_snapshots(
        source_id,
        playbook_id,
        playbook_revision,
        current_finished_at,
        current_run_id
      );

    CREATE TABLE IF NOT EXISTS acquisition_accepted_baselines (
      source_id TEXT NOT NULL,
      playbook_id TEXT NOT NULL,
      playbook_revision INTEGER NOT NULL,
      run_id TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      version INTEGER NOT NULL,
      advancement_event_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(source_id, playbook_id, playbook_revision)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS acquisition_baseline_advancement_events (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      playbook_id TEXT NOT NULL,
      playbook_revision INTEGER NOT NULL,
      previous_baseline_run_id TEXT,
      new_baseline_run_id TEXT NOT NULL,
      advanced_at TEXT NOT NULL,
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;

    CREATE INDEX IF NOT EXISTS acquisition_baseline_advancement_history_idx
      ON acquisition_baseline_advancement_events(
        source_id,
        playbook_id,
        playbook_revision,
        advanced_at,
        id
      );
  `);
  INITIALIZED_DATABASES.add(database);
}

function stableId(prefix: string, identity: unknown): string {
  return `${prefix}_${createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 32)}`;
}

function snapshotId(result: AcquisitionRecurringRegressionResultV1): string {
  return stableId("arr", {
    sourceId: result.sourceId,
    playbookId: result.playbookId,
    playbookRevision: result.playbookRevision,
    baselineRunId: result.baselineRunId,
    currentRunId: result.currentRunId,
  });
}

function parseSnapshot(row: {
  id: string;
  document_json: string;
  created_at: string;
}): PersistedAcquisitionRegressionSnapshot {
  const result = JSON.parse(row.document_json) as unknown;
  if (!isAcquisitionRecurringRegressionResult(result)) {
    throw new RegistryValidationError(
      "Stored recurring acquisition regression snapshot is invalid",
    );
  }
  return { id: row.id, result, createdAt: row.created_at };
}

function validateDurableResult(result: AcquisitionRecurringRegressionResultV1): void {
  if (!isAcquisitionRecurringRegressionResult(result)) {
    throw new RegistryValidationError("Recurring acquisition regression result is invalid");
  }
  if (
    result.sourceId === "UNKNOWN" ||
    result.playbookId === "UNKNOWN" ||
    result.baselineRunId === "MISSING" ||
    result.currentRunId === "MISSING"
  ) {
    throw new RegistryConflictError(
      "ACQUISITION_REGRESSION_DURABLE_IDENTITY_MISSING",
      "Durable regression snapshots require exact source, playbook, baseline-run, and current-run identities",
    );
  }
  if (!result.evidenceRefs.includes(`acquisition-run:${result.baselineRunId}`)) {
    throw new RegistryConflictError(
      "ACQUISITION_REGRESSION_BASELINE_EVIDENCE_MISSING",
      "Durable regression snapshot is missing its exact baseline run evidence reference",
    );
  }
  if (!result.evidenceRefs.includes(`acquisition-run:${result.currentRunId}`)) {
    throw new RegistryConflictError(
      "ACQUISITION_REGRESSION_CURRENT_EVIDENCE_MISSING",
      "Durable regression snapshot is missing its exact current run evidence reference",
    );
  }
}

function parseBaseline(
  row: Record<string, unknown> | undefined,
): AcquisitionAcceptedBaseline | null {
  if (!row) return null;
  return {
    sourceId: String(row.source_id),
    playbookId: String(row.playbook_id),
    playbookRevision: Number(row.playbook_revision),
    runId: String(row.run_id),
    finishedAt: String(row.finished_at),
    version: Number(row.version),
    advancementEventId: String(row.advancement_event_id),
    updatedAt: String(row.updated_at),
  };
}

function parseAdvancement(
  row: { document_json: string } | undefined,
): AcquisitionBaselineAdvancementEvent | null {
  return row?.document_json
    ? (JSON.parse(row.document_json) as AcquisitionBaselineAdvancementEvent)
    : null;
}

function validateAuthorization(input: AcquisitionBaselineAdvancementAuthorization): void {
  if (input.decision !== "APPROVED") {
    throw new RegistryConflictError(
      "ACQUISITION_BASELINE_ADVANCEMENT_NOT_AUTHORIZED",
      "Baseline advancement requires an explicit APPROVED governance decision",
    );
  }
  if (!input.authorizationRef.trim()) {
    throw new RegistryValidationError("authorizationRef is required");
  }
  if (!input.actor.actorId.trim()) {
    throw new RegistryValidationError("actorId is required");
  }
  if (!input.rationale.trim()) {
    throw new RegistryValidationError("rationale is required");
  }
  if (!Number.isFinite(Date.parse(input.advancedAt))) {
    throw new RegistryValidationError("advancedAt must be a valid timestamp");
  }
  if (input.evidenceRefs.length === 0 || input.evidenceRefs.some((ref) => !ref.trim())) {
    throw new RegistryValidationError("baseline advancement requires non-empty evidenceRefs");
  }
}

export class SqliteAcquisitionRecurringRegressionLedger {
  constructor(private readonly database: DatabaseSync) {
    ensureAcquisitionRecurringRegressionLedger(database);
  }

  recordSnapshot(
    result: AcquisitionRecurringRegressionResultV1,
  ): PersistedAcquisitionRegressionSnapshot {
    validateDurableResult(result);
    const id = snapshotId(result);
    const serialized = JSON.stringify(result);
    const existing = this.database
      .prepare(
        "SELECT id, document_json, created_at FROM acquisition_recurring_regression_snapshots WHERE id = ?",
      )
      .get(id) as { id: string; document_json: string; created_at: string } | undefined;
    if (existing) {
      if (existing.document_json !== serialized) {
        throw new RegistryConflictError(
          "ACQUISITION_REGRESSION_REPLAY_CONFLICT",
          "The same baseline/current regression identity was replayed with different evidence",
          { id },
        );
      }
      return parseSnapshot(existing);
    }

    this.database
      .prepare(
        `INSERT INTO acquisition_recurring_regression_snapshots (
          id, source_id, playbook_id, playbook_revision, baseline_run_id,
          current_run_id, current_finished_at, state, document_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        result.sourceId,
        result.playbookId,
        result.playbookRevision,
        result.baselineRunId,
        result.currentRunId,
        result.currentFinishedAt,
        result.state,
        serialized,
      );
    return this.getSnapshot(id)!;
  }

  getSnapshot(id: string): PersistedAcquisitionRegressionSnapshot | null {
    const row = this.database
      .prepare(
        "SELECT id, document_json, created_at FROM acquisition_recurring_regression_snapshots WHERE id = ?",
      )
      .get(id) as { id: string; document_json: string; created_at: string } | undefined;
    return row ? parseSnapshot(row) : null;
  }

  listHistory(input: {
    sourceId: string;
    playbookId: string;
    playbookRevision: number;
  }): PersistedAcquisitionRegressionSnapshot[] {
    const rows = this.database
      .prepare(
        `SELECT id, document_json, created_at
         FROM acquisition_recurring_regression_snapshots
         WHERE source_id = ? AND playbook_id = ? AND playbook_revision = ?
         ORDER BY current_finished_at ASC, current_run_id ASC, id ASC`,
      )
      .all(input.sourceId, input.playbookId, input.playbookRevision) as Array<{
      id: string;
      document_json: string;
      created_at: string;
    }>;
    return rows.map(parseSnapshot);
  }

  getAcceptedBaseline(input: {
    sourceId: string;
    playbookId: string;
    playbookRevision: number;
  }): AcquisitionAcceptedBaseline | null {
    const row = this.database
      .prepare(
        `SELECT source_id, playbook_id, playbook_revision, run_id, finished_at,
                version, advancement_event_id, updated_at
         FROM acquisition_accepted_baselines
         WHERE source_id = ? AND playbook_id = ? AND playbook_revision = ?`,
      )
      .get(input.sourceId, input.playbookId, input.playbookRevision) as
      Record<string, unknown> | undefined;
    return parseBaseline(row);
  }

  advanceBaseline(
    snapshotIdValue: string,
    authorization: AcquisitionBaselineAdvancementAuthorization,
  ): {
    baseline: AcquisitionAcceptedBaseline;
    event: AcquisitionBaselineAdvancementEvent;
    replayed: boolean;
  } {
    validateAuthorization(authorization);
    const snapshot = this.getSnapshot(snapshotIdValue);
    if (!snapshot) {
      throw new RegistryConflictError(
        "ACQUISITION_BASELINE_SNAPSHOT_NOT_FOUND",
        "Baseline advancement requires an existing durable regression snapshot",
        { snapshotId: snapshotIdValue },
      );
    }
    if (snapshot.result.state === "INSUFFICIENT_EVIDENCE") {
      throw new RegistryConflictError(
        "ACQUISITION_BASELINE_EVIDENCE_INSUFFICIENT",
        "An insufficient-evidence regression snapshot cannot become an accepted baseline",
      );
    }

    const previous = this.getAcceptedBaseline(snapshot.result);
    const eventId = stableId("aba", {
      snapshotId: snapshot.id,
      previousBaselineRunId: previous?.runId ?? null,
      newBaselineRunId: snapshot.result.currentRunId,
      authorizationRef: authorization.authorizationRef,
    });
    const existingEvent = parseAdvancement(
      this.database
        .prepare("SELECT document_json FROM acquisition_baseline_advancement_events WHERE id = ?")
        .get(eventId) as { document_json: string } | undefined,
    );
    if (existingEvent) {
      const baseline = this.getAcceptedBaseline(snapshot.result);
      if (!baseline || baseline.advancementEventId !== eventId) {
        throw new RegistryConflictError(
          "ACQUISITION_BASELINE_REPLAY_POINTER_CONFLICT",
          "Replayed baseline advancement no longer matches the accepted baseline pointer",
          { eventId },
        );
      }
      return { baseline, event: existingEvent, replayed: true };
    }

    const refs = [
      ...new Set([
        ...snapshot.result.evidenceRefs,
        ...authorization.evidenceRefs,
        `regression-snapshot:${snapshot.id}`,
        authorization.authorizationRef,
      ]),
    ].sort();
    const event: AcquisitionBaselineAdvancementEvent = {
      id: eventId,
      sourceId: snapshot.result.sourceId,
      playbookId: snapshot.result.playbookId,
      playbookRevision: snapshot.result.playbookRevision,
      previousBaselineRunId: previous?.runId ?? null,
      newBaselineRunId: snapshot.result.currentRunId,
      advancedAt: authorization.advancedAt,
      actor: authorization.actor,
      authorizationRef: authorization.authorizationRef,
      rationale: authorization.rationale.trim(),
      evidenceRefs: refs,
      boundaries: {
        autoDispatchApplied: false,
        autoPromotionApplied: false,
        collectionAuthorityGranted: false,
        activePlaybookRewritten: false,
      },
    };

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `INSERT INTO acquisition_baseline_advancement_events (
            id, source_id, playbook_id, playbook_revision, previous_baseline_run_id,
            new_baseline_run_id, advanced_at, document_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          event.id,
          event.sourceId,
          event.playbookId,
          event.playbookRevision,
          event.previousBaselineRunId,
          event.newBaselineRunId,
          event.advancedAt,
          JSON.stringify(event),
        );

      const nextVersion = (previous?.version ?? 0) + 1;
      this.database
        .prepare(
          `INSERT INTO acquisition_accepted_baselines (
            source_id, playbook_id, playbook_revision, run_id, finished_at,
            version, advancement_event_id, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_id, playbook_id, playbook_revision) DO UPDATE SET
            run_id = excluded.run_id,
            finished_at = excluded.finished_at,
            version = excluded.version,
            advancement_event_id = excluded.advancement_event_id,
            updated_at = excluded.updated_at`,
        )
        .run(
          event.sourceId,
          event.playbookId,
          event.playbookRevision,
          event.newBaselineRunId,
          snapshot.result.currentFinishedAt,
          nextVersion,
          event.id,
          event.advancedAt,
        );
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }

    return {
      baseline: this.getAcceptedBaseline(snapshot.result)!,
      event,
      replayed: false,
    };
  }

  listBaselineAdvancements(input: {
    sourceId: string;
    playbookId: string;
    playbookRevision: number;
  }): AcquisitionBaselineAdvancementEvent[] {
    const rows = this.database
      .prepare(
        `SELECT document_json FROM acquisition_baseline_advancement_events
         WHERE source_id = ? AND playbook_id = ? AND playbook_revision = ?
         ORDER BY advanced_at ASC, id ASC`,
      )
      .all(input.sourceId, input.playbookId, input.playbookRevision) as Array<{
      document_json: string;
    }>;
    return rows.map((row) => JSON.parse(row.document_json) as AcquisitionBaselineAdvancementEvent);
  }
}
