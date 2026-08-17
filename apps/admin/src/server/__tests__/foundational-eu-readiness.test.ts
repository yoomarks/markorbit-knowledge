import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
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

describe("EU foundational Advanced readiness", () => {
  it("loads ACTIVE FOUNDATIONAL EU coverage through the generic read-only snapshot", () => {
    const snapshot = buildFoundationalRemediationQueueSnapshot(
      database(),
      { workspaceId: DEFAULT_WORKSPACE.id, jurisdiction: "EU", topK: 5 },
      () => new Date("2026-08-18T00:00:00.000Z"),
    );

    expect(snapshot.jurisdiction).toBe("EU");
    expect(snapshot.executionPolicy).toBe("READ_ONLY");
    expect(snapshot.collectionAuthorization).toBe("NONE");
    expect(snapshot.mutationPerformed).toBe(false);
    expect(snapshot.readiness.totalCount).toBeGreaterThan(0);
    expect(snapshot.readiness.targets.every((target) => target.targetId.startsWith("eu-"))).toBe(
      true,
    );
  });
});
