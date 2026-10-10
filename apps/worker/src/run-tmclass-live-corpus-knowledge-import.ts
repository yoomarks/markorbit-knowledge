import { access, mkdir, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { importTmclassHarToKnowledge } from "./run-tmclass-har-knowledge-import.js";

type Options = {
  captureRoot: string;
  outputRoot: string;
  browserExecutable: string;
  databasePath: string;
  artifactRoot: string;
  workspaceId: string;
  continuous: boolean;
  pollMs: number;
};

function options(argv: string[]): Options {
  const continuous = argv.includes("--continuous");
  const filtered = argv.filter((value) => value !== "--continuous" && value !== "--");
  const values = new Map<string, string>();
  for (let index = 0; index < filtered.length; index += 2) {
    const flag = filtered[index];
    const value = filtered[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag ?? "argument"}`);
    }
    if (values.has(flag)) throw new Error(`Duplicate argument ${flag}`);
    values.set(flag, value);
  }
  const required = (flag: string): string => {
    const value = values.get(flag)?.trim();
    if (!value) throw new Error(`${flag} is required`);
    return value;
  };
  const allowed = new Set([
    "--capture-root",
    "--output-root",
    "--browser-executable",
    "--database",
    "--artifact-root",
    "--workspace-id",
    "--poll-ms",
  ]);
  const unknown = [...values.keys()].filter((flag) => !allowed.has(flag));
  if (unknown.length > 0) throw new Error(`Unsupported argument ${unknown[0]}`);
  const pollMs = Number(values.get("--poll-ms") ?? "10000");
  if (!Number.isSafeInteger(pollMs) || pollMs < 1_000 || pollMs > 300_000) {
    throw new Error("--poll-ms must be an integer in 1000..300000");
  }
  return {
    captureRoot: path.resolve(required("--capture-root")),
    outputRoot: path.resolve(required("--output-root")),
    browserExecutable: path.resolve(required("--browser-executable")),
    databasePath: path.resolve(required("--database")),
    artifactRoot: path.resolve(required("--artifact-root")),
    workspaceId: required("--workspace-id"),
    continuous,
    pollMs,
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function filesRecursively(root: string, suffix: string): Promise<string[]> {
  if (!(await exists(root))) return [];
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await filesRecursively(child, suffix)));
    else if (entry.isFile() && entry.name.endsWith(suffix)) result.push(child);
  }
  return result.sort();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function writeStatus(configured: Options, admitted: number, pending: number): Promise<void> {
  await mkdir(configured.outputRoot, { recursive: true });
  const statusPath = path.join(configured.outputRoot, "STATUS.json");
  const temporary = `${statusPath}.tmp-${process.pid}`;
  await writeFile(
    temporary,
    `${JSON.stringify(
      {
        schemaVersion: "TMCLASS_LIVE_CORPUS_KNOWLEDGE_IMPORT_V1",
        updatedAt: new Date().toISOString(),
        admittedBatchCount: admitted,
        pendingBatchCount: pending,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await rename(temporary, statusPath);
}

async function pass(configured: Options): Promise<{ admitted: number; pending: number }> {
  const detailRoot = path.join(configured.captureRoot, "details");
  const harFiles = await filesRecursively(detailRoot, ".har");
  let admitted = 0;
  let pending = 0;
  for (const harFile of harFiles) {
    const relative = path.relative(detailRoot, harFile).replace(/\.har$/u, ".bundle.json");
    const output = path.join(configured.outputRoot, relative);
    if (await exists(output)) {
      admitted += 1;
      continue;
    }
    pending += 1;
    await importTmclassHarToKnowledge({
      inputs: [harFile],
      output,
      browserExecutable: configured.browserExecutable,
      databasePath: configured.databasePath,
      artifactRoot: configured.artifactRoot,
      workspaceId: configured.workspaceId,
    });
    admitted += 1;
    pending -= 1;
    process.stdout.write(
      `${JSON.stringify({ outcome: "TMCLASS_LIVE_CORPUS_BATCH_ADMITTED_TO_KNOWLEDGE", harFile, output })}\n`,
    );
  }
  await writeStatus(configured, admitted, pending);
  return { admitted, pending };
}

async function main(): Promise<void> {
  const configured = options(process.argv.slice(2));
  for (;;) {
    const result = await pass(configured);
    const captureComplete = await exists(path.join(configured.captureRoot, "COMPLETE.json"));
    if (captureComplete && result.pending === 0) {
      const completePath = path.join(configured.outputRoot, "COMPLETE.json");
      if (!(await exists(completePath))) {
        await writeFile(
          completePath,
          `${JSON.stringify(
            {
              schemaVersion: "TMCLASS_LIVE_CORPUS_KNOWLEDGE_IMPORT_V1",
              outcome: "TMCLASS_LIVE_CORPUS_ADMITTED_TO_KNOWLEDGE",
              completedAt: new Date().toISOString(),
              admittedBatchCount: result.admitted,
            },
            null,
            2,
          )}\n`,
          { encoding: "utf8", flag: "wx" },
        );
      }
      return;
    }
    if (!configured.continuous) return;
    await delay(configured.pollMs);
  }
}

await main();
