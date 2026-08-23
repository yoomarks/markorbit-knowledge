import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqliteAiKnowledgeJobStore } from "./adk-knowledge-job-queue-store";
import { recoverAdkKnowledgeJobs } from "./adk-knowledge-job-worker";

type RecoveryConfig = {
  databasePath: string;
  staleMinutes: number;
  requeueRetryPending: boolean;
  requeueCredentialBlocked: boolean;
};

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function positiveInteger(environment: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function enabled(environment: NodeJS.ProcessEnv, name: string): boolean {
  const raw = environment[name]?.trim().toLowerCase();
  if (!raw) return false;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`${name} must be true, false, 1, or 0`);
}

function loadConfig(environment: NodeJS.ProcessEnv = process.env): RecoveryConfig {
  return {
    databasePath: resolve(required(environment, "MARKORBIT_ADK_QUEUE_DB_PATH")),
    staleMinutes: positiveInteger(environment, "MARKORBIT_ADK_QUEUE_STALE_MINUTES", 30),
    requeueRetryPending: enabled(environment, "MARKORBIT_ADK_QUEUE_REQUEUE_RETRY_PENDING"),
    requeueCredentialBlocked: enabled(
      environment,
      "MARKORBIT_ADK_QUEUE_REQUEUE_CREDENTIAL_BLOCKED",
    ),
  };
}

function main(): void {
  const config = loadConfig();
  const database = new DatabaseSync(config.databasePath);
  database.exec("PRAGMA foreign_keys = ON;");

  try {
    const staleBefore = new Date(Date.now() - config.staleMinutes * 60_000);
    const result = recoverAdkKnowledgeJobs({
      store: new SqliteAiKnowledgeJobStore(database),
      staleBefore,
      requeueRetryPending: config.requeueRetryPending,
      requeueCredentialBlocked: config.requeueCredentialBlocked,
    });

    process.stdout.write(
      `${JSON.stringify(
        {
          event: "adk.queue.recovery.completed",
          staleBefore: staleBefore.toISOString(),
          requeueRetryPending: config.requeueRetryPending,
          requeueCredentialBlocked: config.requeueCredentialBlocked,
          ...result,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    database.close();
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      event: "adk.queue.recovery.failed",
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exitCode = 1;
}
