import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  DEFAULT_WORKSPACE,
  SqliteSourceRepository,
  openRegistryDatabase,
} from "@markorbit/persistence";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { SqliteExecutionLedgerRepository } from "@markorbit/persistence/execution-ledger";
import { seedUsTrademarkAssignmentLibrary } from "@markorbit/persistence/us-trademark-assignment-library";
import { SqliteAiKnowledgeAssignmentRepository } from "@markorbit/persistence/ai-knowledge-assignments";
import { SqliteWorkerExecutionRepository } from "@markorbit/persistence/worker-execution";
import { SqliteWorkerRegistryRepository } from "@markorbit/persistence/workers";
import type { AiProductionPilotPlanV1 } from "@markorbit/worker-runtime/ai-production-pilot";
import { loadFrozenAdkLivePilotPlan } from "./adk-live-pilot-plan";
import type { AdkLivePilotRuntimeSecretV1 } from "./adk-live-pilot-runtime-secret";

export type AdkLivePilotPreparationConfig = {
  databasePath: string;
  storageRoot: string;
  planPath: string;
  runtimeSecretPath: string;
  preparationReceiptPath: string;
};

export type AdkLivePilotPreparationReceiptV1 = {
  protocolVersion: "1.0";
  objectType: "ADK_LIVE_PILOT_PREPARATION_RECEIPT";
  pilotId: string;
  approvalRef: string;
  assignmentIds: [string, string, string];
  providers: ["DEEPSEEK", "OPENAI"];
  databasePath: string;
  storageRoot: string;
  planPath: string;
  runtimeSecretPath: string;
  sourceId: string;
  collectionPlanId: string;
  runId: string;
  jobId: string;
  workerId: string;
  leaseId: string;
  executionAttemptId: string;
  executionStatus: "UPLOADING";
  preparedAt: string;
  boundaries: {
    providerCallsExecuted: false;
    providerSecretsStored: false;
    providerRankingProduced: false;
    legalTruthVerified: false;
    candidateAutoActivationApplied: false;
  };
};

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function loadAdkLivePilotPreparationConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AdkLivePilotPreparationConfig {
  return {
    databasePath: resolve(required(environment, "MARKORBIT_ADK_LIVE_DB_PATH")),
    storageRoot: resolve(required(environment, "MARKORBIT_ADK_LIVE_STORAGE_ROOT")),
    planPath: resolve(required(environment, "MARKORBIT_ADK_LIVE_PLAN_PATH")),
    runtimeSecretPath: resolve(required(environment, "MARKORBIT_ADK_LIVE_RUNTIME_SECRET_PATH")),
    preparationReceiptPath: resolve(
      required(environment, "MARKORBIT_ADK_LIVE_PREPARATION_RECEIPT_PATH"),
    ),
  };
}

function assertFreshTarget(config: AdkLivePilotPreparationConfig): void {
  const targets = [
    [config.databasePath, "database"],
    [config.storageRoot, "storage root"],
    [config.runtimeSecretPath, "runtime secret"],
    [config.preparationReceiptPath, "preparation receipt"],
  ] as const;
  for (const [path, label] of targets) {
    if (existsSync(path)) {
      throw new Error(`ADK live pilot ${label} target already exists: ${path}`);
    }
  }
}

function writePrivateJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function cleanupOwnedTargets(config: AdkLivePilotPreparationConfig): void {
  for (const path of [
    config.runtimeSecretPath,
    config.preparationReceiptPath,
    config.databasePath,
    `${config.databasePath}-wal`,
    `${config.databasePath}-shm`,
    config.storageRoot,
  ]) {
    rmSync(path, { recursive: true, force: true });
  }
}

function assertAssignmentsPersisted(
  database: ReturnType<typeof openRegistryDatabase>,
  plan: AiProductionPilotPlanV1,
): void {
  const assignments = new SqliteAiKnowledgeAssignmentRepository(database);
  for (const assignmentId of plan.assignmentIds) {
    const assignment = assignments.getAssignment(assignmentId);
    if (!assignment) {
      throw new Error(`Frozen live pilot assignment ${assignmentId} was not persisted`);
    }
    if (assignment.jurisdiction !== "US" || assignment.domain !== "TRADEMARK") {
      throw new Error(`Frozen live pilot assignment ${assignmentId} has unexpected scope`);
    }
  }
}

