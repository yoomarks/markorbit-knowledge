import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cnipaGazetteOrchestrationPlanSha256,
  expectedCnipaGazetteOrchestrationAuthorityToken,
  parseCnipaGazetteOrchestrationPlan,
} from "@markorbit/worker-runtime";
import {
  assertCnipaGazetteOrchestrationAuthority,
  assertCnipaGazetteOrchestrationPathOutsideWorkingTree,
  loadCnipaGazetteOrchestrationEvidenceFile,
  loadCnipaGazetteOrchestrationIssueEvidenceFile,
  loadCnipaGazetteOrchestrationPlanFile,
  parseCnipaGazetteOrchestrationArguments,
  prepareCnipaGazetteOrchestrationNext,
  prepareCnipaGazetteOrchestrationNextBatch,
  recordCnipaGazetteOrchestrationEvidence,
} from "./prepare-cnipa-gazette-orchestration";

const WSP = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const BUNDLE_SHA = "a".repeat(64);
const DATASET_SHA = "b".repeat(64);
const STATE_73 = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const RECEIPT_73 = "art_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function plan() {
  return parseCnipaGazetteOrchestrationPlan({
    version: 1,
    operationId: "historical-73-75-r1",
    workspaceId: WSP,
    authorityMode: "INTERNAL_SERVICE_GO_V1",
    stage: "MULTI_ISSUE_ORCHESTRATION",
    purpose: "HISTORICAL_BACKFILL",
    issueSelection: {
      mode: "RANGE",
      startIssue: 73,
      endIssue: 75,
    },
    announcementTypeSelection: "ALL",
    anncType: "",
    concurrency: 1,
    browserTemplate: {
      targetLogicalPagesPerCheckpoint: 10,
      maxRuntimeSeconds: 3600,
      captureToolVersion: "1.0.3",
      captureToolBundleName: "MO_CNIPA_Network_Capture_v1.0.3.zip",
      captureToolBundleSha256: BUNDLE_SHA,
    },
    dataEngineMutation: "DISABLED",
    historicalReplayActivated: true,
  });
}

function completedIssue(announcementIssue: number) {
  return {
    announcementIssue,
    browser: {
      stateArtifactId: STATE_73,
      completed: true,
      nextSourcePageIndex: 7,
      rowsSeen: 576,
    },
    admission: {
      sourceDatasetSha256: DATASET_SHA,
      finalizeReceiptArtifactId: RECEIPT_73,
    },
  } as const;
}

function completed73() {
  return completedIssue(73);
}

