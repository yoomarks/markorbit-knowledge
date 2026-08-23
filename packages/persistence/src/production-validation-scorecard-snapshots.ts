import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { RegistryValidationError } from "./index";
import type { ProductionValidationScorecard } from "./production-validation-scorecard";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export type ProductionValidationScorecardSnapshot = {
  id: string;
  workspaceId: string;
  waveId: string;
  capturedAt: string;
  idempotencyKey: string;
  contentSha256: string;
  scorecard: ProductionValidationScorecard;
};

export function ensureProductionValidationScorecardSnapshotRegistry(
  database: DatabaseSync,
): void {
  if (INITIALIZED_DATABASES.has(database)) return;
  database.exec(`
    CREATE TABLE IF NOT EXISTS production_validation_scorecard_snapshots (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      wave_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      scorecard_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, wave_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS production_validation_scorecard_snapshots_scope_idx
      ON production_validation_scorecard_snapshots(
        workspace_id, wave_id, captured_at DESC, created_at DESC, id DESC
      );
  `);
  INITIALIZED_DATABASES.add(database);
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function digest(scorecard: ProductionValidationScorecard): string {
  return createHash("sha256").update(JSON.stringify(scorecard)).digest("hex");
}

function rowToSnapshot(row: Record<string, unknown>): ProductionValidationScorecardSnapshot {
  const scorecard = JSON.parse(String(row.scorecard_json)) as ProductionValidationScorecard;
  const contentSha256 = String(row.content_sha256);
  if (digest(scorecard) !== contentSha256) {
    throw new RegistryValidationError(
      `Production validation scorecard snapshot ${String(row.id)} failed digest verification`,
    );
  }
  if (
    scorecard.workspaceId !== String(row.workspace_id) ||
    scorecard.waveId !== String(row.wave_id)
  ) {
    throw new RegistryValidationError(
      `Production validation scorecard snapshot ${String(row.id)} failed scope verification`,
    );
  }
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    waveId: String(row.wave_id),
    capturedAt: String(row.captured_at),
    idempotencyKey: String(row.idempotency_key),
    contentSha256,
    scorecard,
  };
}

export class SqliteProductionValidationScorecardSnapshotRepository {
  constructor(private readonly database: DatabaseSync) {
    ensureProductionValidationScorecardSnapshotRegistry(database);
  }

  findByIdempotencyKey(input: {
    workspaceId: string;
    waveId: string;
    idempotencyKey: string;
  }): ProductionValidationScorecardSnapshot | null {
    const row = this.database
      .prepare(
        `SELECT * FROM production_validation_scorecard_snapshots
         WHERE workspace_id = ? AND wave_id = ? AND idempotency_key = ?`,
      )
      .get(
        requireText(input.workspaceId, "workspaceId"),
        requireText(input.waveId, "waveId"),
        requireText(input.idempotencyKey, "idempotencyKey"),
      ) as Record<string, unknown> | undefined;
    return row ? rowToSnapshot(row) : null;
  }

  capture(
    input: {
      scorecard: ProductionValidationScorecard;
      idempotencyKey: string;
    },
    clock: () => Date = () => new Date(),
  ): ProductionValidationScorecardSnapshot {
    const workspaceId = requireText(input.scorecard.workspaceId, "scorecard.workspaceId");
    const waveId = requireText(input.scorecard.waveId, "scorecard.waveId");
    const idempotencyKey = requireText(input.idempotencyKey, "idempotencyKey");
    const existing = this.findByIdempotencyKey({ workspaceId, waveId, idempotencyKey });
    if (existing) return existing;
    const capturedAt = clock().toISOString();
    const contentSha256 = digest(input.scorecard);
    const id = randomUUID();
    this.database
      .prepare(
        `INSERT OR IGNORE INTO production_validation_scorecard_snapshots (
           id, workspace_id, wave_id, captured_at, idempotency_key, content_sha256, scorecard_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        workspaceId,
        waveId,
        capturedAt,
        idempotencyKey,
        contentSha256,
        JSON.stringify(input.scorecard),
      );
    return this.findByIdempotencyKey({ workspaceId, waveId, idempotencyKey })!;
  }

  list(input: {
    workspaceId: string;
    waveId: string;
    limit?: number;
  }): ProductionValidationScorecardSnapshot[] {
    const limit = input.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new RegistryValidationError("limit must be an integer between 1 and 100");
    }
    return (this.database
      .prepare(
        `SELECT * FROM production_validation_scorecard_snapshots
         WHERE workspace_id = ? AND wave_id = ?
         ORDER BY captured_at DESC, created_at DESC, id DESC LIMIT ?`,
      )
      .all(
        requireText(input.workspaceId, "workspaceId"),
        requireText(input.waveId, "waveId"),
        limit,
      ) as Array<Record<string, unknown>>).map(rowToSnapshot);
  }
}
