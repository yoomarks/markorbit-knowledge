import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { SqliteSourceCompatibilityObservationRepository } from "@markorbit/persistence/source-compatibility-observations";
import { buildFoundationalRemediationQueueSnapshot } from "../foundational-remediation-queue";

const databases: DatabaseSync[] = [];

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  return db;
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe("foundational remediation queue snapshot", () => {
  it("exposes the US foundational queue without authorizing or performing mutation", () => {
    const snapshot = buildFoundationalRemediationQueueSnapshot(
      database(),
      { workspaceId: DEFAULT_WORKSPACE.id, jurisdiction: "us" },
      () => new Date("2026-08-10T00:00:00.000Z"),
    );

    expect(snapshot.objectType).toBe("FOUNDATIONAL_REMEDIATION_QUEUE_SNAPSHOT");
    expect(snapshot.jurisdiction).toBe("US");
    expect(snapshot.readiness.totalCount).toBe(11);
    expect(snapshot.remediationQueue.totalTargetCount).toBe(11);
    expect(snapshot.remediationQueue.actionableTargetCount).toBe(11);
    expect(snapshot.remediationQueue.items.every((item) => item.stage === "REGISTER")).toBe(true);
    expect(
      snapshot.remediationQueue.items.every(
        (item) =>
          item.actions.length === 1 &&
          item.actions[0].code === "REGISTER_SOURCE" &&
          item.actions[0].automaticExecution === false,
      ),
    ).toBe(true);
    expect(snapshot.executionPolicy).toBe("READ_ONLY");
    expect(snapshot.collectionAuthorization).toBe("NONE");
    expect(snapshot.mutationPerformed).toBe(false);
    expect(snapshot.observedAt).toBe("2026-08-10T00:00:00.000Z");
  });

  it("supports WIPO and a single explicit foundational target filter", () => {
    const snapshot = buildFoundationalRemediationQueueSnapshot(database(), {
      workspaceId: DEFAULT_WORKSPACE.id,
      jurisdiction: "wo",
      targetId: "wo-wipo-madrid-system",
      topK: 5,
    });

    expect(snapshot.jurisdiction).toBe("WO");
    expect(snapshot.targetId).toBe("wo-wipo-madrid-system");
    expect(snapshot.topK).toBe(5);
    expect(snapshot.readiness.totalCount).toBe(1);
    expect(snapshot.remediationQueue.items.map((item) => item.targetId)).toEqual([
      "wo-wipo-madrid-system",
    ]);
  });

  it("carries compatibility freshness into foundational readiness without bypassing earlier gates", () => {
    const db = database();
    new SqliteSourceCompatibilityObservationRepository(db).record({
      targetId: "cn-cnipa-trademark-search",
      jurisdiction: "CN",
      state: "BLOCKED",
      observedAt: "2026-08-15T00:00:00.000Z",
      primaryUri: "https://wcjs.sbj.cnipa.gov.cn/txnT01.do",
      renderJavascript: true,
      errorCode: "CANARY_AUTHORITY_BASELINE_FAILED",
      baselineTargetId: "cn-cnipa-trademark-filing-guide",
      baselineState: "FAIL",
    });

    const snapshot = buildFoundationalRemediationQueueSnapshot(
      db,
      {
        workspaceId: DEFAULT_WORKSPACE.id,
        jurisdiction: "CN",
        targetId: "cn-cnipa-trademark-search",
      },
      () => new Date("2026-08-18T00:00:00.000Z"),
    );

    expect(snapshot.readiness.protocolVersion).toBe("1.3");
    expect(snapshot.readiness.targets[0]).toMatchObject({
      targetId: "cn-cnipa-trademark-search",
      stage: "REGISTER",
      compatibilityState: "BLOCKED",
      compatibilityFreshness: "STALE",
      compatibilityObservedAt: "2026-08-15T00:00:00.000Z",
    });
    expect(snapshot.remediationQueue.items[0]?.actions[0]?.code).toBe("REGISTER_SOURCE");
  });

  it("rejects unsupported target coverage and invalid topK", () => {
    expect(() =>
      buildFoundationalRemediationQueueSnapshot(database(), {
        workspaceId: DEFAULT_WORKSPACE.id,
        jurisdiction: "US",
        targetId: "missing-target",
      }),
    ).toThrow(/No ACTIVE FOUNDATIONAL/);

    expect(() =>
      buildFoundationalRemediationQueueSnapshot(database(), {
        workspaceId: DEFAULT_WORKSPACE.id,
        jurisdiction: "US",
        topK: 21,
      }),
    ).toThrow(/topK/);
  });
});
