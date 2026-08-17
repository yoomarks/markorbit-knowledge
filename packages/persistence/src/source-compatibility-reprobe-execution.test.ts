import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  SqliteFoundationalActionIntentRepository,
  foundationalActionIntentId,
  type FoundationalActionIntentRecord,
} from "./foundational-action-intent-ledger";
import { SqliteSourceCompatibilityObservationRepository } from "./source-compatibility-observations";
import {
  SqliteSourceCompatibilityReprobeExecutionRepository,
  sourceCompatibilityReprobeExecutionId,
} from "./source-compatibility-reprobe-execution";

const databases: DatabaseSync[] = [];

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  return db;
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

function pendingIntent(now: string): FoundationalActionIntentRecord {
  const workspaceId = "default";
  const idempotencyKey = "compatibility-reprobe-intent-cn-search";
  return {
    protocolVersion: "1.0",
    objectType: "FOUNDATIONAL_ACTION_INTENT",
    intentId: foundationalActionIntentId(workspaceId, idempotencyKey),
    workspaceId,
    jurisdiction: "CN",
    targetId: "cn-cnipa-trademark-search",
    readinessStage: "HEALTH",
    actionCode: "REPROBE_SOURCE_COMPATIBILITY",
    operatorInstruction: "Run the governed compatibility re-probe.",
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

describe("source compatibility re-probe execution ledger", () => {
  it("requires approval and binds one execution to one approved re-probe intent", () => {
    const db = database();
    const now = "2026-08-18T00:00:00.000Z";
    const intents = new SqliteFoundationalActionIntentRepository(db, () => new Date(now));
    const intent = intents.create(pendingIntent(now));
    const executions = new SqliteSourceCompatibilityReprobeExecutionRepository(
      db,
      () => new Date(now),
    );

    expect(() =>
      executions.start({
        intentId: intent.intentId,
        workerId: "worker.compatibility",
        executedByActorId: "operator.executor",
        idempotencyKey: "compatibility-reprobe-execution-cn-search",
      }),
    ).toThrow(/APPROVED/);

    intents.approve(intent.intentId, "operator.approver");
    const started = executions.start({
      intentId: intent.intentId,
      workerId: "worker.compatibility",
      executedByActorId: "operator.executor",
      idempotencyKey: "compatibility-reprobe-execution-cn-search",
    });
    expect(started).toMatchObject({
      executionId: sourceCompatibilityReprobeExecutionId(
        "default",
        "compatibility-reprobe-execution-cn-search",
      ),
      intentId: intent.intentId,
      status: "STARTED",
      workerId: "worker.compatibility",
      targetId: "cn-cnipa-trademark-search",
      replayed: false,
    });

    const replay = executions.start({
      intentId: intent.intentId,
      workerId: "worker.compatibility",
      executedByActorId: "operator.executor",
      idempotencyKey: "compatibility-reprobe-execution-cn-search",
    });
    expect(replay.replayed).toBe(true);
    expect(replay.executionId).toBe(started.executionId);
  });

  it("cannot complete without matching persisted worker-authored observation", () => {
    const db = database();
    let current = new Date("2026-08-18T00:00:00.000Z");
    const clock = () => current;
    const intents = new SqliteFoundationalActionIntentRepository(db, clock);
    const intent = intents.create(pendingIntent(current.toISOString()));
    intents.approve(intent.intentId, "operator.approver");
    const executions = new SqliteSourceCompatibilityReprobeExecutionRepository(db, clock);
    const started = executions.start({
      intentId: intent.intentId,
      workerId: "worker.compatibility",
      executedByActorId: "operator.executor",
      idempotencyKey: "compatibility-reprobe-execution-cn-search",
    });
    const observedAt = "2026-08-18T00:05:00.000Z";

    expect(() =>
      executions.complete({
        executionId: started.executionId,
        workerId: "worker.compatibility",
        observedAt,
        state: "PASS",
      }),
    ).toThrow(/matching persisted compatibility observation/);

    new SqliteSourceCompatibilityObservationRepository(db).record({
      targetId: intent.targetId,
      jurisdiction: intent.jurisdiction,
      state: "PASS",
      observedAt,
      primaryUri: "https://wcjs.sbj.cnipa.gov.cn/txnT01.do",
      renderJavascript: true,
      details: { recordedByWorkerId: "another.worker" },
    });
    expect(() =>
      executions.complete({
        executionId: started.executionId,
        workerId: "worker.compatibility",
        observedAt,
        state: "PASS",
      }),
    ).toThrow(/not recorded by the worker/);

    new SqliteSourceCompatibilityObservationRepository(db).record({
      targetId: intent.targetId,
      jurisdiction: intent.jurisdiction,
      state: "PASS",
      observedAt,
      primaryUri: "https://wcjs.sbj.cnipa.gov.cn/txnT01.do",
      renderJavascript: true,
      details: { recordedByWorkerId: "worker.compatibility" },
    });
    current = new Date("2026-08-18T00:06:00.000Z");
    const completed = executions.complete({
      executionId: started.executionId,
      workerId: "worker.compatibility",
      observedAt,
      state: "PASS",
    });
    expect(completed).toMatchObject({
      status: "COMPLETED",
      observationObservedAt: observedAt,
      observationState: "PASS",
      completedAt: "2026-08-18T00:06:00.000Z",
      replayed: false,
    });
    expect(completed.observationId).toBeTruthy();
  });

  it("records technical failure without fabricating compatibility evidence", () => {
    const db = database();
    const now = "2026-08-18T00:00:00.000Z";
    const intents = new SqliteFoundationalActionIntentRepository(db, () => new Date(now));
    const intent = intents.create(pendingIntent(now));
    intents.approve(intent.intentId, "operator.approver");
    const executions = new SqliteSourceCompatibilityReprobeExecutionRepository(
      db,
      () => new Date("2026-08-18T00:10:00.000Z"),
    );
    const started = executions.start({
      intentId: intent.intentId,
      workerId: "worker.compatibility",
      executedByActorId: "operator.executor",
      idempotencyKey: "compatibility-reprobe-execution-cn-search",
    });
    const failed = executions.fail({
      executionId: started.executionId,
      workerId: "worker.compatibility",
      errorCode: "SOURCE_COMPATIBILITY_REPROBE_RUNNER_FAILED",
      errorMessage: "browser process failed",
    });
    expect(failed).toMatchObject({
      status: "FAILED",
      observationId: null,
      observationObservedAt: null,
      observationState: null,
      errorCode: "SOURCE_COMPATIBILITY_REPROBE_RUNNER_FAILED",
      errorMessage: "browser process failed",
    });
  });
});
