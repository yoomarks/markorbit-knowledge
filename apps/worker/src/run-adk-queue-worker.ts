import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqliteAiKnowledgeAssignmentRepository } from "@markorbit/persistence/ai-knowledge-assignments";
import { SqliteRawArtifactRepository } from "@markorbit/persistence/raw-artifacts";
import { DeepSeekKnowledgeAdapter } from "@markorbit/worker-runtime/ai-distilled-knowledge-acquirer";
import type { AiKnowledgeProviderAdapter } from "@markorbit/worker-runtime/ai-distilled-knowledge-acquirer";
import type { AiKnowledgeProvider } from "@markorbit/worker-runtime/ai-production-pilot";
import { OpenAiKnowledgeAdapter } from "@markorbit/worker-runtime/openai-knowledge-adapter";
import { SqliteAiKnowledgeJobStore } from "./adk-knowledge-job-queue-store";
import {
  createRawArtifactAdkAcquisitionSink,
  processNextAdkKnowledgeJob,
} from "./adk-knowledge-job-worker";

type QueueWorkerConfig = {
  databasePath: string;
  storageRoot: string;
  workerId: string;
  workerCredential: string;
  leaseId: string;
  leaseToken: string;
  maxJobs: number;
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

function loadConfig(environment: NodeJS.ProcessEnv = process.env): QueueWorkerConfig {
  return {
    databasePath: resolve(required(environment, "MARKORBIT_ADK_QUEUE_DB_PATH")),
    storageRoot: resolve(required(environment, "MARKORBIT_ADK_QUEUE_STORAGE_ROOT")),
    workerId: required(environment, "MARKORBIT_ADK_QUEUE_WORKER_ID"),
    workerCredential: required(environment, "MARKORBIT_ADK_QUEUE_WORKER_CREDENTIAL"),
    leaseId: required(environment, "MARKORBIT_ADK_QUEUE_LEASE_ID"),
    leaseToken: required(environment, "MARKORBIT_ADK_QUEUE_LEASE_TOKEN"),
    maxJobs: positiveInteger(environment, "MARKORBIT_ADK_QUEUE_MAX_JOBS", 25),
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const database = new DatabaseSync(config.databasePath);
  database.exec("PRAGMA foreign_keys = ON;");

  try {
    const store = new SqliteAiKnowledgeJobStore(database);
    const assignments = new SqliteAiKnowledgeAssignmentRepository(database);
    const rawArtifacts = new SqliteRawArtifactRepository(database, config.storageRoot);
    const adapters = new Map<AiKnowledgeProvider, AiKnowledgeProviderAdapter>([
      ["DEEPSEEK", new DeepSeekKnowledgeAdapter()],
      ["OPENAI", new OpenAiKnowledgeAdapter()],
    ]);
    const sink = createRawArtifactAdkAcquisitionSink({
      repository: rawArtifacts,
      execution: {
        workerId: config.workerId,
        credential: config.workerCredential,
        leaseId: config.leaseId,
        leaseToken: config.leaseToken,
      },
    });

    const processed = [];
    for (let index = 0; index < config.maxJobs; index += 1) {
      const result = await processNextAdkKnowledgeJob({
        store,
        assignments,
        adapters,
        sink,
      });
      if (!result) break;
      processed.push({
        id: result.id,
        assignmentId: result.assignmentId,
        provider: result.provider,
        status: result.status,
        attempts: result.attempts,
        artifactIds: result.artifactIds,
        ...(result.error ? { error: result.error } : {}),
      });
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          event: "adk.queue.worker.completed",
          processedCount: processed.length,
          processed,
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
      event: "adk.queue.worker.failed",
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exitCode = 1;
});
