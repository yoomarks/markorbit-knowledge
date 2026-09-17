import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assessCnipaCaptureDatasetText } from "./cnipa-capture-dataset-assessor";

type Args = { input: string; output?: string };

function parseArgs(argv: readonly string[]): Args {
  const args = argv[0] === "--" ? argv.slice(1) : [...argv];
  let input: string | undefined;
  let output: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    if (key !== "--input" && key !== "--output") {
      throw new Error("Usage: --input <v0.7-dataset.json> [--output <assessment.json>]");
    }
    const value = args[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("Usage: --input <v0.7-dataset.json> [--output <assessment.json>]");
    }
    if (key === "--input") {
      if (input) throw new Error("--input may be specified only once");
      input = value;
    } else {
      if (output) throw new Error("--output may be specified only once");
      output = value;
    }
    i += 1;
  }
  if (!input) throw new Error("Usage: --input <v0.7-dataset.json> [--output <assessment.json>]");
  return { input, ...(output ? { output } : {}) };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const text = await readFile(resolve(args.input), "utf8");
  const assessment = assessCnipaCaptureDatasetText(text);
  const rendered = JSON.stringify(assessment, null, 2) + "\n";
  if (args.output) {
    await writeFile(resolve(args.output), rendered, { encoding: "utf8", flag: "wx" });
  } else {
    process.stdout.write(rendered);
  }
  if (!assessment.promotion.runtimeDateRangeReady) process.exitCode = 2;
}

main().catch(() => {
  process.stderr.write(
    "CNIPA capture-dataset assessment failed. Verify that the input is an unmodified v0.7 mo-cnipa-query-dataset-v2 JSON export.\n",
  );
  process.exitCode = 1;
});