describe("CNIPA Gazette orchestration preparation CLI", () => {
  it("parses validation separately from authorized next preparation", () => {
    expect(
      parseCnipaGazetteOrchestrationArguments(["--", "--plan", "D:\\proof\\plan.json"]),
    ).toMatchObject({ prepareNext: false });

    expect(() =>
      parseCnipaGazetteOrchestrationArguments(["--plan", "D:\\proof\\plan.json", "--prepare-next"]),
    ).toThrow(/requires --evidence, --output-dir, --expected-sha and --authority-token/u);

    expect(
      parseCnipaGazetteOrchestrationArguments([
        "--plan",
        "D:\\proof\\plan.json",
        "--prepare-next",
        "--evidence",
        "D:\\proof\\evidence.json",
        "--output-dir",
        "D:\\proof\\output",
        "--expected-sha",
        "a".repeat(64),
        "--authority-token",
        "GO fixture",
      ]),
    ).toMatchObject({
      prepareNext: true,
      expectedSha: "a".repeat(64),
      authorityToken: "GO fixture",
    });
  });

  it("loads a repo-external frozen plan and verifies exact orchestration SHA/token", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mo-gazette-orchestration-"));
    dirs.push(dir);
    const planPath = path.join(dir, "plan.json");
    const frozen = plan();
    await writeFile(planPath, JSON.stringify(frozen), "utf8");

    const loaded = await loadCnipaGazetteOrchestrationPlanFile(planPath);
    const sha = cnipaGazetteOrchestrationPlanSha256(frozen);
    const token = expectedCnipaGazetteOrchestrationAuthorityToken(frozen, sha);

    expect(loaded.planSha256).toBe(sha);
    expect(
      assertCnipaGazetteOrchestrationAuthority({
        plan: frozen,
        planSha256: sha,
        expectedSha: sha,
        authorityToken: token,
      }),
    ).toMatch(/^[a-f0-9]{64}$/u);

    expect(() =>
      assertCnipaGazetteOrchestrationAuthority({
        plan: frozen,
        planSha256: sha,
        expectedSha: "0".repeat(64),
        authorityToken: token,
      }),
    ).toThrow(/expected SHA/u);
  });

  it("rejects plan/evidence/output paths inside the repository", () => {
    expect(() =>
      assertCnipaGazetteOrchestrationPathOutsideWorkingTree(
        path.join(process.cwd(), "governed-plan.json"),
      ),
    ).toThrow(/must live outside repository/u);
  });

  it("loads only version-1 evidence with an issues array", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mo-gazette-orchestration-"));
    dirs.push(dir);
    const evidencePath = path.join(dir, "evidence.json");
    await writeFile(evidencePath, JSON.stringify({ version: 1, issues: [completed73()] }), "utf8");

    await expect(loadCnipaGazetteOrchestrationEvidenceFile(evidencePath)).resolves.toEqual([
      completed73(),
    ]);

    await writeFile(
      evidencePath,
      JSON.stringify({ version: 1, issues: [], surprise: true }),
      "utf8",
    );
    await expect(loadCnipaGazetteOrchestrationEvidenceFile(evidencePath)).rejects.toThrow(
      /unsupported keys/u,
    );
  });

  it("writes deterministic progress and one PREPARE_ONLY next browser plan", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mo-gazette-orchestration-"));
    dirs.push(dir);
    const output = path.join(dir, "prepared");

    const result = await prepareCnipaGazetteOrchestrationNext({
      plan: plan(),
      evidence: [completed73()],
      outputDirectory: output,
    });

    expect(result.progress.nextIssue).toBe(74);
    expect(result.next).toMatchObject({
      announcementIssue: 74,
      status: "PENDING",
      nextAction: "START_CAPTURE",
    });
    expect(result.next?.browserPlan).toMatchObject({
      announcementIssue: 74,
      dispatchMode: "PREPARE_ONLY",
      historicalReplayActivated: false,
    });
    expect(result.browserPlanSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.expectedBrowserAuthorityToken).toContain(
      "CNIPA-GAZETTE-BROWSER historical-73-75-r1-issue-74-start PREPARE_ONLY",
    );

    const progress = JSON.parse(await readFile(result.progressPath, "utf8")) as Record<
      string,
      unknown
    >;
    const nextAction = JSON.parse(await readFile(result.nextPath, "utf8")) as Record<
      string,
      unknown
    >;
    const browserPlan = JSON.parse(await readFile(result.browserPlanPath!, "utf8")) as Record<
      string,
      unknown
    >;

    expect(progress).toMatchObject({ nextIssue: 74, completed: false });
    expect(nextAction).toMatchObject({
      announcementIssue: 74,
      nextAction: "START_CAPTURE",
      browserPlanSha256: result.browserPlanSha256,
    });
    expect(browserPlan).toMatchObject({
      announcementIssue: 74,
      dispatchMode: "PREPARE_ONLY",
      dataEngineMutation: "DISABLED",
      historicalReplayActivated: false,
    });
  });
});

