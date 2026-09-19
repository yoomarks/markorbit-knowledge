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
  loadCnipaGazetteAcceptanceCaptureFile,
  loadCnipaGazetteAcceptancePlanFile,
  parseCnipaGazetteAcceptanceArguments,
} from "./run-cnipa-gazette-acceptance";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map((entry) => rm(entry, { recursive: true, force: true })),
  );
});

function captureFixture() {
  return {
    exportedSchema: "mo-cnipa-gazette-small-complete-v1",
    tool: "MO CNIPA Network Capture",
    version: "0.9.4",
    kind: "gazette_small_issue_complete",
    exportedAt: "2026-09-19T14:06:48.000Z",
    announcementIssue: "75",
    query: {
      anncIssue: "75",
      anncType: "",
      regNo: "",
      tmName: "",
      intlCls: "",
      registerCnName: "",
      coowner: "",
      agentName: "",
      tmType: "",
      tmDescType: "0",
      startDate: "",
      endDate: "",
      pageIndex: 1,
      pageSize: 100,
    },
    sourceUrl:
      "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
    sourceTotal: 576,
    sourcePages: 6,
    pageSize: 100,
    collectedCount: 576,
    uniqueOfficialRowIds: 576,
    expectedLastPageLength: 76,
    observedLastPageLength: 76,
    completeness: "COMPLETE",
    records: Array.from({ length: 576 }, (_, index) => {
      const id = index.toString(16).toUpperCase().padStart(32, "0");
      return {
        id,
        searchId: id,
        anncIssue: "75",
        anncDate: "1983-08-15",
        anncType: "TMZCSQ",
        anncTypeName: "商标初步审定公告",
        regNo: String(200000 + index),
      };
    }),
  };
}

function plan() {
  return parseCnipaGazetteAcceptancePlan({
    version: 1,
    operationId: "issue-75-full-chain-r1",
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
    acquisitionMode: "MO_CNIPA_NETWORK_CAPTURE_V094_IMPORT",
    captureTool: "MO CNIPA Network Capture",
    captureToolVersion: "0.9.4",
    captureExportSchema: "mo-cnipa-gazette-small-complete-v1",
    captureToolBundleSha256: "5b1e4a788c261b2662827f6789bba7f10fa56d0c5699bcd6bd9fa373fe0afa2a",
    dataEngineUrl: "http://127.0.0.1:8080",
  });
}

describe("CNIPA Gazette bounded acceptance runner governance", () => {
  it("requires complete apply authority arguments", () => {
    expect(() => parseCnipaGazetteAcceptanceArguments(["--plan", "x", "--apply"])).toThrow(
      /requires --capture, --expected-sha, --authority-token, and --output/,
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

  it("validates a v0.9.4 issue-75 capture without mutation before GO", async () => {
    const root = path.join(tmpdir(), "markorbit-gazette-capture-test-" + Date.now());
    temporary.push(root);
    await mkdir(root, { recursive: true });
    const capturePath = path.join(root, "MO_CNIPA_GAZETTE_75_SMALL_COMPLETE.json");
    await writeFile(capturePath, JSON.stringify(captureFixture()), "utf8");
    const loaded = await loadCnipaGazetteAcceptanceCaptureFile(capturePath, plan(), process.cwd());
    expect(loaded.capture).toMatchObject({
      version: "0.9.4",
      announcementIssue: "75",
      announcementDate: "1983-08-15",
      sourceTotal: 576,
      sourcePages: 6,
      observedLastPageLength: 76,
    });
    expect(loaded.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(loaded.sizeBytes).toBeGreaterThan(0);
  });
});
