import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { PageValueScreeningItemV1, PageValueScreeningResponseV1 } from "@markorbit/contracts";
import { RegistryValidationError, initializeRegistry } from "./index";

const MIGRATION_ID = "1030_page_value_capability_results";

export type PageValueCapabilityRecord = {
  id: string;
  candidateId: string;
  item: PageValueScreeningItemV1;
  provider: PageValueScreeningResponseV1["provider"];
  generatedAt: string;
  recordedAt: string;
};

function ensureMigration(database: DatabaseSync): void {
  initializeRegistry(database);
  const applied = database
    .prepare("SELECT id FROM schema_migrations WHERE id = ?")
    .get(MIGRATION_ID);
  if (applied) return;

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS page_value_capability_results (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL,
        item_json TEXT NOT NULL,
        provider_json TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        FOREIGN KEY (candidate_id) REFERENCES source_candidates(candidate_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_page_value_results_candidate_time
        ON page_value_capability_results(candidate_id, generated_at DESC, recorded_at DESC);
      CREATE INDEX IF NOT EXISTS idx_page_value_results_batch_time
        ON page_value_capability_results(recorded_at DESC);
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

function parse(row: Record<string, unknown>): PageValueCapabilityRecord {
  return {
    id: String(row.id),
    candidateId: String(row.candidate_id),
    item: JSON.parse(String(row.item_json)) as PageValueScreeningItemV1,
    provider: JSON.parse(String(row.provider_json)) as PageValueScreeningResponseV1["provider"],
    generatedAt: String(row.generated_at),
    recordedAt: String(row.recorded_at),
  };
}

function normalizedCandidateIds(candidateIds: string[]): string[] {
  return [...new Set(candidateIds.map((value) => value.trim()).filter(Boolean))];
}

export class SqlitePageValueCapabilityRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    ensureMigration(database);
  }

  record(response: PageValueScreeningResponseV1): PageValueCapabilityRecord[] {
    const recordedAt = this.clock().toISOString();
    const records: PageValueCapabilityRecord[] = [];
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      for (const item of response.items) {
        const candidate = this.database
          .prepare("SELECT 1 AS present FROM source_candidates WHERE candidate_id = ?")
          .get(item.candidateId) as { present: number } | undefined;
        if (!candidate) {
          throw new RegistryValidationError(
            `Page value result candidate ${item.candidateId} is not registered`,
          );
        }
        const record: PageValueCapabilityRecord = {
          id: `pvr_${randomUUID().replaceAll("-", "")}`,
          candidateId: item.candidateId,
          item,
          provider: response.provider,
          generatedAt: response.generatedAt,
          recordedAt,
        };
        this.database
          .prepare(
            `INSERT INTO page_value_capability_results (
               id, candidate_id, item_json, provider_json, generated_at, recorded_at
             ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            record.id,
            record.candidateId,
            JSON.stringify(record.item),
            JSON.stringify(record.provider),
            record.generatedAt,
            record.recordedAt,
          );
        records.push(record);
      }
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
    return records;
  }

  latestForCandidate(candidateId: string): PageValueCapabilityRecord | null {
    const row = this.database
      .prepare(
        `SELECT * FROM page_value_capability_results
         WHERE candidate_id = ?
         ORDER BY generated_at DESC, recorded_at DESC, id DESC
         LIMIT 1`,
      )
      .get(candidateId) as Record<string, unknown> | undefined;
    return row ? parse(row) : null;
  }

  latestScreening(candidateIds: string[]): Record<string, PageValueCapabilityRecord> {
    const unique = normalizedCandidateIds(candidateIds);
    if (unique.length === 0) return {};
    const placeholders = unique.map(() => "?").join(", ");
    const batch = this.database
      .prepare(
        `SELECT MAX(recorded_at) AS recorded_at
         FROM page_value_capability_results
         WHERE candidate_id IN (${placeholders})`,
      )
      .get(...unique) as { recorded_at: string | null } | undefined;
    if (!batch?.recorded_at) return {};

    const rows = this.database
      .prepare(
        `SELECT * FROM page_value_capability_results
         WHERE recorded_at = ? AND candidate_id IN (${placeholders})
         ORDER BY json_extract(item_json, '$.score') DESC, candidate_id ASC`,
      )
      .all(batch.recorded_at, ...unique) as Record<string, unknown>[];
    return Object.fromEntries(
      rows.map((row) => {
        const record = parse(row);
        return [record.candidateId, record];
      }),
    );
  }
}
