import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION } from "@markorbit/contracts";
import { parseRepresentativeLiveCanarySummary } from "@markorbit/persistence/source-compatibility-import";
import { SqliteSourceCompatibilityObservationRepository } from "@markorbit/persistence/source-compatibility-observations";
import {
  SqliteSourceCompatibilityReprobeExecutionRepository,
  type SourceCompatibilityReprobeExecution,
} from "@markorbit/persistence/source-compatibility-reprobe-executions";
import {
  SqliteFoundationalActionIntentRepository,
  foundationalActionIntentId,
  type FoundationalActionIntentRecord,
} from "@markorbit/persistence/foundational-action-intents";
import { getRepresentativeSourceLiveCanaries } from "@markorbit/persistence/representative-source-live-canaries";
import { filterRepresentativeCanarySummary } from "./source-compatibility-reprobe-operator";

const WORKER_ID = "worker.eu-compatibility-promotion";
const REQUESTER = "promotion-proof.requester";
const APPROVER = "promotion-proof.approver";
const EXECUTOR = "promotion-proof.executor";

function packageRoot(): string {
  return fileURLToPath(new URL("..", import.meta.url));
}

async function runEuCanary(outputRoot: string): Promise<void> {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawn(
    command,
    [
      "exec",
      "tsx",
      "src/run-representative-live-canaries.ts",
      "--jurisdiction=EU",
      `--output-dir=${outputRoot}`,
    ],
    {
      cwd: packageRoot(),
      env: process.env,
      stdio: "inherit",
    },
  );
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error(`EU representative canary subprocess exited with ${exitCode}`);
  }
}

function approvedIntent(
  repository: SqliteFoundationalActionIntentRepository,
  input: { targetId: string; observedAt: string },
): FoundationalActionIntentRecord {
  const idempotencyKey = `eu-compat-reprobe-promotion:${input.targetId}`;
  const pending: FoundationalActionIntentRecord = {
    protocolVersion: "1.0",
    objectType: "FOUNDATIONAL_ACTION_INTENT",
    intentId: foundationalActionIntentId("promotion-proof", idempotencyKey),
    workspaceId: "promotion-proof",
    jurisdiction: "EU",
    targetId: input.targetId,
    readinessStage: "HEALTH",
    actionCode: "REPROBE_SOURCE_COMPATIBILITY",
    operatorInstruction: "Run the EU compatibility re-probe promotion proof.",
    executionPath: "MANUAL_OPERATOR",
    collectionAuthorizationRequired: false,
    automaticExecution: false,
    executionAuthorization: "NONE",
    requestedByActorId: REQUESTER,
    approvalRequired: true,
    approvedByActorId: null,
    canceledByActorId: null,
    status: "PENDING_APPROVAL",
    idempotencyKey,
    readinessProtocolVersion: SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION,
    queueProtocolVersion: "1.1",
    sourceSnapshotObservedAt: input.observedAt,
    createdAt: input.observedAt,
    updatedAt: input.observedAt,
    replayed: false,
  };
  const stored = repository.create(pending);
  return repository.approve(stored.intentId, APPROVER);
}

function collectionRunCount(database: DatabaseSync): number {
  const table = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'collection_runs'")
    .get();
  if (!table) return 0;
  const row = database.prepare("SELECT COUNT(*) AS count FROM collection_runs").get() as
    { count: number } | undefined;
  return Number(row?.count ?? 0);
}

function assertCompleted(
  execution: SourceCompatibilityReprobeExecution,
  expected: { targetId: string; observedAt: string; state: "PASS" | "DEGRADED" | "BLOCKED" },
): void {
  if (
    execution.status !== "COMPLETED" ||
    execution.targetId !== expected.targetId ||
    execution.jurisdiction !== "EU" ||
    execution.observationObservedAt !== expected.observedAt ||
    execution.observationState !== expected.state ||
    !execution.observationId
  ) {
    throw new Error(
      `EU promotion proof did not complete with the expected observation: ${JSON.stringify(execution)}`,
    );
  }
}

async function main(): Promise<void> {
  const euCanary = getRepresentativeSourceLiveCanaries().find(
    (candidate) => candidate.jurisdiction === "EU",
  );
  if (!euCanary) throw new Error("EU representative live canary is not configured");

  const outputRoot = await mkdtemp(join(tmpdir(), "markorbit-eu-compat-promotion-"));
  await runEuCanary(outputRoot);
  const rawSummary = JSON.parse(
    await readFile(join(outputRoot, "summary.json"), "utf8"),
  ) as unknown;
  const filtered = filterRepresentativeCanarySummary(rawSummary, euCanary.targetId);
  const [observationInput] = parseRepresentativeLiveCanarySummary(filtered.summary);
  if (!observationInput || observationInput.jurisdiction !== "EU") {
    throw new Error("EU promotion proof did not produce exactly one EU compatibility observation");
  }

  const database = new DatabaseSync(":memory:");
  try {
    const clock = () => new Date(filtered.observedAt);
    const intents = new SqliteFoundationalActionIntentRepository(database, clock);
    const intent = approvedIntent(intents, {
      targetId: euCanary.targetId,
      observedAt: filtered.observedAt,
    });
    const executions = new SqliteSourceCompatibilityReprobeExecutionRepository(database, clock);
    const started = executions.start({
      intentId: intent.intentId,
      workerId: WORKER_ID,
      executedByActorId: EXECUTOR,
      idempotencyKey: `eu-compat-reprobe-exec:${intent.intentId}`,
    });
    if (started.status !== "STARTED") {
      throw new Error(`EU promotion proof execution did not START: ${JSON.stringify(started)}`);
    }

    const observations = new SqliteSourceCompatibilityObservationRepository(database);
    const recorded = observations.record({
      ...observationInput,
      details: {
        ...(observationInput.details ?? {}),
        recordedByWorkerId: WORKER_ID,
        reprobeExecutionId: started.executionId,
        promotionProof: "EU_COMPATIBILITY_REPROBE_V1",
      },
    });
    const completed = executions.complete({
      executionId: started.executionId,
      workerId: WORKER_ID,
      observedAt: recorded.observedAt,
      state: recorded.state,
    });
    assertCompleted(completed, {
      targetId: euCanary.targetId,
      observedAt: recorded.observedAt,
      state: recorded.state,
    });

    const fakeCollectionRuns = collectionRunCount(database);
    if (fakeCollectionRuns !== 0) {
      throw new Error(
        `EU compatibility promotion proof created ${fakeCollectionRuns} CollectionRun records`,
      );
    }

    process.stdout.write(
      `${JSON.stringify({
        event: "eu-compatibility-reprobe-promotion.complete",
        proofVersion: "EU_COMPATIBILITY_REPROBE_PROMOTION_V1",
        jurisdiction: "EU",
        targetId: euCanary.targetId,
        profile: euCanary.profile,
        primaryUri: euCanary.canonicalUri,
        observedAt: recorded.observedAt,
        observationState: recorded.state,
        executionId: completed.executionId,
        executionStatus: completed.status,
        observationId: completed.observationId,
        collectionRunCount: fakeCollectionRuns,
        outputRoot,
      })}\n`,
    );
  } finally {
    database.close();
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
