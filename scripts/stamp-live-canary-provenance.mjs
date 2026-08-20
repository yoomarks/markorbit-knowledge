import { readFile, writeFile } from "node:fs/promises";

function argument(name) {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function required(value, field) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

async function main() {
  const summaryPath = required(argument("--summary"), "--summary");
  const raw = JSON.parse(await readFile(summaryPath, "utf8"));
  if (raw?.version !== "REPRESENTATIVE_SOURCE_LIVE_CANARY_RESULT_V2") {
    throw new Error("unsupported live canary summary version");
  }

  raw.evidenceContext = {
    provider: "GITHUB_ACTIONS",
    repository: required(process.env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY"),
    runId: required(process.env.GITHUB_RUN_ID, "GITHUB_RUN_ID"),
    runAttempt: required(process.env.GITHUB_RUN_ATTEMPT, "GITHUB_RUN_ATTEMPT"),
    commitSha: required(
      process.env.MARKORBIT_LIVE_CANARY_SOURCE_SHA,
      "MARKORBIT_LIVE_CANARY_SOURCE_SHA",
    ),
    workflowSha: required(process.env.GITHUB_SHA, "GITHUB_SHA"),
    workflow: required(process.env.GITHUB_WORKFLOW, "GITHUB_WORKFLOW"),
    eventName: required(process.env.GITHUB_EVENT_NAME, "GITHUB_EVENT_NAME"),
    ...(process.env.MARKORBIT_LIVE_CANARY_SOURCE_REF?.trim()
      ? { sourceRef: process.env.MARKORBIT_LIVE_CANARY_SOURCE_REF.trim() }
      : {}),
    ...(process.env.GITHUB_SERVER_URL?.trim()
      ? { serverUrl: process.env.GITHUB_SERVER_URL.trim() }
      : {}),
  };

  await writeFile(summaryPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  process.stdout.write(
    `${JSON.stringify({ event: "representative-live-canary.provenance-stamped", summaryPath, evidenceContext: raw.evidenceContext })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
