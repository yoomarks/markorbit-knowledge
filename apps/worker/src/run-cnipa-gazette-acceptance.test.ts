import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CNIPA_GAZETTE_ACCEPTANCE_AUTHORITY_MODE,
  cnipaGazetteAcceptancePlanSha256,
  expectedCnipaGazetteAcceptanceAuthorityToken,
  parseCnipaGazetteAcceptancePlan,
} from "@markorbit/worker-runtime";
import {
  assertCnipaGazetteAcceptanceAuthority,
  assertCnipaGazetteAcceptancePathOutsideWorkingTree,
  loadCnipaGazetteAcceptancePlanFile,
  parseCnipaGazetteAcceptanceArguments,
} from "./run-cnipa-gazette-acceptance";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map((entry) => rm(entry, { recursive: true, force: true })),
  );
});

function plan() {
  return parseCnipaGazetteAcceptancePlan({
    version: 2,
    operationId: "issue-75-capture-full-chain-r2",
    workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    authorityMode: CNIPA_GAZETTE_ACCEPTANCE_AUTHORITY_MODE,
    executionMode: "APPLY_DISPATCH_ONCE",
    workerMode: "PROVISION_ONE_SHOT",
    stage: "FULL_CHAIN",
    announcementIssue: 75,
    announcementDate: "1983-08-15",
    sourceRecordCount: 576,
    sourcePageCount: 6,
    pageSize: 100,
    finalPageRowCount: 76,
    range: { startPage: 1, endPage: 6 },
    announcementTypeSelection: "ALL",
    anncType: "",
    acquisitionMode: "MO_CNIPA_NETWORK_CAPTURE_IMPORT",
    captureToolVersion: "0.9.4",
    captureFilePath: "D:\\captures\\MO_CNIPA_GAZETTE_75_SMALL_COMPLETE.json",
    captureFileSha256: "b".repeat(64),
    dataEngineUrl: "http://127.0.0.1:8080",
  });
}

describe("CNIPA Gazette bounded acceptance runner governance", () => {
  it("requires complete apply authority arguments", () => {
    expect(() => parseCnipaGazetteAcceptanceArguments(["--plan", "x", "--apply"])).toThrow(
      /requires --expected-sha, --authority-token, and --output/,
    );
    expect(parseCnipaGazetteAcceptanceArguments(["--plan", "x"])).toMatchObject({ apply: false });
  });
  it("binds apply to the exact frozen plan SHA and GO token", () => {
    const frozen = plan();
    const sha = cnipaGazetteAcceptancePlanSha256(frozen);
    const token = expectedCnipaGazetteAcceptanceAuthorityToken(frozen, sha);
    expect(
      assertCnipaGazetteAcceptanceAuthority({
        plan: frozen,
        planSha256: sha,
        expectedSha: sha,
        authorityToken: token,
      }),
    ).toMatch(/^[a-f0-9]{64}$/u);
    expect(() =>
      assertCnipaGazetteAcceptanceAuthority({
        plan: frozen,
        planSha256: sha,
        expectedSha: "0".repeat(64),
        authorityToken: token,
      }),
    ).toThrow(/expected SHA/);
    expect(() =>
      assertCnipaGazetteAcceptanceAuthority({
        plan: frozen,
        planSha256: sha,
        expectedSha: sha,
        authorityToken: token + "-wrong",
      }),
    ).toThrow(/GO token/);
  });

  it("loads frozen plans only from outside the repository working tree", async () => {
    const root = path.join(tmpdir(), "markorbit-gazette-acceptance-test-" + Date.now());
    temporary.push(root);
    await mkdir(root, { recursive: true });
    const planPath = path.join(root, "plan.json");
    await writeFile(planPath, JSON.stringify(plan()), "utf8");
    const loaded = await loadCnipaGazetteAcceptancePlanFile(planPath, process.cwd());
    expect(loaded.planSha256).toBe(cnipaGazetteAcceptancePlanSha256(plan()));
    expect(() =>
      assertCnipaGazetteAcceptancePathOutsideWorkingTree(
        path.join(process.cwd(), "inside-plan.json"),
        process.cwd(),
      ),
    ).toThrow(/outside the repository/);
  });
});
