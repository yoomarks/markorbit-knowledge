import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RADAR_INTAKE_FILENAMES } from "../../../packages/contracts/src/radar-source-intake-v1";
import { planRadarSourceIntake, type RadarSourceIntakeFiles } from "./radar-source-intake";

function argument(name: string): string | undefined {
  const equalsPrefix = `${name}=`;
  const equalsValue = process.argv.slice(2).find((value) => value.startsWith(equalsPrefix));
  if (equalsValue) return equalsValue.slice(equalsPrefix.length).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
}

async function loadFiles(directory: string): Promise<RadarSourceIntakeFiles> {
  const files: RadarSourceIntakeFiles = {};
  for (const filename of RADAR_INTAKE_FILENAMES) {
    try {
      files[filename] = await readFile(resolve(directory, filename), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return files;
}

async function applyPlan(args: {
  controlPlaneUrl: string;
  workspaceId: string;
  plan: ReturnType<typeof planRadarSourceIntake>;
}) {
  const response = await fetch(
    `${args.controlPlaneUrl.replace(/\/$/, "")}/api/discovery/radar-intake`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: args.workspaceId, plan: args.plan }),
    },
  );
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    throw new Error(
      `Radar Discovery intake apply failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

async function main(): Promise<void> {
  const inputDirectory = resolve(argument("--input") ?? "radar");
  const apply = process.argv.includes("--apply");
  const files = await loadFiles(inputDirectory);
  const plan = planRadarSourceIntake({ files, inputLabel: inputDirectory });

  if (!apply) {
    process.stdout.write(`${JSON.stringify({ mode: "PLAN", plan }, null, 2)}\n`);
    if (plan.summary.errors > 0) process.exitCode = 1;
    return;
  }

  const workspaceId = argument("--workspace");
  if (!workspaceId) {
    throw new Error("--apply requires an explicit --workspace=<workspaceId>");
  }
  if (plan.summary.errors > 0) {
    throw new Error(
      `Radar intake plan has ${plan.summary.errors} validation error(s); refusing apply`,
    );
  }
  const controlPlaneUrl =
    argument("--control-plane") ??
    process.env.MARKORBIT_CONTROL_PLANE_URL?.trim() ??
    "http://127.0.0.1:3000";
  const result = await applyPlan({ controlPlaneUrl, workspaceId, plan });
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: "APPLY",
        inputDirectory,
        workspaceId,
        planSummary: plan.summary,
        discovery: result,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
