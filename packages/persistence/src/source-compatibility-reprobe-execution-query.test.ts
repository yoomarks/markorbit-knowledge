import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  SqliteFoundationalActionIntentRepository,
  foundationalActionIntentId,
  type FoundationalActionIntentRecord,
} from "./foundational-action-intent-ledger";
import { listSourceCompatibilityReprobeExecutions } from "./source-compatibility-reprobe-execution-query";
import { SqliteSourceCompatibilityReprobeExecutionRepository } from "./source-compatibility-reprobe-execution";

const databases: DatabaseSync[] = [];

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  return db;
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

function intent(targetId: string, idempotencyKey: string, now: string): FoundationalActionIntentRecord {
  return {
    protocolVersion: "1.0",
    objectType: "FOUNDATIONAL_ACTION_INTENT",
    intentId: foundationalActionIntentId("default", idempotencyKey),
    workspaceId: "default",
    jurisdiction: targetId.startsWith("wo-") ? "WO" : "US",
    targetId,
    readinessStage: "HEALTH",
    actionCode: "REPROBE_SOURCE_COMPATIBILITY",
    operatorInstruction: "Run governed compatibility re-probe.",
    executionPath: "MANUAL_OPERATOR",
    collectionAuthorizationRequired: false,
    automaticExecution: false,
    executionAuthorization: "NONE",
    requestedByActorId: "operator.requester",
    approvalRequired: true,
    approvedByActorId: null,
    canceledByActorId: null,
    status: "PENDING_APPROVAL",
    idempotencyKey,
    readinessProtocolVersion: "1.3",
    queueProtocolVersion: "1.1",
    sourceSnapshotObservedAt: now,
    createdAt: now,
    updatedAt: now,
    replayed: false,
  };
}

describe("source compatibility re-probe execution query", () => {
  it("lists newest receipts first and supports jurisdiction, target and status filters", () => {
    const db = database();
    let now = new Date("2026-08-18T00:00:00.000Z");
    const clock = () => now;
    const intents = new SqliteFoundationalActionIntentRepository(db, clock);
    const executions = new SqliteSourceCompatibilityReprobeExecutionRepository(db, clock);

    const usIntent = intents.create(intent("us-uspto-trademarks-root", "intent-us", now.toISOString()));
    intents.approve(usIntent.intentId, "operator.approver");
    const usExecution = executions.start({
      intentId: usIntent.intentId,
      workerId: "worker.us",
      executedByActorId: "operator.executor",
      idempotencyKey: "exec-us",
    });

    now = new Date("2026-08-18T01:00:00.000Z");
    const woIntent = intents.create(intent("wo-wipo-madrid-system", "intent-wo", now.toISOString()));
    intents.approve(woIntent.intentId, "operator.approver");
    const woExecution = executions.start({
      intentId: woIntent.intentId,
      workerId: "worker.wo",
      executedByActorId: "operator.executor",
      idempotencyKey: "exec-wo",
    });
    now = new Date("2026-08-18T01:05:00.000Z");
    executions.fail({
      executionId: woExecution.executionId,
      workerId: "worker.wo",
      errorCode: "RUNNER_FAILED",
      errorMessage: "browser failed",
    });

    expect(
      listSourceCompatibilityReprobeExecutions(db, { workspaceId: "default" }).map(
        (item) => item.executionId,
      ),
    ).toEqual([woExecution.executionId, usExecution.executionId]);

    expect(
      listSourceCompatibilityReprobeExecutions(db, {
        workspaceId: "default",
        jurisdiction: "wo",
      }).map((item) => item.targetId),
    ).toEqual(["wo-wipo-madrid-system"]);

    expect(
      listSourceCompatibilityReprobeExecutions(db, {
        workspaceId: "default",
        targetId: "us-uspto-trademarks-root",
      }).map((item) => item.status),
    ).toEqual(["STARTED"]);

    expect(
      listSourceCompatibilityReprobeExecutions(db, {
        workspaceId: "default",
        status: "FAILED",
      }).map((item) => item.executionId),
    ).toEqual([woExecution.executionId]);
  });

  it("rejects invalid list bounds", () => {
    const db = database();
    expect(() =>
      listSourceCompatibilityReprobeExecutions(db, { workspaceId: "", limit: 1 }),
    ).toThrow(/workspaceId/);
    expect(() =>
      listSourceCompatibilityReprobeExecutions(db, { workspaceId: "default", limit: 101 }),
    ).toThrow(/limit/);
  });
});
