import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqliteAiKnowledgeAssignmentRepository } from "@markorbit/persistence/ai-knowledge-assignments";
import {
  ingestAiDistilledKnowledgeAsRawArtifacts,
  type AiDistilledKnowledgeIngestionResult,
} from "@markorbit/persistence/ai-distilled-knowledge-ingestion";
import { SqliteRawArtifactRepository } from "@markorbit/persistence/raw-artifacts";
import { SqliteWorkerExecutionRepository } from "@markorbit/persistence/worker-execution";
import {
  assertDeepSeekOffPeakExecutionWindow,
  DeepSeekKnowledgeAdapter,
} from "@markorbit/worker-runtime/ai-distilled-knowledge-acquirer";
import {
  runAiProductionPilot,
  type AiKnowledgeProvider,
  type AiKnowledgeProviderAdapter,
} from "@markorbit/worker-runtime/ai-production-pilot";
import { OpenAiKnowledgeAdapter } from "@markorbit/worker-runtime/openai-knowledge-adapter";
import {
  assertLivePilotComplete,
  toLivePilotReceiptView,
  type LivePilotLineage,
} from "./adk-live-pilot-acceptance";
import { loadFrozenAdkLivePilotPlan } from "./adk-live-pilot-plan";
import { loadAdkLivePilotRuntimeSecret } from "./adk-live-pilot-runtime-secret";

type LivePilotConfig = {
  databasePath: string;
  storageRoot: string;
  planPath: string;
  receiptPath?: string;
  workerId: string;
  workerCredential: string;
  leaseId: string;
  leaseToken: string;
  runtimeBinding?: {
    pilotId: string;
    approvalRef: string;
    runtimeSecretPath: string;
  };
};

type LivePilotAcceptanceRecord = {
  objectType: "AI_PRODUCTION_PILOT_LIVE_ACCEPTANCE_RECORD";
  protocolVersion: "1.0";
  pilotId: string;
  approvalRef: string;
  runId: string;
  assignmentIds: [string, string, string];
  providers: ["DEEPSEEK", "OPENAI"];
  receipts: ReturnType<typeof toLivePilotReceiptView>[];
  lineage: LivePilotLineage[];
  execution: {
    workerId: string;
    leaseId: string;
    executionAttemptId: string;
    artifactReceiptIds: string[];
  };
  accepted: true;
  boundaries: {
    providerRankingProduced: false;
    legalTruthVerified: false;
    candidateAutoActivationApplied: false;
  };
  recordedAt: string;
};

const LIVE_PILOT_EXECUTOR = {
  executorId: "adk-live-pilot",
  version: "1.0.0",
  mode: "PRODUCTION" as const,
};

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function loadAdkLivePilotConfig(
  environment: NodeJS.ProcessEnv = process.env,
): LivePilotConfig {
  const receiptPath = environment.MARKORBIT_ADK_LIVE_RECEIPT_PATH?.trim();
  const runtimeSecretPath = environment.MARKORBIT_ADK_LIVE_RUNTIME_SECRET_PATH?.trim();

  if (runtimeSecretPath) {
    const resolvedRuntimeSecretPath = resolve(runtimeSecretPath);
    const secret = loadAdkLivePilotRuntimeSecret(resolvedRuntimeSecretPath);
    return {
      databasePath: resolve(secret.databasePath),
      storageRoot: resolve(secret.storageRoot),
      planPath: resolve(secret.planPath),
      ...(receiptPath ? { receiptPath: resolve(receiptPath) } : {}),
      workerId: secret.workerId,
      workerCredential: secret.workerCredential,
      leaseId: secret.leaseId,
      leaseToken: secret.leaseToken,
      runtimeBinding: {
        pilotId: secret.pilotId,
        approvalRef: secret.approvalRef,
        runtimeSecretPath: resolvedRuntimeSecretPath,
      },
    };
  }

  return {
    databasePath: resolve(required(environment, "MARKORBIT_ADK_LIVE_DB_PATH")),
    storageRoot: resolve(required(environment, "MARKORBIT_ADK_LIVE_STORAGE_ROOT")),
    planPath: resolve(required(environment, "MARKORBIT_ADK_LIVE_PLAN_PATH")),
    ...(receiptPath ? { receiptPath: resolve(receiptPath) } : {}),
    workerId: required(environment, "MARKORBIT_ADK_LIVE_WORKER_ID"),
    workerCredential: required(environment, "MARKORBIT_ADK_LIVE_WORKER_CREDENTIAL"),
    leaseId: required(environment, "MARKORBIT_ADK_LIVE_LEASE_ID"),
    leaseToken: required(environment, "MARKORBIT_ADK_LIVE_LEASE_TOKEN"),
  };
}

function lineageFrom(
  acquisition: {
    assignment: { assignmentId: string };
    submission: { provider: string; submissionId: string };
    artifact: { artifactId: string };
  },
  ingestion: AiDistilledKnowledgeIngestionResult,
): LivePilotLineage {
  if (
    acquisition.submission.provider !== "DEEPSEEK" &&
    acquisition.submission.provider !== "OPENAI"
  ) {
    throw new Error("Unexpected provider in live ADK pilot acquisition");
  }
  return {
    assignmentId: acquisition.assignment.assignmentId,
    provider: acquisition.submission.provider,
    submissionId: acquisition.submission.submissionId,
    distilledArtifactId: acquisition.artifact.artifactId,
    rawProviderArtifactId: ingestion.rawProviderArtifact.artifact.id,
    markdownRawArtifactId: ingestion.markdownArtifact.artifact.id,
  };
}

