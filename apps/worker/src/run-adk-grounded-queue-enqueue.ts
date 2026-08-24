import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqliteAiGroundedPreparedExecutionEvidenceRepository } from "@markorbit/persistence/ai-grounded-prepared-execution-evidence";
import { enqueueAdkGroundedPreparedExecution } from "./adk-grounded-queue-admission";
import { SqliteAiKnowledgeJobStore } from "./adk-knowledge-job-queue-store";

const SHA256 = /^[a-f0-9]{64}$/u;

type GroundedQueueEnqueueConfig = {
  databasePath: string;
  executionInputSha256: string;
};

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function loadGroundedQueueEnqueueConfig(
  environment: NodeJS.ProcessEnv = process.env,
): GroundedQueueEnqueueConfig {
  const executionInputSha256 = required(
    environment,
    "MARKORBIT_ADK_GROUNDED_EXECUTION_INPUT_SHA256",
  );
  if (!SHA256.test(executionInputSha256)) {
    throw new Error("MARKORBIT_ADK_GROUNDED_EXECUTION_INPUT_SHA256 must be a lowercase SHA-256");
  }
  return {
    databasePath: resolve(required(environment, "MARKORBIT_ADK_QUEUE_DB_PATH")),
    executionInputSha256,
  };
}

export function enqueuePersistedGroundedPreparedExecution(config: GroundedQueueEnqueueConfig) {
  const database = new DatabaseSync(config.databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  try {
    const evidenceRepository = new SqliteAiGroundedPreparedExecutionEvidenceRepository(database);
    const evidence = evidenceRepository.get(config.executionInputSha256);
    if (!evidence) {
      throw new Error(
        `Grounded PREPARED execution evidence ${config.executionInputSha256} was not found`,
      );
    }
    const store = new SqliteAiKnowledgeJobStore(database);
    return enqueueAdkGroundedPreparedExecution({ store, evidence });
  } finally {
    database.close();
  }
}

function main(): void {
  const job = enqueuePersistedGroundedPreparedExecution(loadGroundedQueueEnqueueConfig());
  process.stdout.write(
    `${JSON.stringify(
      {
        event: "adk.grounded.queue.enqueue.completed",
        job: {
          id: job.id,
          assignmentId: job.assignmentId,
          provider: job.provider,
          executionMode: job.executionMode,
          groundedExecutionInputSha256: job.groundedExecutionInputSha256,
          executionKey: job.executionKey,
          status: job.status,
          providerExecutionEnabled: false,
        },
      },
      null,
      2,
    )}\n`,
  );
}

main();
