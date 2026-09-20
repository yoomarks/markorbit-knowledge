import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cnipaGazetteBrowserAuthorityPlan,
  cnipaGazetteBrowserAuthorityPlanSha256,
  expectedCnipaGazetteBrowserAuthorityToken,
} from "@markorbit/worker-runtime";
import {
  applyCnipaGazetteBrowserJobPreparation,
  assertCnipaGazetteBrowserAuthority,
  loadCnipaGazetteBrowserAuthorityPlanFile,
  parseCnipaGazetteBrowserJobArguments,
} from "./prepare-cnipa-gazette-browser-job";

const WSP = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const RC_SHA = "f01e654ccfdf08ba1dfbcb33b5ec343767012c5409a847d617305f1e01e146d3";
const dirs: string[] = [];
const originalInternal = process.env.MO_INTERNAL_SERVICE_SECRET;

afterEach(async () => {
  process.env.MO_INTERNAL_SERVICE_SECRET = originalInternal;
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
function plan(dispatchMode: "PREPARE_ONLY" | "PREPARE_AND_DISPATCH_ONCE" = "PREPARE_ONLY") {
  return cnipaGazetteBrowserAuthorityPlan({
    operationId:
      dispatchMode === "PREPARE_ONLY"
        ? "issue-75-browser-rc1-prepare"
        : "issue-75-browser-rc1-live",
    workspaceId: WSP,
    dispatchMode,
    announcementIssue: 75,
    captureToolBundleName: "MO_CNIPA_Network_Capture_v1.0.0_Gazette_Stream_RC1.zip",
    captureToolBundleSha256: RC_SHA,
  });
}

describe("CNIPA Gazette browser Job governed preparation CLI", () => {
  it("parses plan validation vs explicit apply", () => {
    expect(
      parseCnipaGazetteBrowserJobArguments(["--", "--plan", "D:\\proof\\plan.json"]),
    ).toMatchObject({
      apply: false,
    });
    expect(
      parseCnipaGazetteBrowserJobArguments([
        "--plan",
        "D:\\proof\\plan.json",
        "--apply",
        "--expected-sha",
        "a".repeat(64),
        "--authority-token",
        "GO fixture",
      ]),
    ).toMatchObject({ apply: true, expectedSha: "a".repeat(64), authorityToken: "GO fixture" });
  });
  it("loads a repo-external plan and verifies exact SHA/token", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mo-gazette-browser-"));
    dirs.push(dir);
    const file = path.join(dir, "plan.json");
    const frozen = plan();
    await writeFile(file, JSON.stringify(frozen), "utf8");
    const loaded = await loadCnipaGazetteBrowserAuthorityPlanFile(file);
    const sha = cnipaGazetteBrowserAuthorityPlanSha256(frozen);
    expect(loaded.planSha256).toBe(sha);
    const token = expectedCnipaGazetteBrowserAuthorityToken(frozen, sha);
    expect(
      assertCnipaGazetteBrowserAuthority({
        plan: frozen,
        planSha256: sha,
        expectedSha: sha,
        authorityToken: token,
      }),
    ).toMatch(/^[a-f0-9]{64}$/u);
    expect(() =>
      assertCnipaGazetteBrowserAuthority({
        plan: frozen,
        planSha256: sha,
        expectedSha: "0".repeat(64),
        authorityToken: token,
      }),
    ).toThrow(/expected SHA/);
  });

  it("requires complete apply authority arguments", () => {
    expect(() =>
      parseCnipaGazetteBrowserJobArguments(["--plan", "D:\\proof\\plan.json", "--apply"]),
    ).toThrow(/requires --expected-sha and --authority-token/);
  });
  it("calls only the internal governed endpoint for PREPARE_ONLY", async () => {
    const internal = "i".repeat(40);
    process.env.MO_INTERNAL_SERVICE_SECRET = internal;
    const frozen = plan();
    const sha = cnipaGazetteBrowserAuthorityPlanSha256(frozen);
    const token = expectedCnipaGazetteBrowserAuthorityToken(frozen, sha);
    const fetcher: typeof fetch = async (input, init = {}) => {
      expect(String(input)).toBe(
        "https://knowledge.example.test/api/internal/cnipa-gazette/browser-stream",
      );
      const headers = new Headers(init.headers);
      expect(headers.get("x-markorbit-internal-authorization")).toBe(internal);
      expect(headers.get("x-markorbit-cnipa-gazette-browser-authority")).toBe(token);
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        workspaceId: WSP,
        operation: "PREPARE_BROWSER_JOB",
        authority: { frozenPlan: frozen, planSha256: sha },
      });
      return new Response(
        JSON.stringify({
          sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
          collectionPlanId: "pln_01ARZ3NDEKTSV4RRFFQ69G5FAV",
          workerId: "wrk_01ARZ3NDEKTSV4RRFFQ69G5FAV",
          workerCredential: "fixture-worker-value",
          workerProvisioning: "CREATED",
          runId: null,
          jobId: null,
          replayed: false,
          dispatchPerformed: false,
          captureToolBundleSha256: RC_SHA,
          historicalReplayActivated: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    await expect(
      applyCnipaGazetteBrowserJobPreparation({
        baseUrl: "https://knowledge.example.test",
        plan: frozen,
        planSha256: sha,
        authorityToken: token,
        fetcher,
      }),
    ).resolves.toMatchObject({
      dispatchPerformed: false,
      runId: null,
      jobId: null,
      captureToolBundleSha256: RC_SHA,
    });
  });

  it("requires run/job identity for an authorized dispatch plan", async () => {
    process.env.MO_INTERNAL_SERVICE_SECRET = "i".repeat(40);
    const frozen = plan("PREPARE_AND_DISPATCH_ONCE");
    const sha = cnipaGazetteBrowserAuthorityPlanSha256(frozen);
    const token = expectedCnipaGazetteBrowserAuthorityToken(frozen, sha);
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
          collectionPlanId: "pln_01ARZ3NDEKTSV4RRFFQ69G5FAV",
          workerId: "wrk_01ARZ3NDEKTSV4RRFFQ69G5FAV",
          workerCredential: "fixture-worker-value",
          workerProvisioning: "ROTATED",
          runId: "run_01ARZ3NDEKTSV4RRFFQ69G5FAV",
          jobId: "job_01ARZ3NDEKTSV4RRFFQ69G5FAV",
          replayed: false,
          dispatchPerformed: true,
          captureToolBundleSha256: RC_SHA,
          historicalReplayActivated: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    await expect(
      applyCnipaGazetteBrowserJobPreparation({
        baseUrl: "https://knowledge.example.test",
        plan: frozen,
        planSha256: sha,
        authorityToken: token,
        fetcher,
      }),
    ).resolves.toMatchObject({
      dispatchPerformed: true,
      runId: "run_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      jobId: "job_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    });
  });
});
