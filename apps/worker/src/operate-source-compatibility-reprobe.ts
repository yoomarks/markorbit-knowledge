import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { recordRepresentativeLiveCanarySummaryForReprobe } from "./source-compatibility-recorder";
import {
  completeSourceCompatibilityReprobe,
  failSourceCompatibilityReprobe,
  filterRepresentativeCanarySummary,
  reconcileSourceCompatibilityReprobe,
  startSourceCompatibilityReprobe,
  type SourceCompatibilityReprobeExecutionView,
  type SourceCompatibilityReprobeOperatorConfig,
} from "./source-compatibility-reprobe-operator";

function argument(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function requiredArgument(name: string): string {
  const value = argument(name)?.trim();
  if (!value) throw new Error(`${name}=... is required`);
  return value;
}

function requiredEnvironment(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function controlPlaneUrl(): string {
  const value = requiredEnvironment("MARKORBIT_CONTROL_PLANE_URL");
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MARKORBIT_CONTROL_PLANE_URL must use http or https");
  }
  return url.toString().replace(/\/$/u, "");
}

function packageRoot(): string {
  return fileURLToPath(new URL("..", import.meta.url));
}

async function runCanary(
  execution: SourceCompatibilityReprobeExecutionView,
  outputRoot: string,
): Promise<number> {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const timeout = argument("--timeout-seconds")?.trim();
  const args = [
    "exec",
    "tsx",
    "src/run-representative-live-canaries.ts",
    `--jurisdiction=${execution.jurisdiction}`,
    `--output-dir=${outputRoot}`,
  ];
  if (timeout) args.push(`--timeout-seconds=${timeout}`);
  const child = spawn(command, args, {
    cwd: packageRoot(),
    env: process.env,
    stdio: "inherit",
  });
  return await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}

async function bestEffortFail(
  config: SourceCompatibilityReprobeOperatorConfig,
  execution: SourceCompatibilityReprobeExecutionView,
  error: unknown,
): Promise<void> {
  try {
    await failSourceCompatibilityReprobe(config, {
      executionId: execution.executionId,
      errorCode: "SOURCE_COMPATIBILITY_REPROBE_RUNNER_FAILED",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  } catch (failureError) {
    process.stderr.write(
      `Unable to record re-probe failure: ${failureError instanceof Error ? failureError.message : String(failureError)}\n`,
    );
  }
}

async function main(): Promise<void> {
  const config: SourceCompatibilityReprobeOperatorConfig = {
    controlPlaneUrl: controlPlaneUrl(),
    workerId: requiredEnvironment("MARKORBIT_WORKER_ID"),
    workerCredential: requiredEnvironment("MARKORBIT_WORKER_CREDENTIAL"),
  };
  const execution = await startSourceCompatibilityReprobe(config, {
    intentId: requiredArgument("--intent-id"),
    executedByActorId: requiredArgument("--executed-by"),
    idempotencyKey: requiredArgument("--idempotency-key"),
  });

  if (execution.status === "COMPLETED") {
    process.stdout.write(
      `${JSON.stringify({ event: "source-compatibility-reprobe.replayed", execution })}\n`,
    );
    return;
  }
  if (execution.status === "FAILED") {
    throw new Error(
      `Compatibility re-probe execution ${execution.executionId} is already FAILED; create and approve a new remediation intent before retrying`,
    );
  }

  const reconciliation = await reconcileSourceCompatibilityReprobe(config, {
    executionId: execution.executionId,
  });
  if (reconciliation.reconciled) {
    process.stdout.write(
      `${JSON.stringify({ event: "source-compatibility-reprobe.reconciled", execution: reconciliation.execution })}\n`,
    );
    return;
  }

  const requestedOutput = argument("--output-dir") ?? process.env.MARKORBIT_LIVE_CANARY_OUTPUT_DIR;
  const outputRoot = requestedOutput
    ? requestedOutput
    : await mkdtemp(join(tmpdir(), "markorbit-compatibility-reprobe-"));
  let evidenceRecorded = false;
  try {
    const exitCode = await runCanary(execution, outputRoot);
    if (exitCode !== 0) {
      throw new Error(`Representative canary subprocess exited with ${exitCode}`);
    }
    const summaryPath = join(outputRoot, "summary.json");
    const rawSummary = JSON.parse(await readFile(summaryPath, "utf8")) as unknown;
    const filtered = filterRepresentativeCanarySummary(rawSummary, execution.targetId);
    const recorded = await recordRepresentativeLiveCanarySummaryForReprobe(
      config,
      filtered.summary,
      execution.executionId,
    );
    if (recorded.recorded !== 1 || recorded.observedAt !== filtered.observedAt) {
      throw new Error(
        `Compatibility intake did not confirm the expected single observation for ${execution.targetId}`,
      );
    }
    evidenceRecorded = true;
    const completed = await completeSourceCompatibilityReprobe(config, {
      executionId: execution.executionId,
      observedAt: filtered.observedAt,
      state: filtered.state,
    });
    process.stdout.write(
      `${JSON.stringify({
        event: "source-compatibility-reprobe.completed",
        summaryPath,
        observationState: filtered.state,
        execution: completed,
      })}\n`,
    );
  } catch (error) {
    // Once exact execution-bound evidence is durable, leave STARTED intact so a
    // subsequent operator run can reconcile without repeating external acquisition.
    if (!evidenceRecorded) await bestEffortFail(config, execution, error);
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
