import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildCnipaGazetteOrchestrationNextBatchPlan,
  buildCnipaGazetteOrchestrationNextPreparation,
  cnipaGazetteBrowserAuthorityPlanSha256,
  cnipaGazetteOrchestrationPlanSha256,
  expectedCnipaGazetteBrowserAuthorityToken,
  expectedCnipaGazetteOrchestrationAuthorityToken,
  expandCnipaGazetteOrchestrationIssues,
  parseCnipaGazetteOrchestrationPlan,
  recordCnipaGazetteOrchestrationIssueEvidence,
  type CnipaGazetteOrchestrationIssueEvidence,
  type CnipaGazetteOrchestrationPlan,
} from "@markorbit/worker-runtime";

type CliArguments = {
  planPath: string;
  prepareNext: boolean;
  recordEvidence: boolean;
  buildNextBatch: boolean;
  evidencePath?: string;
  issueEvidencePath?: string;
  outputEvidencePath?: string;
  outputDirectory?: string;
  batchSize?: number;
  historicalUpperBound?: number;
  expectedSha?: string;
  authorityToken?: string;
};

function valueAfter(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function integerArgument(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function parseCnipaGazetteOrchestrationArguments(args: string[]): CliArguments {
  let planPath: string | undefined;
  let evidencePath: string | undefined;
  let issueEvidencePath: string | undefined;
  let outputEvidencePath: string | undefined;
  let outputDirectory: string | undefined;
  let batchSize: number | undefined;
  let historicalUpperBound: number | undefined;
  let expectedSha: string | undefined;
  let authorityToken: string | undefined;
  let prepareNext = false;
  let recordEvidence = false;
  let buildNextBatch = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--") continue;
    if (arg === "--plan") {
      planPath = valueAfter(args, index, "--plan");
      index += 1;
    } else if (arg === "--evidence") {
      evidencePath = valueAfter(args, index, "--evidence");
      index += 1;
    } else if (arg === "--issue-evidence") {
      issueEvidencePath = valueAfter(args, index, "--issue-evidence");
      index += 1;
    } else if (arg === "--output-evidence") {
      outputEvidencePath = valueAfter(args, index, "--output-evidence");
      index += 1;
    } else if (arg === "--output-dir") {
      outputDirectory = valueAfter(args, index, "--output-dir");
      index += 1;
    } else if (arg === "--batch-size") {
      batchSize = integerArgument(valueAfter(args, index, "--batch-size"), "--batch-size");
      index += 1;
    } else if (arg === "--historical-upper-bound") {
      historicalUpperBound = integerArgument(
        valueAfter(args, index, "--historical-upper-bound"),
        "--historical-upper-bound",
      );
      index += 1;
    } else if (arg === "--expected-sha") {
      expectedSha = valueAfter(args, index, "--expected-sha");
      index += 1;
    } else if (arg === "--authority-token") {
      authorityToken = valueAfter(args, index, "--authority-token");
      index += 1;
    } else if (arg === "--prepare-next") {
      prepareNext = true;
    } else if (arg === "--record-evidence") {
      recordEvidence = true;
    } else if (arg === "--build-next-batch") {
      buildNextBatch = true;
    } else {
      throw new Error(`Unknown CNIPA Gazette orchestration argument: ${arg}`);
    }
  }

  if (!planPath) throw new Error("--plan is required");

  const actions = [prepareNext, recordEvidence, buildNextBatch].filter(Boolean).length;
  if (actions > 1) {
    throw new Error(
      "--prepare-next, --record-evidence and --build-next-batch are mutually exclusive",
    );
  }

  if (prepareNext && (!evidencePath || !outputDirectory || !expectedSha || !authorityToken)) {
    throw new Error(
      "--prepare-next requires --evidence, --output-dir, --expected-sha and --authority-token",
    );
  }
  if (
    recordEvidence &&
    (!issueEvidencePath || !outputEvidencePath || !expectedSha || !authorityToken)
  ) {
    throw new Error(
      "--record-evidence requires --issue-evidence, --output-evidence, --expected-sha and --authority-token",
    );
  }
  if (
    buildNextBatch &&
    (!evidencePath || !outputDirectory || !batchSize || !expectedSha || !authorityToken)
  ) {
    throw new Error(
      "--build-next-batch requires --evidence, --output-dir, --batch-size, --expected-sha and --authority-token",
    );
  }

  return {
    planPath: path.resolve(planPath),
    prepareNext,
    recordEvidence,
    buildNextBatch,
    ...(evidencePath ? { evidencePath: path.resolve(evidencePath) } : {}),
    ...(issueEvidencePath ? { issueEvidencePath: path.resolve(issueEvidencePath) } : {}),
    ...(outputEvidencePath ? { outputEvidencePath: path.resolve(outputEvidencePath) } : {}),
    ...(outputDirectory ? { outputDirectory: path.resolve(outputDirectory) } : {}),
    ...(batchSize !== undefined ? { batchSize } : {}),
    ...(historicalUpperBound !== undefined ? { historicalUpperBound } : {}),
    ...(expectedSha ? { expectedSha } : {}),
    ...(authorityToken ? { authorityToken } : {}),
  };
}

export function assertCnipaGazetteOrchestrationPathOutsideWorkingTree(
  target: string,
  workingDirectory = process.cwd(),
): string {
  if (!path.isAbsolute(target)) {
    throw new Error("CNIPA Gazette orchestration paths must be absolute");
  }
  const resolvedTarget = path.resolve(target);
  const resolvedWorkingDirectory = path.resolve(workingDirectory);
  const relative = path.relative(resolvedWorkingDirectory, resolvedTarget);
  const inside = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  if (inside) {
    throw new Error(
      "CNIPA Gazette orchestration plan/evidence/output must live outside repository",
    );
  }
  return resolvedTarget;
}

async function readJsonFile(target: string): Promise<unknown> {
  const bytes = await readFile(target);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

export async function loadCnipaGazetteOrchestrationPlanFile(
  planPath: string,
  workingDirectory = process.cwd(),
) {
  const absolutePath = assertCnipaGazetteOrchestrationPathOutsideWorkingTree(
    planPath,
    workingDirectory,
  );
  const plan = parseCnipaGazetteOrchestrationPlan(await readJsonFile(absolutePath));
  return {
    absolutePath,
    plan,
    planSha256: cnipaGazetteOrchestrationPlanSha256(plan),
  };
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export async function loadCnipaGazetteOrchestrationEvidenceFile(
  evidencePath: string,
  workingDirectory = process.cwd(),
): Promise<readonly CnipaGazetteOrchestrationIssueEvidence[]> {
  const absolutePath = assertCnipaGazetteOrchestrationPathOutsideWorkingTree(
    evidencePath,
    workingDirectory,
  );
  const root = objectValue(await readJsonFile(absolutePath), "orchestration evidence");
  const extras = Object.keys(root).filter((key) => !["version", "issues"].includes(key));
  if (extras.length > 0) {
    throw new Error(`orchestration evidence contains unsupported keys: ${extras.join(", ")}`);
  }
  if (root.version !== 1 || !Array.isArray(root.issues)) {
    throw new Error("orchestration evidence must be version 1 with an issues array");
  }
  return root.issues as CnipaGazetteOrchestrationIssueEvidence[];
}

export async function loadCnipaGazetteOrchestrationIssueEvidenceFile(
  evidencePath: string,
  workingDirectory = process.cwd(),
): Promise<CnipaGazetteOrchestrationIssueEvidence> {
  const absolutePath = assertCnipaGazetteOrchestrationPathOutsideWorkingTree(
    evidencePath,
    workingDirectory,
  );
  return objectValue(
    await readJsonFile(absolutePath),
    "orchestration issue evidence",
  ) as unknown as CnipaGazetteOrchestrationIssueEvidence;
}

export async function recordCnipaGazetteOrchestrationEvidence(input: {
  plan: CnipaGazetteOrchestrationPlan;
  existing?: readonly CnipaGazetteOrchestrationIssueEvidence[];
  update: CnipaGazetteOrchestrationIssueEvidence;
  outputPath: string;
  workingDirectory?: string;
}) {
  const outputPath = assertCnipaGazetteOrchestrationPathOutsideWorkingTree(
    input.outputPath,
    input.workingDirectory ?? process.cwd(),
  );
  const issues = recordCnipaGazetteOrchestrationIssueEvidence({
    plan: input.plan,
    existing: input.existing,
    update: input.update,
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ version: 1, issues }, null, 2)}\n`, "utf8");
  return {
    outputPath,
    issues,
    progress: buildCnipaGazetteOrchestrationNextPreparation({
      plan: input.plan,
      evidence: issues,
    }).progress,
  };
}

export async function prepareCnipaGazetteOrchestrationNextBatch(input: {
  plan: CnipaGazetteOrchestrationPlan;
  evidence: readonly CnipaGazetteOrchestrationIssueEvidence[];
  batchSize: number;
  historicalUpperBound?: number;
  outputDirectory: string;
  workingDirectory?: string;
}) {
  const outputDirectory = assertCnipaGazetteOrchestrationPathOutsideWorkingTree(
    input.outputDirectory,
    input.workingDirectory ?? process.cwd(),
  );
  const proposal = buildCnipaGazetteOrchestrationNextBatchPlan({
    plan: input.plan,
    evidence: input.evidence,
    batchSize: input.batchSize,
    ...(input.historicalUpperBound !== undefined
      ? { historicalUpperBound: input.historicalUpperBound }
      : {}),
  });

  await mkdir(outputDirectory, { recursive: true });
  let nextPlanPath: string | null = null;
  if (proposal.nextPlan) {
    nextPlanPath = path.join(outputDirectory, "next-orchestration-plan.json");
    await writeFile(nextPlanPath, `${JSON.stringify(proposal.nextPlan, null, 2)}\n`, "utf8");
  }
  const proposalPath = path.join(outputDirectory, "next-batch.json");
  await writeFile(
    proposalPath,
    `${JSON.stringify(
      {
        parentPlanSha256: proposal.parentPlanSha256,
        nextPlanPath,
        nextPlanSha256: proposal.nextPlanSha256,
        expectedAuthorityToken: proposal.expectedAuthorityToken,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return {
    ...proposal,
    nextPlanPath,
    proposalPath,
  };
}

export function assertCnipaGazetteOrchestrationAuthority(input: {
  plan: CnipaGazetteOrchestrationPlan;
  planSha256: string;
  expectedSha?: string;
  authorityToken?: string;
}): string {
  if (input.expectedSha !== input.planSha256) {
    throw new Error("CNIPA Gazette orchestration expected SHA does not match frozen plan");
  }
  const expected = expectedCnipaGazetteOrchestrationAuthorityToken(input.plan, input.planSha256);
  if (input.authorityToken !== expected) {
    throw new Error("CNIPA Gazette orchestration GO token does not match frozen plan");
  }
  return createHash("sha256").update(expected).digest("hex");
}

export async function prepareCnipaGazetteOrchestrationNext(input: {
  plan: CnipaGazetteOrchestrationPlan;
  evidence: readonly CnipaGazetteOrchestrationIssueEvidence[];
  outputDirectory: string;
  workingDirectory?: string;
}) {
  const outputDirectory = assertCnipaGazetteOrchestrationPathOutsideWorkingTree(
    input.outputDirectory,
    input.workingDirectory ?? process.cwd(),
  );
  const prepared = buildCnipaGazetteOrchestrationNextPreparation({
    plan: input.plan,
    evidence: input.evidence,
  });

  await mkdir(outputDirectory, { recursive: true });
  const progressPath = path.join(outputDirectory, "progress.json");
  await writeFile(progressPath, `${JSON.stringify(prepared.progress, null, 2)}\n`, "utf8");

  let browserPlanPath: string | null = null;
  let browserPlanSha256: string | null = null;
  let expectedBrowserAuthorityToken: string | null = null;

  if (prepared.next?.browserPlan) {
    browserPlanPath = path.join(outputDirectory, "next-browser-plan.json");
    browserPlanSha256 = cnipaGazetteBrowserAuthorityPlanSha256(prepared.next.browserPlan);
    expectedBrowserAuthorityToken = expectedCnipaGazetteBrowserAuthorityToken(
      prepared.next.browserPlan,
      browserPlanSha256,
    );
    await writeFile(
      browserPlanPath,
      `${JSON.stringify(prepared.next.browserPlan, null, 2)}\n`,
      "utf8",
    );
  }

  const nextPath = path.join(outputDirectory, "next-action.json");
  await writeFile(
    nextPath,
    `${JSON.stringify(
      {
        announcementIssue: prepared.next?.announcementIssue ?? null,
        status: prepared.next?.status ?? null,
        nextAction: prepared.next?.nextAction ?? "NONE",
        browserPlanPath,
        browserPlanSha256,
        expectedBrowserAuthorityToken,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return {
    progress: prepared.progress,
    next: prepared.next,
    progressPath,
    nextPath,
    browserPlanPath,
    browserPlanSha256,
    expectedBrowserAuthorityToken,
  };
}

async function main(): Promise<void> {
  const args = parseCnipaGazetteOrchestrationArguments(process.argv.slice(2));
  const loaded = await loadCnipaGazetteOrchestrationPlanFile(args.planPath);
  const issues = expandCnipaGazetteOrchestrationIssues(loaded.plan);
  const expectedAuthorityToken = expectedCnipaGazetteOrchestrationAuthorityToken(
    loaded.plan,
    loaded.planSha256,
  );

  const actionRequested = args.prepareNext || args.recordEvidence || args.buildNextBatch;
  if (!actionRequested) {
    process.stdout.write(
      `${JSON.stringify({
        event: "cnipa_gazette_orchestration.plan_validated",
        operationId: loaded.plan.operationId,
        purpose: loaded.plan.purpose,
        issueCount: issues.length,
        firstIssue: issues[0],
        lastIssue: issues.at(-1),
        parentPlanSha256: loaded.plan.parentPlanSha256 ?? null,
        planSha256: loaded.planSha256,
        expectedAuthorityToken,
        historicalReplayActivated: loaded.plan.historicalReplayActivated,
        applyPerformed: false,
        cnipaNetworkAccessPerformed: false,
        knowledgeMutationPerformed: false,
        dataEngineMutationPerformed: false,
        message:
          "Frozen orchestration plan validation only. No CNIPA request, Knowledge mutation, browser dispatch, or Data Engine write was performed.",
      })}\n`,
    );
    return;
  }

  const authorityTokenSha256 = assertCnipaGazetteOrchestrationAuthority({
    plan: loaded.plan,
    planSha256: loaded.planSha256,
    expectedSha: args.expectedSha,
    authorityToken: args.authorityToken,
  });

  if (args.recordEvidence) {
    const existing = args.evidencePath
      ? await loadCnipaGazetteOrchestrationEvidenceFile(args.evidencePath)
      : [];
    const update = await loadCnipaGazetteOrchestrationIssueEvidenceFile(args.issueEvidencePath!);
    const result = await recordCnipaGazetteOrchestrationEvidence({
      plan: loaded.plan,
      existing,
      update,
      outputPath: args.outputEvidencePath!,
    });
    process.stdout.write(
      `${JSON.stringify({
        event: "cnipa_gazette_orchestration.evidence_recorded",
        operationId: loaded.plan.operationId,
        planSha256: loaded.planSha256,
        authorityTokenSha256,
        announcementIssue: update.announcementIssue,
        evidencePath: result.outputPath,
        counts: result.progress.counts,
        nextIssue: result.progress.nextIssue,
        browserDispatchPerformed: false,
        cnipaNetworkAccessPerformed: false,
        knowledgeMutationPerformed: false,
        dataEngineMutationPerformed: false,
      })}\n`,
    );
    return;
  }

  const evidence = await loadCnipaGazetteOrchestrationEvidenceFile(args.evidencePath!);

  if (args.buildNextBatch) {
    const result = await prepareCnipaGazetteOrchestrationNextBatch({
      plan: loaded.plan,
      evidence,
      batchSize: args.batchSize!,
      ...(args.historicalUpperBound !== undefined
        ? { historicalUpperBound: args.historicalUpperBound }
        : {}),
      outputDirectory: args.outputDirectory!,
    });
    process.stdout.write(
      `${JSON.stringify({
        event: "cnipa_gazette_orchestration.next_batch_prepared",
        operationId: loaded.plan.operationId,
        planSha256: loaded.planSha256,
        authorityTokenSha256,
        parentPlanSha256: result.parentPlanSha256,
        nextPlanPath: result.nextPlanPath,
        nextPlanSha256: result.nextPlanSha256,
        expectedNextAuthorityToken: result.expectedAuthorityToken,
        proposalPath: result.proposalPath,
        browserDispatchPerformed: false,
        cnipaNetworkAccessPerformed: false,
        knowledgeMutationPerformed: false,
        dataEngineMutationPerformed: false,
      })}\n`,
    );
    return;
  }

  const result = await prepareCnipaGazetteOrchestrationNext({
    plan: loaded.plan,
    evidence,
    outputDirectory: args.outputDirectory!,
  });

  process.stdout.write(
    `${JSON.stringify({
      event: "cnipa_gazette_orchestration.next_prepared",
      operationId: loaded.plan.operationId,
      planSha256: loaded.planSha256,
      authorityTokenSha256,
      completed: result.progress.completed,
      counts: result.progress.counts,
      nextIssue: result.progress.nextIssue,
      nextAction: result.next?.nextAction ?? "NONE",
      progressPath: result.progressPath,
      nextActionPath: result.nextPath,
      browserPlanPath: result.browserPlanPath,
      browserPlanSha256: result.browserPlanSha256,
      expectedBrowserAuthorityToken: result.expectedBrowserAuthorityToken,
      browserDispatchPerformed: false,
      cnipaNetworkAccessPerformed: false,
      knowledgeMutationPerformed: false,
      dataEngineMutationPerformed: false,
    })}\n`,
  );
}

if (process.env.VITEST !== "true") {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        event: "cnipa_gazette_orchestration.failed",
        message: error instanceof Error ? error.message : "CNIPA Gazette orchestration failed",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
