import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CnipaAuthenticatedSessionExecutorFactory } from "@markorbit/worker-runtime/cnipa-artifact-acquirer";
import {
  assertPathOutsideWorkingTree,
  parseCnipaLiveAcceptancePlan,
  runCnipaLiveAcceptancePlan,
} from "./cnipa-live-acceptance";
import { parseCnipaLiveAcceptanceArguments } from "./run-cnipa-live-acceptance";

function plan() {
  return parseCnipaLiveAcceptancePlan({
    version: 1,
    probes: [
      {
        id: "registration-page-1",
        documentKind: "REGISTRATION_EXAMINATION",
        surface: "LIST",
        method: "POST",
        path: "/pubnotice/portal/tmscJudgment/queryPageList",
        jsonBody: { pageIndex: 1, pageSize: 10, regNo: "synthetic-registration-number" },
      },
    ],
  });
}

describe("CNIPA live acceptance harness", () => {
  it("accepts only the frozen endpoint/method surface and rejects credential-like fields", () => {
    expect(plan().probes).toHaveLength(1);
    expect(() =>
      parseCnipaLiveAcceptancePlan({
        version: 1,
        probes: [
          {
            id: "wrong-path",
            documentKind: "REGISTRATION_EXAMINATION",
            surface: "LIST",
            method: "POST",
            path: "/not-cnipa",
            jsonBody: { pageIndex: 1 },
          },
        ],
      }),
    ).toThrow(/frozen candidate/i);
    expect(() =>
      parseCnipaLiveAcceptancePlan({
        version: 1,
        probes: [
          {
            id: "credential-field",
            documentKind: "REGISTRATION_EXAMINATION",
            surface: "LIST",
            method: "POST",
            path: "/pubnotice/portal/tmscJudgment/queryPageList",
            jsonBody: { authorizationToken: "must-not-be-accepted" },
          },
        ],
      }),
    ).toThrow(/credential-like/i);
    expect(() =>
      parseCnipaLiveAcceptancePlan({
        version: 1,
        probes: [
          {
            id: "cookie-field",
            documentKind: "REGISTRATION_EXAMINATION",
            surface: "LIST",
            method: "POST",
            path: "/pubnotice/portal/tmscJudgment/queryPageList",
            jsonBody: { cookieHeader: "must-not-be-accepted" },
          },
        ],
      }),
    ).toThrow(/credential-like/i);
  });

  it("requires an explicit live switch before output is required", () => {
    expect(parseCnipaLiveAcceptanceArguments(["--plan", "/tmp/cnipa-plan.json"])).toMatchObject({
      executeLive: false,
    });
    expect(() =>
      parseCnipaLiveAcceptanceArguments(["--plan", "/tmp/cnipa-plan.json", "--execute-live-cnipa"]),
    ).toThrow(/--output is required/i);
  });

  it("writes exact sanitized response bytes and a request-digest-only manifest", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cnipa-live-acceptance-"));
    const workingDirectory = path.join(root, "repo");
    const outputDirectory = path.join(root, "evidence");
    await mkdir(workingDirectory);
    let closed = 0;
    const responseBytes = new TextEncoder().encode('{"data":{"records":[]}}');
    const factory: CnipaAuthenticatedSessionExecutorFactory = {
      async create() {
        return {
          async execute(request) {
            return {
              status: 200,
              sourceUri: `https://cnipa.example${request.path}`,
              contentType: "application/json;charset=UTF-8",
              observedAt: "2026-08-29T00:00:00.000Z",
              body: responseBytes,
              securityState: "OK",
            };
          },
          async close() {
            closed += 1;
          },
        };
      },
    };
    try {
      const result = await runCnipaLiveAcceptancePlan({
        plan: plan(),
        outputDirectory,
        workingDirectory,
        sessionFactory: factory,
        now: () => new Date("2026-08-29T00:00:01.000Z"),
      });
      expect(result.manifest).toMatchObject({
        probeCount: 1,
        successfulProbeCount: 1,
        failedProbeCount: 0,
      });
      expect(result.manifest.entries[0]?.queryKeys).toEqual([]);
      expect(result.manifest.entries[0]?.jsonBodyKeys).toEqual(["pageIndex", "pageSize", "regNo"]);
      const evidence = await readFile(path.join(outputDirectory, "01-registration-page-1.json"));
      expect(new Uint8Array(evidence)).toEqual(responseBytes);
      const manifestText = await readFile(result.manifestPath, "utf8");
      expect(manifestText).not.toContain("synthetic-registration-number");
      expect(manifestText).toContain('"requestSha256"');
      expect(closed).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects plan/evidence locations inside the repository working tree", () => {
    const working = path.resolve("/tmp/example-repo");
    expect(() => assertPathOutsideWorkingTree(path.join(working, "plan.json"), working)).toThrow(
      /outside the repository/i,
    );
  });
});
