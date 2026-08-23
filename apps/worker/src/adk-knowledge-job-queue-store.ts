import { DatabaseSync } from "node:sqlite";
import {
  claimJob,
  type AiKnowledgeJob,
  type AiKnowledgeJobStatus,
} from "./adk-knowledge-job-queue";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();
const JOB_STATUSES = new Set([
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "RETRY_PENDING",
  "BLOCKED_CREDENTIAL",
  "BLOCKED_RECOVERY",
]);

export interface AiKnowledgeJobStore {
  put(job: AiKnowledgeJob): AiKnowledgeJob;
  save(job: AiKnowledgeJob): AiKnowledgeJob;
  saveIfStatus(
    job: AiKnowledgeJob,
    expectedStatus: AiKnowledgeJobStatus,
  ): AiKnowledgeJob | undefined;
  get(id: string): AiKnowledgeJob | undefined;
  getByExecutionKey(executionKey: string): AiKnowledgeJob | undefined;
  list(): AiKnowledgeJob[];
  claimNext(): AiKnowledgeJob | undefined;
}

function clone(job: AiKnowledgeJob): AiKnowledgeJob {
  return structuredClone(job);
}

function parseJob(value: string): AiKnowledgeJob {
  const parsed = JSON.parse(value) as unknown;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    typeof (parsed as AiKnowledgeJob).id !== "string" ||
    typeof (parsed as AiKnowledgeJob).assignmentId !== "string" ||
    typeof (parsed as AiKnowledgeJob).provider !== "string" ||
    !JOB_STATUSES.has((parsed as AiKnowledgeJob).status) ||
    !Number.isSafeInteger((parsed as AiKnowledgeJob).attempts) ||
    !Array.isArray((parsed as AiKnowledgeJob).artifactIds)
  ) {
    throw new Error("Persisted AI knowledge job is invalid");
  }
  return parsed as AiKnowledgeJob;
}

function executionKeyOf(job: AiKnowledgeJob): string {
  const executionKey = job.executionKey?.trim();
  if (!executionKey) {
    throw new Error("AI knowledge jobs require a non-empty executionKey");
  }
  return executionKey;
}

function assertImmutableIdentity(existing: AiKnowledgeJob, next: AiKnowledgeJob): void {
  if (
    existing.assignmentId !== next.assignmentId ||
    existing.provider !== next.provider ||
    existing.executionKey !== next.executionKey ||
    existing.createdAt !== next.createdAt
  ) {
    throw new Error(`AI knowledge job ${next.id} immutable identity changed`);
  }
}

export function ensureAiKnowledgeJobQueue(database: DatabaseSync): void {
  if (INITIALIZED_DATABASES.has(database)) return;
  database.exec(`
    CREATE TABLE IF NOT EXISTS ai_knowledge_jobs (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL CHECK (attempts >= 0),
      execution_key TEXT NOT NULL UNIQUE,
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS ai_knowledge_jobs_claim_idx
      ON ai_knowledge_jobs(status, created_at, id);
  `);
  INITIALIZED_DATABASES.add(database);
}

export class SqliteAiKnowledgeJobStore implements AiKnowledgeJobStore {
  constructor(private readonly database: DatabaseSync) {
    this.database.exec("PRAGMA foreign_keys = ON;");
    this.database.exec("PRAGMA busy_timeout = 5000;");
    ensureAiKnowledgeJobQueue(database);
  }

