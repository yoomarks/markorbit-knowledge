import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, SqliteSourceRepository, type CreateSourceInput } from "../src/index";
import {
  SqliteCollectionPlanRepository,
  type CreateCollectionPlanInput,
} from "../src/collection-plan-registry";
import { SqliteExecutionLedgerRepository } from "../src/execution-ledger";
import {
  SqliteFoundationalActionExecutionRepository,
  foundationalActionExecutionId,
} from "../src/foundational-action-execution-ledger";
import {
  SqliteFoundationalActionIntentRepository,
  foundationalActionIntentId,
  type FoundationalActionIntentRecord,
} from "../src/foundational-action-intent-ledger";

function sourceInput(): CreateSourceInput {
  return {
    workspaceId: DEFAULT_WORKSPACE.id,
    name: "USPTO Trademarks",
    slug: "uspto-trademarks-m24-ledger",
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en-US"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    connectorConfig: {},
    canonicalUri: "https://www.uspto.gov/trademarks",
    entrypoints: [{ uri: "https://www.uspto.gov/trademarks" }],
  };
}

function planInput(sourceId: string): CreateCollectionPlanInput {
  return {
    workspaceId: DEFAULT_WORKSPACE.id,
    sourceId,
    name: "Foundational Supply — us-uspto-trademarks-root",
    status: "ACTIVE",
    schedule: { mode: "MANUAL" },
    priority: "HIGH",
    policy: {
      includePatterns: ["https://www.uspto.gov/trademarks*"],
      excludePatterns: [],
      maxDepth: 1,
      maxItems: 40,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: true,
      rateLimitPerMinute: 12,
      timeoutSeconds: 90,
      retry: { maxAttempts: 1, backoffSeconds: 10 },
      locale: "en-US",
    },
    output: { artifactKinds: ["HTML", "MARKDOWN"] },
    extensions: {
      "x-markorbit-source-coverage-target-id": "us-uspto-trademarks-root",
      "x-markorbit-purpose": "foundational-source-supply",
      "x-markorbit-collection-authorization": false,
    },
  };
}

function pendingIntent(idempotencyKey: string): FoundationalActionIntentRecord {
  const createdAt = "2026-08-10T00:00:00.000Z";
  return {
    protocolVersion: "1.0",
    objectType: "FOUNDATIONAL_ACTION_INTENT",
    intentId: foundationalActionIntentId(DEFAULT_WORKSPACE.id, idempotencyKey),
    workspaceId: DEFAULT_WORKSPACE.id,
    jurisdiction: "US",
    targetId: "us-uspto-trademarks-root",
    readinessStage: "COLLECT",
    actionCode: "DISPATCH_GOVERNED_COLLECTION",
    operatorInstruction: "Explicitly dispatch the prepared foundational plan.",
    executionPath: "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH",
    collectionAuthorizationRequired: true,
    automaticExecution: false,
    executionAuthorization: "NONE",
    requestedByActorId: "operator:mile",
    approvalRequired: true,
    approvedByActorId: null,
    canceledByActorId: null,
    status: "PENDING_APPROVAL",
    idempotencyKey,
    readinessProtocolVersion: "1.2",
    queueProtocolVersion: "1.0",
    sourceSnapshotObservedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
    replayed: false,
  };
}