async function main(): Promise<void> {
  const config = loadAdkLivePilotConfig();
  const plan = loadFrozenAdkLivePilotPlan(config.planPath);
  if (
    config.runtimeBinding &&
    (config.runtimeBinding.pilotId !== plan.pilotId ||
      config.runtimeBinding.approvalRef !== plan.approvalRef)
  ) {
    throw new Error("Prepared ADK live pilot runtime secret does not match the frozen plan");
  }

  // Fail before either provider is called so a 3x2 acceptance run cannot become
  // partially paid during DeepSeek's weekday Beijing-time peak pricing windows.
  assertDeepSeekOffPeakExecutionWindow();

  const database = new DatabaseSync(config.databasePath);
  database.exec("PRAGMA foreign_keys = ON;");

  try {
    const assignmentsRepository = new SqliteAiKnowledgeAssignmentRepository(database);
    const assignments = new Map(
      plan.assignmentIds.map((assignmentId) => {
        const assignment = assignmentsRepository.getAssignment(assignmentId);
        if (!assignment) {
          throw new Error(`Frozen live pilot assignment ${assignmentId} was not found`);
        }
        return [assignmentId, assignment] as const;
      }),
    );

    const adapters = new Map<AiKnowledgeProvider, AiKnowledgeProviderAdapter>([
      ["DEEPSEEK", new DeepSeekKnowledgeAdapter()],
      ["OPENAI", new OpenAiKnowledgeAdapter()],
    ]);
    const pilot = await runAiProductionPilot({ plan, assignments, adapters });
    if (
      pilot.run.receipts.length !== 6 ||
      pilot.run.receipts.some((receipt) => receipt.status !== "EXECUTED")
    ) {
      throw new Error(
        `ADK live pilot did not execute all intended cells: ${JSON.stringify(
          pilot.run.receipts.map(toLivePilotReceiptView),
        )}`,
      );
    }
    if (pilot.acquisitions.length !== 6) {
      throw new Error("ADK live pilot produced an incomplete acquisition set");
    }

    const rawArtifacts = new SqliteRawArtifactRepository(database, config.storageRoot);
    const lineage: LivePilotLineage[] = [];
    const artifactReceiptIds: string[] = [];
    let bytesPrepared = 0;
    for (const acquisition of pilot.acquisitions) {
      const ingestion = await ingestAiDistilledKnowledgeAsRawArtifacts({
        repository: rawArtifacts,
        execution: {
          workerId: config.workerId,
          credential: config.workerCredential,
          leaseId: config.leaseId,
          leaseToken: config.leaseToken,
        },
        acquisition,
      });
      lineage.push(lineageFrom(acquisition, ingestion));
      artifactReceiptIds.push(
        ingestion.rawProviderArtifact.receiptId,
        ingestion.markdownArtifact.receiptId,
      );
      bytesPrepared +=
        ingestion.rawProviderArtifact.contentObject.sizeBytes +
        ingestion.markdownArtifact.contentObject.sizeBytes;
    }

    const receiptViews = pilot.run.receipts.map(toLivePilotReceiptView);
    assertLivePilotComplete({
      receipts: receiptViews,
      acquisitionCount: pilot.acquisitions.length,
      lineage,
    });
    if (artifactReceiptIds.length !== 12 || new Set(artifactReceiptIds).size !== 12) {
      throw new Error("ADK live pilot requires twelve unique finalized RawArtifact receipts");
    }

    const executions = new SqliteWorkerExecutionRepository(database);
    executions.markVerifying(
      config.workerId,
      config.workerCredential,
      config.leaseId,
      config.leaseToken,
      { idempotencyKey: `adk-live-pilot-verify-${plan.pilotId}` },
    );
    const completed = executions.complete(
      config.workerId,
      config.workerCredential,
      config.leaseId,
      config.leaseToken,
      {
        idempotencyKey: `adk-live-pilot-complete-${plan.pilotId}`,
        receipt: {
          executor: LIVE_PILOT_EXECUTOR,
          outputKinds: ["JSON", "MARKDOWN"],
          itemsObserved: artifactReceiptIds.length,
          bytesPrepared,
          metadataOnly: false,
          artifactReceiptIds,
          summary: "Six real provider responses and six Markdown derivatives finalized for ADK-06.",
        },
      },
    );
    if (completed.attempt.status !== "COMPLETED") {
      throw new Error("ADK live pilot authenticated execution did not complete");
    }

    const record: LivePilotAcceptanceRecord = {
      objectType: "AI_PRODUCTION_PILOT_LIVE_ACCEPTANCE_RECORD",
      protocolVersion: "1.0",
      pilotId: plan.pilotId,
      approvalRef: plan.approvalRef,
      runId: pilot.run.runId,
      assignmentIds: plan.assignmentIds,
      providers: ["DEEPSEEK", "OPENAI"],
      receipts: receiptViews,
      lineage,
      execution: {
        workerId: config.workerId,
        leaseId: config.leaseId,
        executionAttemptId: completed.attempt.id,
        artifactReceiptIds,
      },
      accepted: true,
      boundaries: {
        providerRankingProduced: false,
        legalTruthVerified: false,
        candidateAutoActivationApplied: false,
      },
      recordedAt: new Date().toISOString(),
    };

    const serialized = `${JSON.stringify(record, null, 2)}\n`;
    if (config.receiptPath) {
      writeFileSync(config.receiptPath, serialized, {
        encoding: "utf8",
        flag: "wx",
      });
    }
    process.stdout.write(serialized);
  } finally {
    database.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        event: "adk.live-pilot.failed",
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