  put(job: AiKnowledgeJob): AiKnowledgeJob {
    const executionKey = executionKeyOf(job);
    const existing = this.get(job.id) ?? this.getByExecutionKey(executionKey);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(job)) {
        throw new Error(
          `AI knowledge job execution key ${executionKey} conflicts with existing job`,
        );
      }
      return clone(existing);
    }

    this.database
      .prepare(
        `INSERT INTO ai_knowledge_jobs(
          id, assignment_id, provider, status, attempts, execution_key,
          document_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        job.id,
        job.assignmentId,
        job.provider,
        job.status,
        job.attempts,
        executionKey,
        JSON.stringify(job),
        job.createdAt,
        job.updatedAt,
      );
    return clone(job);
  }

  save(job: AiKnowledgeJob): AiKnowledgeJob {
    executionKeyOf(job);
    const existing = this.get(job.id);
    if (!existing) {
      throw new Error(`AI knowledge job ${job.id} does not exist`);
    }
    assertImmutableIdentity(existing, job);

    const result = this.database
      .prepare(
        `UPDATE ai_knowledge_jobs
         SET status = ?, attempts = ?, document_json = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(job.status, job.attempts, JSON.stringify(job), job.updatedAt, job.id);
    if (Number(result.changes) !== 1) {
      throw new Error(`AI knowledge job ${job.id} update was not persisted`);
    }
    return clone(job);
  }

  saveIfStatus(
    job: AiKnowledgeJob,
    expectedStatus: AiKnowledgeJobStatus,
  ): AiKnowledgeJob | undefined {
    executionKeyOf(job);
    const existing = this.get(job.id);
    if (!existing) {
      throw new Error(`AI knowledge job ${job.id} does not exist`);
    }
    assertImmutableIdentity(existing, job);

    const result = this.database
      .prepare(
        `UPDATE ai_knowledge_jobs
         SET status = ?, attempts = ?, document_json = ?, updated_at = ?
         WHERE id = ? AND status = ?`,
      )
      .run(job.status, job.attempts, JSON.stringify(job), job.updatedAt, job.id, expectedStatus);
    return Number(result.changes) === 1 ? clone(job) : undefined;
  }

  get(id: string): AiKnowledgeJob | undefined {
    const row = this.database
      .prepare("SELECT document_json FROM ai_knowledge_jobs WHERE id = ?")
      .get(id) as { document_json: string } | undefined;
    return row ? parseJob(row.document_json) : undefined;
  }

  getByExecutionKey(executionKey: string): AiKnowledgeJob | undefined {
    const row = this.database
      .prepare("SELECT document_json FROM ai_knowledge_jobs WHERE execution_key = ?")
      .get(executionKey) as { document_json: string } | undefined;
    return row ? parseJob(row.document_json) : undefined;
  }

  list(): AiKnowledgeJob[] {
    const rows = this.database
      .prepare("SELECT document_json FROM ai_knowledge_jobs ORDER BY created_at, id")
      .all() as { document_json: string }[];
    return rows.map((row) => parseJob(row.document_json));
  }

  claimNext(): AiKnowledgeJob | undefined {
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const row = this.database
        .prepare(
          `SELECT document_json
           FROM ai_knowledge_jobs
           WHERE status = 'QUEUED'
           ORDER BY created_at, id
           LIMIT 1`,
        )
        .get() as { document_json: string } | undefined;
      if (!row) {
        this.database.exec("COMMIT;");
        return undefined;
      }

      const claimed = claimJob(parseJob(row.document_json));
      const result = this.database
        .prepare(
          `UPDATE ai_knowledge_jobs
           SET status = ?, document_json = ?, updated_at = ?
           WHERE id = ? AND status = 'QUEUED'`,
        )
        .run(claimed.status, JSON.stringify(claimed), claimed.updatedAt, claimed.id);
      if (Number(result.changes) !== 1) {
        throw new Error(`AI knowledge job ${claimed.id} was claimed concurrently`);
      }
      this.database.exec("COMMIT;");
      return clone(claimed);
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }
}

export class MemoryAiKnowledgeJobStore implements AiKnowledgeJobStore {
  private readonly jobs = new Map<string, AiKnowledgeJob>();

  put(job: AiKnowledgeJob): AiKnowledgeJob {
    const executionKey = executionKeyOf(job);
    const existing = this.get(job.id) ?? this.getByExecutionKey(executionKey);
    if (existing && JSON.stringify(existing) !== JSON.stringify(job)) {
      throw new Error(`AI knowledge job execution key ${executionKey} conflicts with existing job`);
    }
    if (!existing) this.jobs.set(job.id, clone(job));
    return clone(existing ?? job);
  }

  save(job: AiKnowledgeJob): AiKnowledgeJob {
    const existing = this.jobs.get(job.id);
    if (!existing) throw new Error(`AI knowledge job ${job.id} does not exist`);
    assertImmutableIdentity(existing, job);
    this.jobs.set(job.id, clone(job));
    return clone(job);
  }

  saveIfStatus(
    job: AiKnowledgeJob,
    expectedStatus: AiKnowledgeJobStatus,
  ): AiKnowledgeJob | undefined {
    const existing = this.jobs.get(job.id);
    if (!existing) throw new Error(`AI knowledge job ${job.id} does not exist`);
    assertImmutableIdentity(existing, job);
    if (existing.status !== expectedStatus) return undefined;
    this.jobs.set(job.id, clone(job));
    return clone(job);
  }

  get(id: string): AiKnowledgeJob | undefined {
    const job = this.jobs.get(id);
    return job ? clone(job) : undefined;
  }

  getByExecutionKey(executionKey: string): AiKnowledgeJob | undefined {
    const job = [...this.jobs.values()].find(
      (candidate) => candidate.executionKey === executionKey,
    );
    return job ? clone(job) : undefined;
  }

  list(): AiKnowledgeJob[] {
    return [...this.jobs.values()].map((job) => clone(job));
  }

  claimNext(): AiKnowledgeJob | undefined {
    const next = [...this.jobs.values()].find((job) => job.status === "QUEUED");
    if (!next) return undefined;
    const claimed = claimJob(next);
    this.jobs.set(claimed.id, clone(claimed));
    return clone(claimed);
  }
}
