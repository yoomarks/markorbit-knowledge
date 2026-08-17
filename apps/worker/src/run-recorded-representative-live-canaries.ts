import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { recordRepresentativeLiveCanarySummary } from "./source-compatibility-recorder";

function argument(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function requiredEnvironment(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required for recorded live canaries`);
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

async function runCanary(outputRoot: string): Promise<number> {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const forwarded = process.argv.slice(2).filter((value) => !value.startsWith("--output-dir="));
  const child = spawn(
    command,
    [
      "exec",
      "tsx",
      "src/run-representative-live-canaries.ts",
      ...forwarded,
      `--output-dir=${outputRoot}`,
    ],
    {
      cwd: packageRoot(),
      env: process.env,
      stdio: "inherit",
    },
  );
  return await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  const requestedOutput = argument("--output-dir") ?? process.env.MARKORBIT_LIVE_CANARY_OUTPUT_DIR;
  const outputRoot = requestedOutput
    ? requestedOutput
    : await mkdtemp(join(tmpdir(), "markorbit-recorded-live-canary-"));

  const canaryExitCode = await runCanary(outputRoot);
  const summaryPath = join(outputRoot, "summary.json");
  const summary = JSON.parse(await readFile(summaryPath, "utf8")) as unknown;
  const result = await recordRepresentativeLiveCanarySummary(
    {
      controlPlaneUrl: controlPlaneUrl(),
      workerId: requiredEnvironment("MARKORBIT_WORKER_ID"),
      workerCredential: requiredEnvironment("MARKORBIT_WORKER_CREDENTIAL"),
    },
    summary,
  );

  process.stdout.write(
    `${JSON.stringify({
      event: "representative-live-canary.recorded",
      summaryPath,
      canaryExitCode,
      ...result,
    })}\n`,
  );

  // A strict canary may intentionally return non-zero after producing a valid summary.
  // Persist its DEGRADED/BLOCKED evidence first, then preserve the original exit status.
  if (canaryExitCode !== 0) process.exitCode = canaryExitCode;
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