describe("CNIPA Gazette orchestration evidence and batch CLI helpers", () => {
  it("parses record/build actions and rejects mixed actions", () => {
    expect(
      parseCnipaGazetteOrchestrationArguments([
        "--plan",
        "D:\\proof\\plan.json",
        "--record-evidence",
        "--issue-evidence",
        "D:\\proof\\issue.json",
        "--output-evidence",
        "D:\\proof\\evidence-next.json",
        "--expected-sha",
        "a".repeat(64),
        "--authority-token",
        "GO fixture",
      ]),
    ).toMatchObject({
      recordEvidence: true,
      prepareNext: false,
      buildNextBatch: false,
    });

    expect(
      parseCnipaGazetteOrchestrationArguments([
        "--plan",
        "D:\\proof\\plan.json",
        "--build-next-batch",
        "--evidence",
        "D:\\proof\\evidence.json",
        "--output-dir",
        "D:\\proof\\next",
        "--batch-size",
        "3",
        "--historical-upper-bound",
        "100",
        "--expected-sha",
        "a".repeat(64),
        "--authority-token",
        "GO fixture",
      ]),
    ).toMatchObject({
      buildNextBatch: true,
      batchSize: 3,
      historicalUpperBound: 100,
    });

    expect(() =>
      parseCnipaGazetteOrchestrationArguments([
        "--plan",
        "D:\\proof\\plan.json",
        "--prepare-next",
        "--record-evidence",
      ]),
    ).toThrow(/mutually exclusive/u);
  });

  it("records one issue update into a repo-external versioned evidence file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mo-gazette-orchestration-"));
    dirs.push(dir);
    const issuePath = path.join(dir, "issue-73.json");
    const outputPath = path.join(dir, "evidence.json");
    await writeFile(issuePath, JSON.stringify(completed73()), "utf8");

    const update = await loadCnipaGazetteOrchestrationIssueEvidenceFile(issuePath);
    const result = await recordCnipaGazetteOrchestrationEvidence({
      plan: plan(),
      update,
      outputPath,
    });

    expect(result.progress.counts).toEqual({
      total: 3,
      completed: 1,
      resume: 0,
      pending: 2,
    });
    expect(result.progress.nextIssue).toBe(74);
    await expect(loadCnipaGazetteOrchestrationEvidenceFile(outputPath)).resolves.toEqual([
      completed73(),
    ]);

    const stored = JSON.parse(await readFile(outputPath, "utf8")) as Record<string, unknown>;
    expect(stored).toEqual({
      version: 1,
      issues: [completed73()],
    });
  });

  it("writes a child historical batch proposal with parent SHA and a new exact GO", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mo-gazette-orchestration-"));
    dirs.push(dir);
    const output = path.join(dir, "next-batch");
    const frozen = plan();
    const parentSha = cnipaGazetteOrchestrationPlanSha256(frozen);

    const result = await prepareCnipaGazetteOrchestrationNextBatch({
      plan: frozen,
      evidence: [completedIssue(73), completedIssue(74), completedIssue(75)],
      batchSize: 2,
      historicalUpperBound: 80,
      outputDirectory: output,
    });

    expect(result.parentPlanSha256).toBe(parentSha);
    expect(result.nextPlan).toMatchObject({
      issueSelection: {
        mode: "RANGE",
        startIssue: 76,
        endIssue: 77,
      },
      parentPlanSha256: parentSha,
    });
    expect(result.nextPlanSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.expectedAuthorityToken).toContain("CNIPA-GAZETTE-ORCHESTRATION");
    expect(result.nextPlanPath).not.toBeNull();

    const proposal = JSON.parse(await readFile(result.proposalPath, "utf8")) as Record<
      string,
      unknown
    >;
    const nextPlan = JSON.parse(await readFile(result.nextPlanPath!, "utf8")) as Record<
      string,
      unknown
    >;

    expect(proposal).toMatchObject({
      parentPlanSha256: parentSha,
      nextPlanSha256: result.nextPlanSha256,
      expectedAuthorityToken: result.expectedAuthorityToken,
    });
    expect(nextPlan).toMatchObject({
      parentPlanSha256: parentSha,
      historicalReplayActivated: true,
      issueSelection: {
        startIssue: 76,
        endIssue: 77,
      },
    });
  });
});