describe("foundational action execution ledger", () => {
  it("records one immutable dispatch linked to an approved intent and CollectionRun", () => {
    const database = new DatabaseSync(":memory:");
    let tick = 0;
    const clock = () => new Date(`2026-08-10T00:00:${String(tick++).padStart(2, "0")}.000Z`);
    const source = new SqliteSourceRepository(database, clock).create(sourceInput());
    const plan = new SqliteCollectionPlanRepository(database, clock).create(planInput(source.id));
    const intents = new SqliteFoundationalActionIntentRepository(database, clock);
    const pending = intents.create(pendingIntent("m24-ledger-intent"));
    const approved = intents.approve(pending.intentId, "reviewer:alice");
    const dispatch = new SqliteExecutionLedgerRepository(database, clock).dispatchManual({
      planId: plan.plan.id,
      requestedBy: { actorType: "LOCAL_ADMIN", actorId: "operator:mile" },
      idempotencyKey: `foundational-intent:${pending.intentId}`,
    });
    const key = "m24-ledger-execution";
    const record = {
      protocolVersion: "1.0" as const,
      objectType: "FOUNDATIONAL_ACTION_EXECUTION" as const,
      executionId: foundationalActionExecutionId(DEFAULT_WORKSPACE.id, key),
      intentId: approved.intentId,
      workspaceId: DEFAULT_WORKSPACE.id,
      jurisdiction: "US",
      targetId: approved.targetId,
      readinessStage: "COLLECT" as const,
      actionCode: "DISPATCH_GOVERNED_COLLECTION" as const,
      executionPath: "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH" as const,
      status: "DISPATCHED" as const,
      requestedByActorId: approved.requestedByActorId,
      approvedByActorId: approved.approvedByActorId!,
      executedByActorId: "operator:mile",
      approvalMode: "APPROVED_INTENT_PLUS_EXPLICIT_EXECUTE" as const,
      explicitExecute: true as const,
      automaticExecution: false as const,
      collectionAuthorization: "EXPLICIT_SINGLE_TARGET_MANUAL_DISPATCH" as const,
      executionAuthorization: "CONSUMED_BY_DISPATCH" as const,
      sourceId: source.id,
      planId: plan.plan.id,
      runId: dispatch.record.run.id,
      jobIds: dispatch.record.jobs.map((job) => job.id),
      runStatusAtDispatch: dispatch.record.run.status,
      idempotencyKey: key,
      intentUpdatedAt: approved.updatedAt,
      sourceSnapshotObservedAt: approved.sourceSnapshotObservedAt,
      revalidatedAt: "2026-08-10T00:00:05.000Z",
      dispatchedAt: dispatch.record.run.requestedAt,
      replayed: false,
    };
    const executions = new SqliteFoundationalActionExecutionRepository(database);
    const created = executions.create(record);
    expect(created.runId).toBe(dispatch.record.run.id);
    expect(created.collectionAuthorization).toBe("EXPLICIT_SINGLE_TARGET_MANUAL_DISPATCH");
    expect(created.replayed).toBe(false);

    const replay = executions.create(record);
    expect(replay.executionId).toBe(created.executionId);
    expect(replay.replayed).toBe(true);
    expect(executions.getByIntentId(approved.intentId)?.runId).toBe(dispatch.record.run.id);
    expect(executions.list({ workspaceId: DEFAULT_WORKSPACE.id })).toHaveLength(1);
    database.close();
  });

  it("rejects execution records for an unapproved intent", () => {
    const database = new DatabaseSync(":memory:");
    const clock = () => new Date("2026-08-10T01:00:00.000Z");
    const source = new SqliteSourceRepository(database, clock).create(sourceInput());
    const plan = new SqliteCollectionPlanRepository(database, clock).create(planInput(source.id));
    const intent = new SqliteFoundationalActionIntentRepository(database, clock).create(
      pendingIntent("m24-unapproved-intent"),
    );
    const dispatch = new SqliteExecutionLedgerRepository(database, clock).dispatchManual({
      planId: plan.plan.id,
      requestedBy: { actorType: "LOCAL_ADMIN", actorId: "operator:mile" },
      idempotencyKey: `foundational-intent:${intent.intentId}`,
    });
    const key = "m24-unapproved-execution";
    expect(() =>
      new SqliteFoundationalActionExecutionRepository(database).create({
        protocolVersion: "1.0",
        objectType: "FOUNDATIONAL_ACTION_EXECUTION",
        executionId: foundationalActionExecutionId(DEFAULT_WORKSPACE.id, key),
        intentId: intent.intentId,
        workspaceId: DEFAULT_WORKSPACE.id,
        jurisdiction: "US",
        targetId: intent.targetId,
        readinessStage: "COLLECT",
        actionCode: "DISPATCH_GOVERNED_COLLECTION",
        executionPath: "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH",
        status: "DISPATCHED",
        requestedByActorId: intent.requestedByActorId,
        approvedByActorId: "reviewer:alice",
        executedByActorId: "operator:mile",
        approvalMode: "APPROVED_INTENT_PLUS_EXPLICIT_EXECUTE",
        explicitExecute: true,
        automaticExecution: false,
        collectionAuthorization: "EXPLICIT_SINGLE_TARGET_MANUAL_DISPATCH",
        executionAuthorization: "CONSUMED_BY_DISPATCH",
        sourceId: source.id,
        planId: plan.plan.id,
        runId: dispatch.record.run.id,
        jobIds: dispatch.record.jobs.map((job) => job.id),
        runStatusAtDispatch: dispatch.record.run.status,
        idempotencyKey: key,
        intentUpdatedAt: intent.updatedAt,
        sourceSnapshotObservedAt: intent.sourceSnapshotObservedAt,
        revalidatedAt: "2026-08-10T01:00:00.000Z",
        dispatchedAt: dispatch.record.run.requestedAt,
        replayed: false,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "FOUNDATIONAL_ACTION_EXECUTION_INTENT_MISMATCH" }),
    );
    database.close();
  });
});
