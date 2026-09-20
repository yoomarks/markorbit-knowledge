import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  cnipaGazetteBrowserAuthorityPlanSha256,
  expectedCnipaGazetteBrowserAuthorityToken,
  parseCnipaGazetteBrowserAuthorityPlan,
  type CnipaGazetteBrowserAuthorityPlan,
} from "@markorbit/worker-runtime";

type CliArguments = {
  planPath: string;
  apply: boolean;
  expectedSha?: string;
  authorityToken?: string;
};

function valueAfter(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

export function parseCnipaGazetteBrowserJobArguments(args: string[]): CliArguments {
  let planPath: string | undefined;
  let expectedSha: string | undefined;
  let authorityToken: string | undefined;
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--") {
      continue;
    }
    if (arg === "--plan") {
      planPath = valueAfter(args, index, "--plan");
      index += 1;
    } else if (arg === "--expected-sha") {
      expectedSha = valueAfter(args, index, "--expected-sha");
      index += 1;
    } else if (arg === "--authority-token") {
      authorityToken = valueAfter(args, index, "--authority-token");
      index += 1;
    } else if (arg === "--apply") {
      apply = true;
    } else {
      throw new Error(`Unknown CNIPA Gazette browser Job argument: ${arg}`);
    }
  }
  if (!planPath) throw new Error("--plan is required");
  if (apply && (!expectedSha || !authorityToken)) {
    throw new Error("--apply requires --expected-sha and --authority-token");
  }
  return {
    planPath: path.resolve(planPath),
    apply,
    ...(expectedSha ? { expectedSha } : {}),
    ...(authorityToken ? { authorityToken } : {}),
  };
}

export function assertCnipaGazetteBrowserPlanPathOutsideWorkingTree(
  target: string,
  workingDirectory = process.cwd(),
): string {
  if (!path.isAbsolute(target)) throw new Error("CNIPA Gazette browser plan path must be absolute");
  const resolvedTarget = path.resolve(target);
  const resolvedWorkingDirectory = path.resolve(workingDirectory);
  const relative = path.relative(resolvedWorkingDirectory, resolvedTarget);
  const inside = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  if (inside)
    throw new Error("CNIPA Gazette browser authority plan must live outside the repository");
  return resolvedTarget;
}
export async function loadCnipaGazetteBrowserAuthorityPlanFile(
  planPath: string,
  workingDirectory = process.cwd(),
) {
  const absolutePath = assertCnipaGazetteBrowserPlanPathOutsideWorkingTree(
    planPath,
    workingDirectory,
  );
  const bytes = await readFile(absolutePath);
  const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  const plan = parseCnipaGazetteBrowserAuthorityPlan(parsed);
  return {
    absolutePath,
    plan,
    planSha256: cnipaGazetteBrowserAuthorityPlanSha256(plan),
  };
}

export function assertCnipaGazetteBrowserAuthority(input: {
  plan: CnipaGazetteBrowserAuthorityPlan;
  planSha256: string;
  expectedSha?: string;
  authorityToken?: string;
}): string {
  if (input.expectedSha !== input.planSha256) {
    throw new Error("CNIPA Gazette browser expected SHA does not match the frozen plan");
  }
  const expected = expectedCnipaGazetteBrowserAuthorityToken(input.plan, input.planSha256);
  if (input.authorityToken !== expected) {
    throw new Error("CNIPA Gazette browser GO token does not match the frozen plan");
  }
  return createHash("sha256").update(expected).digest("hex");
}

function normalizedBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Control-plane URL must use http or https");
  }
  return url.toString().replace(/\/$/u, "");
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requiredString(value, label);
}
export async function applyCnipaGazetteBrowserJobPreparation(input: {
  baseUrl: string;
  plan: CnipaGazetteBrowserAuthorityPlan;
  planSha256: string;
  authorityToken: string;
  fetcher?: typeof fetch;
}) {
  const internalSecret = process.env.MO_INTERNAL_SERVICE_SECRET?.trim();
  if (!internalSecret)
    throw new Error("MO_INTERNAL_SERVICE_SECRET is required for Gazette browser apply");
  const requestPath = "/api/internal/cnipa-gazette/browser-stream";
  const response = await (input.fetcher ?? fetch)(
    `${normalizedBaseUrl(input.baseUrl)}${requestPath}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-markorbit-internal-authorization": internalSecret,
        "x-markorbit-cnipa-gazette-browser-authority": input.authorityToken,
      },
      body: JSON.stringify({
        workspaceId: input.plan.workspaceId,
        operation: "PREPARE_BROWSER_JOB",
        authority: { frozenPlan: input.plan, planSha256: input.planSha256 },
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
    const root =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const error =
      root.error && typeof root.error === "object" && !Array.isArray(root.error)
        ? (root.error as Record<string, unknown>)
        : {};
    const message = typeof error.message === "string" ? error.message : `HTTP ${response.status}`;
    throw new Error(`${requestPath}: ${message}`);
  }
  const root = record(body, "browser preparation response");
  const dispatchPerformed = root.dispatchPerformed === true;
  const expectedDispatch = input.plan.dispatchMode === "PREPARE_AND_DISPATCH_ONCE";
  if (dispatchPerformed !== expectedDispatch)
    throw new Error("browser preparation dispatch outcome does not match frozen plan");
  const bundleSha = requiredString(root.captureToolBundleSha256, "captureToolBundleSha256");
  if (bundleSha !== input.plan.captureToolBundleSha256)
    throw new Error("browser preparation capture bundle SHA mismatch");
  if (root.historicalReplayActivated !== false)
    throw new Error("browser preparation unexpectedly activated historical replay");
  const workerCredential =
    root.workerCredential === null
      ? null
      : requiredString(root.workerCredential, "workerCredential");
  const runId = nullableString(root.runId, "runId");
  const jobId = nullableString(root.jobId, "jobId");
  if (expectedDispatch !== Boolean(runId && jobId))
    throw new Error("browser preparation run/job identity mismatch");
  return {
    sourceId: requiredString(root.sourceId, "sourceId"),
    collectionPlanId: requiredString(root.collectionPlanId, "collectionPlanId"),
    workerId: requiredString(root.workerId, "workerId"),
    workerCredential,
    workerProvisioning: requiredString(root.workerProvisioning, "workerProvisioning"),
    runId,
    jobId,
    replayed: root.replayed === true,
    dispatchPerformed,
    captureToolBundleSha256: bundleSha,
    historicalReplayActivated: false as const,
  };
}
async function main(): Promise<void> {
  const args = parseCnipaGazetteBrowserJobArguments(process.argv.slice(2));
  const loaded = await loadCnipaGazetteBrowserAuthorityPlanFile(args.planPath);
  const expectedAuthorityToken = expectedCnipaGazetteBrowserAuthorityToken(
    loaded.plan,
    loaded.planSha256,
  );
  if (!args.apply) {
    process.stdout.write(
      `${JSON.stringify({
        event: "cnipa_gazette_browser.plan_validated",
        operationId: loaded.plan.operationId,
        announcementIssue: loaded.plan.announcementIssue,
        dispatchMode: loaded.plan.dispatchMode,
        planSha256: loaded.planSha256,
        captureToolBundleName: loaded.plan.captureToolBundleName,
        captureToolBundleSha256: loaded.plan.captureToolBundleSha256,
        applyPerformed: false,
        expectedAuthorityToken,
        historicalReplayActivated: false,
        message:
          "Frozen browser-stream plan validation only. No Knowledge mutation, CNIPA request, or Data Engine write was performed.",
      })}\n`,
    );
    return;
  }
  const authorityTokenSha256 = assertCnipaGazetteBrowserAuthority({
    plan: loaded.plan,
    planSha256: loaded.planSha256,
    expectedSha: args.expectedSha,
    authorityToken: args.authorityToken,
  });
  const controlPlane = process.env.MARKORBIT_CONTROL_PLANE_URL?.trim();
  if (!controlPlane)
    throw new Error("MARKORBIT_CONTROL_PLANE_URL is required for Gazette browser apply");
  const result = await applyCnipaGazetteBrowserJobPreparation({
    baseUrl: controlPlane,
    plan: loaded.plan,
    planSha256: loaded.planSha256,
    authorityToken: args.authorityToken!,
  });
  process.stdout.write(
    `${JSON.stringify({
      event: "cnipa_gazette_browser.preparation_completed",
      operationId: loaded.plan.operationId,
      planSha256: loaded.planSha256,
      authorityTokenSha256,
      ...result,
    })}\n`,
  );
}

if (process.env.VITEST !== "true") {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        event: "cnipa_gazette_browser.preparation_failed",
        message:
          error instanceof Error ? error.message : "CNIPA Gazette browser preparation failed",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
