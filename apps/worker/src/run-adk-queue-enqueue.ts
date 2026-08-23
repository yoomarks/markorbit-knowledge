import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqliteAiKnowledgeAssignmentRepository } from "@markorbit/persistence/ai-knowledge-assignments";
import { isAiProductionPilotPlanV1 } from "@markorbit/worker-runtime/ai-production-pilot";
import { SqliteAiKnowledgeJobStore } from "./adk-knowledge-job-queue-store";
import { enqueueAdkProductionPilot } from "./adk-knowledge-job-worker";

type QueueEnqueueConfig = {
  databasePath: string;
  planPath: string;
  maxAttempts: number;
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

function loadConfig(environment: NodeJS.ProcessEnv = process.env): QueueEnqueueConfig {
  return {
    databasePath: resolve(required(environment, "MARKORBIT_ADK_QUEUE_DB_PATH")),
    planPath: resolve(required(environment, "MARKORBIT_ADK_QUEUE_PLAN_PATH")),
    maxAttempts: positiveInteger(environment, "MARKORBIT_ADK_QUEUE_MAX_ATTEMPTS", 3),
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const planJson = JSON.parse(await readFile(config.planPath, "utf8")) as unknown;
  if (!isAiProductionPilotPlanV1(planJson)) {
    throw new Error("MARKORBIT_ADK_QUEUE_PLAN_PATH does not contain a valid frozen pilot plan");
  }

  const database = new DatabaseSync(config.databasePath);
  database.exec("PRAGMA foreign_keys = ON;");

  try {
    const store = new SqliteAiKnowledgeJobStore(database);
    const assignments = new SqliteAiKnowledgeAssignmentRepository(database);
    const jobs = enqueueAdkProductionPilot({
      store,
      assignments,
      plan: planJson,
      maxAttempts: config.maxAttempts,
    });

    process.stdout.write(
      `${JSON.stringify(
        {
          event: "adk.queue.enqueue.completed",
          pilotId: planJson.pilotId,
          approvalRef: planJson.approvalRef,
          assignmentIds: planJson.assignmentIds,
          providers: planJson.providers,
          jobCount: jobs.length,
          jobs: jobs.map((job) => ({
            id: job.id,
            assignmentId: job.assignmentId,
            provider: job.provider,
            executionKey: job.executionKey,
            status: job.status,
          })),
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    database.close();
  }
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      event: "adk.queue.enqueue.failed",
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exitCode = 1;
});