export function prepareAdkLivePilotRuntime(
  config: AdkLivePilotPreparationConfig,
  now: () => Date = () => new Date(),
): AdkLivePilotPreparationReceiptV1 {
  const plan = loadFrozenAdkLivePilotPlan(config.planPath);
  assertFreshTarget(config);

  mkdirSync(dirname(config.databasePath), { recursive: true });
  mkdirSync(config.storageRoot, { recursive: false, mode: 0o700 });
  const database = openRegistryDatabase(config.databasePath);
  let committed = false;

  try {
    seedUsTrademarkAssignmentLibrary(database);
    assertAssignmentsPersisted(database, plan);

    const sources = new SqliteSourceRepository(database, now);
    const collectionPlans = new SqliteCollectionPlanRepository(database, now);
    const runs = new SqliteExecutionLedgerRepository(database, now);
    const workers = new SqliteWorkerRegistryRepository(database, now);
    const executions = new SqliteWorkerExecutionRepository(database, now);

    const source = sources.create({
      workspaceId: DEFAULT_WORKSPACE.id,
      name: `ADK live pilot execution envelope ${plan.pilotId}`,
      slug: `adk-live-pilot-${plan.pilotId.replaceAll("_", "-")}`,
      sourceType: "WEB",
      category: "INTERNAL",
      authorityLevel: "INTERNAL",
      status: "ACTIVE",
      jurisdictions: ["US"],
      languages: ["en"],
      connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
      connectorConfig: {},
      canonicalUri: `https://adk-live-pilot.invalid/${plan.pilotId}`,
      entrypoints: [{ uri: `https://adk-live-pilot.invalid/${plan.pilotId}` }],
      extensions: {
        "x-markorbit-adk-pilot-id": plan.pilotId,
        "x-markorbit-adk-approval-ref": plan.approvalRef,
        "x-markorbit-adk-runtime-envelope": true,
      },
    });

    const collectionPlan = collectionPlans.create({
      workspaceId: DEFAULT_WORKSPACE.id,
      sourceId: source.id,
      name: `ADK live pilot execution envelope ${plan.pilotId}`,
      status: "ACTIVE",
      schedule: { mode: "MANUAL" },
      priority: "NORMAL",
      policy: {
        includePatterns: [],
        excludePatterns: [],
        maxDepth: 0,
        maxItems: 1,
        renderJavascript: false,
        fetchAttachments: false,
        respectRobots: true,
        rateLimitPerMinute: 1,
        timeoutSeconds: 30,
        retry: { maxAttempts: 1, backoffSeconds: 1 },
      },
      output: { artifactKinds: ["JSON", "MARKDOWN"] },
    });

    const run = runs.dispatchManual({
      planId: collectionPlan.plan.id,
      idempotencyKey: `adk-live-pilot-${plan.pilotId}`,
    }).record;
    if (run.jobs.length !== 1) {
      throw new Error("ADK live pilot preparation expected exactly one execution-envelope job");
    }

    const worker = workers.create({
      workspaceId: DEFAULT_WORKSPACE.id,
      displayName: `ADK live pilot artifact worker ${plan.pilotId}`,
      desiredState: "ACTIVE",
      runtime: { runtimeId: "adk-live-pilot", version: "1.0.0" },
      supportedJobTypes: [run.jobs[0].jobType],
      connectorBindings: [
        {
          connectorId: run.jobs[0].connector.connectorId,
          version: run.jobs[0].connector.version,
          capabilities: ["COLLECT"],
        },
      ],
      maxConcurrency: 1,
      labels: ["adk-live-pilot", plan.pilotId],
      extensions: {
        "x-markorbit-adk-pilot-id": plan.pilotId,
        "x-markorbit-adk-runtime-envelope": true,
      },
    });

    const preparedAt = now().toISOString();
    workers.heartbeat(
      {
        workerId: worker.view.worker.id,
        observedAt: preparedAt,
        runtimeVersion: "1.0.0",
        health: "HEALTHY",
        activeLeaseIds: [],
      },
      worker.credential,
    );

    const claim = workers.claimSpecific(
      worker.view.worker.id,
      worker.credential,
      run.jobs[0].id,
    );
    if (!claim.job || !claim.lease || !claim.leaseToken) {
      throw new Error("ADK live pilot execution-envelope job could not be claimed");
    }

    const started = executions.start(
      worker.view.worker.id,
      worker.credential,
      claim.lease.id,
      claim.leaseToken,
      {
        executor: {
          executorId: "adk-live-pilot",
          version: "1.0.0",
          mode: "PRODUCTION",
        },
        idempotencyKey: `adk-live-pilot-start-${plan.pilotId}`,
      },
    );
    const uploading = executions.markUploading(
      worker.view.worker.id,
      worker.credential,
      claim.lease.id,
      claim.leaseToken,
      { idempotencyKey: `adk-live-pilot-upload-${plan.pilotId}` },
    );
    if (uploading.attempt.status !== "UPLOADING") {
      throw new Error("ADK live pilot execution envelope did not reach UPLOADING state");
    }

    const secret: AdkLivePilotRuntimeSecretV1 = {
      protocolVersion: "1.0",
      objectType: "ADK_LIVE_PILOT_RUNTIME_SECRET",
      pilotId: plan.pilotId,
      approvalRef: plan.approvalRef,
      databasePath: config.databasePath,
      storageRoot: config.storageRoot,
      planPath: config.planPath,
      workerId: worker.view.worker.id,
      workerCredential: worker.credential,
      leaseId: claim.lease.id,
      leaseToken: claim.leaseToken,
      preparedAt,
    };

    const receipt: AdkLivePilotPreparationReceiptV1 = {
      protocolVersion: "1.0",
      objectType: "ADK_LIVE_PILOT_PREPARATION_RECEIPT",
      pilotId: plan.pilotId,
      approvalRef: plan.approvalRef,
      assignmentIds: plan.assignmentIds,
      providers: ["DEEPSEEK", "OPENAI"],
      databasePath: config.databasePath,
      storageRoot: config.storageRoot,
      planPath: config.planPath,
      runtimeSecretPath: config.runtimeSecretPath,
      sourceId: source.id,
      collectionPlanId: collectionPlan.plan.id,
      runId: run.run.id,
      jobId: run.jobs[0].id,
      workerId: worker.view.worker.id,
      leaseId: claim.lease.id,
      executionAttemptId: started.attempt.id,
      executionStatus: "UPLOADING",
      preparedAt,
      boundaries: {
        providerCallsExecuted: false,
        providerSecretsStored: false,
        providerRankingProduced: false,
        legalTruthVerified: false,
        candidateAutoActivationApplied: false,
      },
    };

    writePrivateJson(config.runtimeSecretPath, secret);
    writePrivateJson(config.preparationReceiptPath, receipt);
    committed = true;
    return receipt;
  } finally {
    database.close();
    if (!committed) cleanupOwnedTargets(config);
  }
}

async function main(): Promise<void> {
  const receipt = prepareAdkLivePilotRuntime(loadAdkLivePilotPreparationConfig());
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        event: "adk.live-pilot.preparation.failed",
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
