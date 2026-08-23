import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  isAiProductionPilotPlanV1,
  type AiProductionPilotPlanV1,
} from "@markorbit/contracts";
import {
  SqliteAiKnowledgeAssignmentRepository,
} from "@markorbit/persistence/ai-knowledge-assignments";
import {
  ingestAiDistilledKnowledgeAsRawArtifacts,
  type AiDistilledKnowledgeIngestionResult,
} from "@markorbit/persistence/ai-distilled-knowledge-ingestion";
import { SqliteRawArtifactRepository } from "@markorbit/persistence/raw-artifacts";
import {
  DeepSeekKnowledgeAdapter,
  OpenAiKnowledgeAdapter,
  runAiProductionPilot,
} from "@markorbit/worker-runtime";

type LivePilotConfig = {
  databasePath: string;
  storageRoot: string;
  planPath: string;
  receiptPath?: string;
  workerId: string;
  workerCredential: string;
  leaseId: string;
  leaseToken: string;
};

type LivePilotLineage = {
  assignmentId: string;
  provider: "DEEPSEEK" | "OPENAI";
  submissionId: string;
  distilledArtifactId: string;
  rawProviderArtifactId: string;
  markdownRawArtifactId: string;
};

type LivePilotAcceptanceRecord = {
  objectType: "AI_PRODUCTION_PILOT_LIVE_ACCEPTANCE_RECORD";
  protocolVersion: "1.0";
  pilotId: string;
  approvalRef: string;
  runId: string;
  assignmentIds: [string, string, string];
  providers: ["DEEPSEEK", "OPENAI"];
  receipts: ReturnType<typeof receiptView>[];
  lineage: LivePilotLineage[];
  accepted: true;
  boundaries: {
    providerRankingProduced: false;
    legalTruthVerified: false;
    candidateAutoActivationApplied: false;
  };
  recordedAt: string;
};

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function loadConfig(environment: NodeJS.ProcessEnv = process.env): LivePilotConfig {
  const receiptPath = environment.MARKORBIT_ADK_LIVE_RECEIPT_PATH?.trim();
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

function loadPlan(path: string): AiProductionPilotPlanV1 {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isAiProductionPilotPlanV1(parsed)) {
    throw new Error("Live ADK pilot plan does not satisfy AiProductionPilotPlanV1");
  }
  if (
    parsed.providers.length !== 2 ||
    parsed.providers[0] !== "DEEPSEEK" ||
    parsed.providers[1] !== "OPENAI"
  ) {
    throw new Error("Live ADK pilot provider set must be exactly DEEPSEEK,OPENAI in frozen order");
  }
  return parsed;
}

function receiptView(receipt: {
  assignmentId: string;
  provider: string;
  status: string;
  submissionId?: string;
  artifactId?: string;
  errorCode?: string;
  retryable?: boolean;
}) {
  return {
    assignmentId: receipt.assignmentId,
    provider: receipt.provider,
    status: receipt.status,
    ...(receipt.submissionId ? { submissionId: receipt.submissionId } : {}),
    ...(receipt.artifactId ? { artifactId: receipt.artifactId } : {}),
    ...(receipt.errorCode ? { errorCode: receipt.errorCode } : {}),
    ...(receipt.retryable !== undefined ? { retryable: receipt.retryable } : {}),
  };
}

function assertAllExecuted(receipts: readonly { status: string }[]): void {
  if (receipts.length !== 6 || receipts.some((receipt) => receipt.status !== "EXECUTED")) {
    throw new Error("ADK live pilot acceptance requires all 6 intended cells to be EXECUTED");
  }
}

function lineageFrom(
  acquisition: {
    assignment: { assignmentId: string };
    submission: { provider: string; submissionId: string };
    artifact: { artifactId: string };
  },
  ingestion: AiDistilledKnowledgeIngestionResult,
): LivePilotLineage {
  if (acquisition.submission.provider !== "DEEPSEEK" && acquisition.submission.provider !== "OPENAI") {
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
  const config = loadConfig();
  const plan = loadPlan(config.planPath);
  const database = new DatabaseSync(config.databasePath);
  database.exec("PRAGMA foreign_keys = ON;");

  try {
    const assignmentsRepository = new SqliteAiKnowledgeAssignmentRepository(database);
    const assignments = new Map(
      plan.assignmentIds.map((assignmentId) => {
        const assignment = assignmentsRepository.getAssignment(assignmentId);
        if (!assignment) throw new Error(`Frozen live pilot assignment ${assignmentId} was not found`);
        return [assignmentId, assignment] as const;
      }),
    );

    const adapters = new Map([
      ["DEEPSEEK" as const, new DeepSeekKnowledgeAdapter()],
      ["OPENAI" as const, new OpenAiKnowledgeAdapter()],
    ]);
    const pilot = await runAiProductionPilot({ plan, assignments, adapters });
    assertAllExecuted(pilot.run.receipts);
    if (pilot.acquisitions.length !== 6) {
      throw new Error("ADK live pilot produced an incomplete acquisition set");
    }

    const rawArtifacts = new SqliteRawArtifactRepository(database, config.storageRoot);
    const lineage: LivePilotLineage[] = [];
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
    }

    if (lineage.length !== 6) {
      throw new Error("ADK live pilot RawArtifact lineage is incomplete");
    }

    const record: LivePilotAcceptanceRecord = {
      objectType: "AI_PRODUCTION_PILOT_LIVE_ACCEPTANCE_RECORD",
      protocolVersion: "1.0",
      pilotId: plan.pilotId,
      approvalRef: plan.approvalRef,
      runId: pilot.run.runId,
      assignmentIds: plan.assignmentIds,
      providers: ["DEEPSEEK", "OPENAI"],
      receipts: pilot.run.receipts.map(receiptView),
      lineage,
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
      writeFileSync(config.receiptPath, serialized, { encoding: "utf8", flag: "wx" });
    }
    process.stdout.write(serialized);
  } finally {
    database.close();
  }
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      event: "adk.live-pilot.failed",
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exitCode = 1;
});
