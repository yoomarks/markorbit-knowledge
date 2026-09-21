import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cnipaGazetteBrowserAuthorityPlan,
  cnipaGazetteBrowserAuthorityPlanSha256,
  expectedCnipaGazetteBrowserAuthorityToken,
} from "@markorbit/worker-runtime";
import {
  assertCnipaGazetteAdmissionPlanPathOutsideWorkingTree,
  parseCnipaGazetteAdmissionPlanPreparationArguments,
  prepareCnipaGazetteAdmissionPlan,
} from "./prepare-cnipa-gazette-browser-admission-plan";

const roots: string[] = [];

async function tempRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "mo-gazette-admission-plan-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function browserPlan() {
  return cnipaGazetteBrowserAuthorityPlan({
    operationId: "issue-429-browser-r1",
    workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    dispatchMode: "PREPARE_AND_DISPATCH_ONCE",
    announcementIssue: 429,
    targetLogicalPagesPerCheckpoint: 24,
    maxRuntimeSeconds: 21600,
    captureToolVersion: "1.0.3",
    captureToolBundleName: "MO_CNIPA_Network_Capture_v1.0.3_Gazette_Resume_RC5.zip",
    captureToolBundleSha256: "2".repeat(64),
  });
}

describe("prepare CNIPA Gazette browser admission plan", () => {
  it("parses required governed arguments", () => {
    expect(
      parseCnipaGazetteAdmissionPlanPreparationArguments([
        "--browser-plan",
        "/tmp/browser.json",
        "--run-id",
        "run_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        "--output",
        "/tmp/admission.json",
        "--authority-issue",
        "885",
        "--operation-id",
        "issue-429-browser-admission-r1",
        "--data-engine-url",
        "http://127.0.0.1:8081",
        "--expected-sha",
        "a".repeat(64),
        "--authority-token",
        "GO token",
      ]),
    ).toMatchObject({
      authorityIssueNumber: 885,
      operationId: "issue-429-browser-admission-r1",
      runId: "run_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    });
  });

  it("rejects output paths inside the working tree", () => {
    const cwd = path.resolve("/repo");
    expect(() =>
      assertCnipaGazetteAdmissionPlanPathOutsideWorkingTree(
        path.resolve(cwd, "governed.json"),
        cwd,
      ),
    ).toThrow(/outside the repository/);
  });

  it("uses exact browser SHA/GO and writes only the returned frozen plan", async () => {
    const root = await tempRoot();
    const frozen = browserPlan();
    const browserPlanPath = path.join(root, "browser.json");
    const outputPath = path.join(root, "admission.json");
    await writeFile(browserPlanPath, JSON.stringify(frozen), "utf8");
    const sha = cnipaGazetteBrowserAuthorityPlanSha256(frozen);
    const token = expectedCnipaGazetteBrowserAuthorityToken(frozen, sha);
    let observedBody: Record<string, unknown> | null = null;

    const result = await prepareCnipaGazetteAdmissionPlan({
      browserPlanPath,
      runId: "run_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      outputPath,
      authorityIssueNumber: 885,
      operationId: "issue-429-browser-admission-r1",
      dataEngineUrl: "http://127.0.0.1:8081",
      expectedSha: sha,
      authorityToken: token,
      controlPlaneUrl: "http://127.0.0.1:3015",
      internalSecret: "internal-secret",
      fetcher: async (_url, init) => {
        observedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            plan: {
              version: 1,
              operationId: "issue-429-browser-admission-r1",
            },
            planSha256: "b".repeat(64),
            expectedAuthorityToken: "GO #885 downstream",
            sourceBrowserRunId: "run_01ARZ3NDEKTSV4RRFFQ69G5FAV",
            historicalReplayActivated: false,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    expect(observedBody).toMatchObject({
      workspaceId: frozen.workspaceId,
      operation: "BUILD_ADMISSION_PLAN",
      payload: {
        runId: "run_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        authorityIssueNumber: 885,
        operationId: "issue-429-browser-admission-r1",
      },
    });
    expect(result.planSha256).toBe("b".repeat(64));
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual({
      version: 1,
      operationId: "issue-429-browser-admission-r1",
    });
  });

  it("fails before control-plane access when browser SHA or GO does not match", async () => {
    const root = await tempRoot();
    const frozen = browserPlan();
    const browserPlanPath = path.join(root, "browser.json");
    await writeFile(browserPlanPath, JSON.stringify(frozen), "utf8");
    const sha = cnipaGazetteBrowserAuthorityPlanSha256(frozen);

    await expect(
      prepareCnipaGazetteAdmissionPlan({
        browserPlanPath,
        runId: "run_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        outputPath: path.join(root, "a.json"),
        authorityIssueNumber: 885,
        operationId: "issue-429-browser-admission-r1",
        dataEngineUrl: "http://127.0.0.1:8081",
        expectedSha: "f".repeat(64),
        authorityToken: "wrong",
        controlPlaneUrl: "http://127.0.0.1:3015",
        internalSecret: "internal-secret",
      }),
    ).rejects.toThrow(/expected SHA/);

    await expect(
      prepareCnipaGazetteAdmissionPlan({
        browserPlanPath,
        runId: "run_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        outputPath: path.join(root, "b.json"),
        authorityIssueNumber: 885,
        operationId: "issue-429-browser-admission-r1",
        dataEngineUrl: "http://127.0.0.1:8081",
        expectedSha: sha,
        authorityToken: "wrong",
        controlPlaneUrl: "http://127.0.0.1:3015",
        internalSecret: "internal-secret",
      }),
    ).rejects.toThrow(/GO token/);
  });
});
