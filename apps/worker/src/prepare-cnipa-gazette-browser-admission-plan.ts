import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  cnipaGazetteBrowserAuthorityPlanSha256,
  expectedCnipaGazetteBrowserAuthorityToken,
  parseCnipaGazetteBrowserAuthorityPlan,
} from "@markorbit/worker-runtime";

type Arguments = {
  browserPlanPath: string;
  runId: string;
  outputPath: string;
  authorityIssueNumber: number;
  operationId: string;
  dataEngineUrl: string;
  expectedSha: string;
  authorityToken: string;
};

function valueAfter(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

export function parseCnipaGazetteAdmissionPlanPreparationArguments(args: string[]): Arguments {
  let browserPlanPath: string | undefined;
  let runId: string | undefined;
  let outputPath: string | undefined;
  let authorityIssueNumber: number | undefined;
  let operationId: string | undefined;
  let dataEngineUrl: string | undefined;
  let expectedSha: string | undefined;
  let authorityToken: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--") continue;
    if (arg === "--browser-plan") {
      browserPlanPath = valueAfter(args, index, arg);
      index += 1;
    } else if (arg === "--run-id") {
      runId = valueAfter(args, index, arg);
      index += 1;
    } else if (arg === "--output") {
      outputPath = valueAfter(args, index, arg);
      index += 1;
    } else if (arg === "--authority-issue") {
      authorityIssueNumber = Number(valueAfter(args, index, arg));
      index += 1;
    } else if (arg === "--operation-id") {
      operationId = valueAfter(args, index, arg);
      index += 1;
    } else if (arg === "--data-engine-url") {
      dataEngineUrl = valueAfter(args, index, arg);
      index += 1;
    } else if (arg === "--expected-sha") {
      expectedSha = valueAfter(args, index, arg);
      index += 1;
    } else if (arg === "--authority-token") {
      authorityToken = valueAfter(args, index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown CNIPA Gazette admission-plan argument: ${arg}`);
    }
  }

  if (!browserPlanPath) throw new Error("--browser-plan is required");
  if (!runId) throw new Error("--run-id is required");
  if (!outputPath) throw new Error("--output is required");
  if (
    authorityIssueNumber === undefined ||
    !Number.isSafeInteger(authorityIssueNumber) ||
    authorityIssueNumber < 1
  ) {
    throw new Error("--authority-issue must be a positive integer");
  }
  if (!operationId) throw new Error("--operation-id is required");
  if (!dataEngineUrl) throw new Error("--data-engine-url is required");
  if (!expectedSha || !/^[a-f0-9]{64}$/u.test(expectedSha)) {
    throw new Error("--expected-sha must be lowercase SHA-256");
  }
  if (!authorityToken) throw new Error("--authority-token is required");

  return {
    browserPlanPath: path.resolve(browserPlanPath),
    runId,
    outputPath: path.resolve(outputPath),
    authorityIssueNumber,
    operationId,
    dataEngineUrl,
    expectedSha,
    authorityToken,
  };
}

export function assertCnipaGazetteAdmissionPlanPathOutsideWorkingTree(
  targetPath: string,
  cwd = process.cwd(),
): string {
  const target = path.resolve(targetPath);
  const root = path.resolve(cwd);
  const relative = path.relative(root, target);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error("CNIPA Gazette admission plan path must live outside the repository");
  }
  return target;
}

function normalizedBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Control-plane URL must use http or https");
  }
  return url.toString().replace(/\/$/u, "");
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export async function prepareCnipaGazetteAdmissionPlan(
  input: Arguments & {
    controlPlaneUrl: string;
    internalSecret: string;
    fetcher?: typeof fetch;
  },
) {
  const planPath = assertCnipaGazetteAdmissionPlanPathOutsideWorkingTree(input.browserPlanPath);
  const outputPath = assertCnipaGazetteAdmissionPlanPathOutsideWorkingTree(input.outputPath);
  const browserPlan = parseCnipaGazetteBrowserAuthorityPlan(
    JSON.parse(await readFile(planPath, "utf8")) as unknown,
  );
  const browserPlanSha256 = cnipaGazetteBrowserAuthorityPlanSha256(browserPlan);
  if (browserPlanSha256 !== input.expectedSha) {
    throw new Error("Browser expected SHA does not match the frozen plan");
  }
  const expectedToken = expectedCnipaGazetteBrowserAuthorityToken(browserPlan, browserPlanSha256);
  if (input.authorityToken !== expectedToken) {
    throw new Error("Browser GO token does not match the frozen plan");
  }

  const response = await (input.fetcher ?? fetch)(
    `${normalizedBaseUrl(input.controlPlaneUrl)}/api/internal/cnipa-gazette/browser-stream`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-markorbit-internal-authorization": input.internalSecret,
        "x-markorbit-cnipa-gazette-browser-authority": input.authorityToken,
      },
      body: JSON.stringify({
        workspaceId: browserPlan.workspaceId,
        operation: "BUILD_ADMISSION_PLAN",
        authority: {
          frozenPlan: browserPlan,
          planSha256: browserPlanSha256,
        },
        payload: {
          runId: input.runId,
          authorityIssueNumber: input.authorityIssueNumber,
          operationId: input.operationId,
          dataEngineUrl: input.dataEngineUrl,
        },
      }),
    },
  );

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const root = body && typeof body === "object" ? record(body, "response") : {};
    const error =
      root.error && typeof root.error === "object" && !Array.isArray(root.error)
        ? (root.error as Record<string, unknown>)
        : {};
    const message = typeof error.message === "string" ? error.message : `HTTP ${response.status}`;
    throw new Error(`browser-stream BUILD_ADMISSION_PLAN: ${message}`);
  }

  const root = record(body, "admission-plan response");
  const plan = record(root.plan, "admission-plan response.plan");
  const planSha256 = String(root.planSha256 ?? "");
  const expectedAuthorityToken = String(root.expectedAuthorityToken ?? "");
  if (!/^[a-f0-9]{64}$/u.test(planSha256) || !expectedAuthorityToken) {
    throw new Error("Admission-plan response is missing SHA-bound authority");
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(plan, null, 2) + "\n", "utf8");

  return {
    browserPlanSha256,
    outputPath,
    planSha256,
    expectedAuthorityToken,
    sourceBrowserRunId: String(root.sourceBrowserRunId ?? input.runId),
    historicalReplayActivated: root.historicalReplayActivated === false ? false : null,
  };
}

async function main(): Promise<void> {
  const args = parseCnipaGazetteAdmissionPlanPreparationArguments(process.argv.slice(2));
  const controlPlaneUrl = process.env.MARKORBIT_CONTROL_PLANE_URL?.trim();
  const internalSecret = process.env.MO_INTERNAL_SERVICE_SECRET?.trim();
  if (!controlPlaneUrl) throw new Error("MARKORBIT_CONTROL_PLANE_URL is required");
  if (!internalSecret) throw new Error("MO_INTERNAL_SERVICE_SECRET is required");

  const result = await prepareCnipaGazetteAdmissionPlan({
    ...args,
    controlPlaneUrl,
    internalSecret,
  });

  process.stdout.write(
    `${JSON.stringify({
      event: "cnipa_gazette_browser_admission_plan.prepared",
      outputPath: result.outputPath,
      sourceBrowserRunId: result.sourceBrowserRunId,
      browserPlanSha256: result.browserPlanSha256,
      planSha256: result.planSha256,
      expectedAuthorityToken: result.expectedAuthorityToken,
      historicalReplayActivated: result.historicalReplayActivated,
    })}\n`,
  );
}

if (process.env.VITEST !== "true") {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        event: "cnipa_gazette_browser_admission_plan.failed",
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
