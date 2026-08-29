import path from "node:path";
import { loadCnipaBrowserSessionConfig } from "./config";
import {
  loadCnipaLiveAcceptancePlanFile,
  runCnipaLiveAcceptancePlan,
} from "./cnipa-live-acceptance";
import { CnipaPlaywrightSessionExecutorFactory } from "./cnipa-playwright-session-executor";

type CliArguments = {
  planPath: string;
  outputDirectory?: string;
  executeLive: boolean;
};

function valueAfter(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

export function parseCnipaLiveAcceptanceArguments(args: string[]): CliArguments {
  let planPath: string | undefined;
  let outputDirectory: string | undefined;
  let executeLive = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--execute-live-cnipa") {
      executeLive = true;
      continue;
    }
    if (arg === "--plan") {
      planPath = valueAfter(args, index, "--plan");
      index += 1;
      continue;
    }
    if (arg.startsWith("--plan=")) {
      planPath = arg.slice("--plan=".length);
      continue;
    }
    if (arg === "--output") {
      outputDirectory = valueAfter(args, index, "--output");
      index += 1;
      continue;
    }
    if (arg.startsWith("--output=")) {
      outputDirectory = arg.slice("--output=".length);
      continue;
    }
    throw new Error(`Unknown CNIPA live acceptance argument: ${arg}`);
  }
  if (!planPath) throw new Error("--plan is required");
  if (executeLive && !outputDirectory)
    throw new Error("--output is required with --execute-live-cnipa");
  return {
    planPath: path.resolve(planPath),
    ...(outputDirectory ? { outputDirectory: path.resolve(outputDirectory) } : {}),
    executeLive,
  };
}

async function main(): Promise<void> {
  const args = parseCnipaLiveAcceptanceArguments(process.argv.slice(2));
  const loaded = await loadCnipaLiveAcceptancePlanFile(args.planPath);
  if (!args.executeLive) {
    process.stdout.write(
      `${JSON.stringify({
        event: "cnipa.live_acceptance.plan_validated",
        probeCount: loaded.plan.probes.length,
        planSha256: loaded.planSha256,
        liveRequestPerformed: false,
        message:
          "Plan validated only. No browser was launched and no CNIPA request was performed. Add --execute-live-cnipa and --output only during authorized manual acceptance.",
      })}\n`,
    );
    return;
  }

  const outputDirectory = args.outputDirectory!;
  const sessionOptions = loadCnipaBrowserSessionConfig(process.env, { headless: true });
  const result = await runCnipaLiveAcceptancePlan({
    plan: loaded.plan,
    planSha256: loaded.planSha256,
    outputDirectory,
    sessionFactory: new CnipaPlaywrightSessionExecutorFactory(sessionOptions),
  });
  process.stdout.write(
    `${JSON.stringify({
      event: "cnipa.live_acceptance.completed",
      probeCount: result.manifest.probeCount,
      successfulProbeCount: result.manifest.successfulProbeCount,
      failedProbeCount: result.manifest.failedProbeCount,
      manifestPath: result.manifestPath,
    })}\n`,
  );
  if (result.manifest.failedProbeCount > 0) process.exitCode = 2;
}

if (process.env.VITEST !== "true") {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        event: "cnipa.live_acceptance.failed",
        message: error instanceof Error ? error.message : "CNIPA live acceptance failed",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
