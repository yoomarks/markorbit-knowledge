import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RADAR_INTAKE_FILENAMES } from "../../../packages/contracts/src/radar-source-intake-v1";
import { planRadarSourceIntake, type RadarSourceIntakeFiles } from "./radar-source-intake";

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function loadFiles(directory: string): Promise<RadarSourceIntakeFiles> {
  const files: RadarSourceIntakeFiles = {};
  for (const filename of RADAR_INTAKE_FILENAMES) {
    try {
      files[filename] = await readFile(resolve(directory, filename), "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
  }
  return files;
}

const inputDirectory = resolve(readArgument("--input") ?? "radar");
const files = await loadFiles(inputDirectory);
const plan = planRadarSourceIntake({ files, inputLabel: inputDirectory });

process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
if (plan.summary.errors > 0) process.exitCode = 1;
