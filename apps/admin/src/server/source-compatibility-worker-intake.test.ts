import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SqliteSourceCompatibilityObservationRepository } from "@markorbit/persistence/source-compatibility-observations";
import { recordSourceCompatibilityWorkerIntake } from "./source-compatibility-worker-intake";

const summary = {
  version: "REPRESENTATIVE_SOURCE_LIVE_CANARY_RESULT_V2",
  observedAt: "2026-08-18T00:00:00.000Z",
  observations: [
    {
      jurisdiction: "CN",
      profile: "DYNAMIC_PORTAL",
      targetId: "cn-cnipa-trademark-search",
      family: "SEARCH",
      requestedUri: "https://wcjs.sbj.cnipa.gov.cn/txnT01.do",
      renderJavascript: true,
      state: "DEGRADED",
      elapsedMs: 75000,
      pagesAttempted: 0,
      artifactCount: 0,
      artifactKinds: [],
      finalUris: [],
      totalBytes: 0,
      errorCode: "CANARY_ADAPTER_REQUIRED",
      errorMessage: "primary interaction timed out",
      authorityBaseline: {
        targetId: "cn-cnipa-trademark-filing-guide",
        family: "FILING",
        requestedUri: "https://www.cnipa.gov.cn/art/2020/12/21/art_2488_155734.html",
        renderJavascript: false,
        state: "PASS",
        elapsedMs: 2100,
        pagesAttempted: 1,
        artifactCount: 2,
        artifactKinds: ["HTML", "MARKDOWN"],
        finalUris: ["https://www.cnipa.gov.cn/art/2020/12/21/art_2488_155734.html"],
        totalBytes: 10000,
      },
    },
  ],
};

describe("authenticated source compatibility worker intake", () => {
  it("authenticates before initializing any compatibility write registry", () => {
    const database = new DatabaseSync(":memory:");
    const workers = {
      verifyCredential() {
        throw new Error("authentication rejected");
      },
    };

    expect(() =>
      recordSourceCompatibilityWorkerIntake(
        { workerId: "worker-1", credential: "wrong", summary },
        { database, workers },
      ),
    ).toThrow("authentication rejected");

    const table = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'source_compatibility_observations'",
      )
      .get();
    expect(table).toBeUndefined();
  });

  it("records governed observations with authenticated worker provenance", () => {
    const database = new DatabaseSync(":memory:");
    const workers = {
      verifyCredential(workerId: string, credential: string) {
        expect(workerId).toBe("worker-1");
        expect(credential).toBe("credential-1");
        return {} as never;
      },
    };

    const result = recordSourceCompatibilityWorkerIntake(
      { workerId: "worker-1", credential: "credential-1", summary },
      { database, workers },
    );
    expect(result).toMatchObject({
      version: "SOURCE_COMPATIBILITY_WORKER_INTAKE_V1",
      recorded: 1,
      states: { PASS: 0, DEGRADED: 1, BLOCKED: 0 },
    });

    const recorded = new SqliteSourceCompatibilityObservationRepository(database)
      .latest(["cn-cnipa-trademark-search"])
      .get("cn-cnipa-trademark-search");
    expect(recorded).toMatchObject({
      state: "DEGRADED",
      details: {
        recordedByWorkerId: "worker-1",
        intake: "SOURCE_COMPATIBILITY_WORKER_INTAKE_V1",
      },
    });
  });
});
