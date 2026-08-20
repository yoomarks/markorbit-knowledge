import { describe, expect, it } from "vitest";
import { SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION } from "@markorbit/contracts";
import {
  foundationalActionIntentId,
  SqliteFoundationalActionIntentRepository,
  type FoundationalActionIntentRecord,
} from "./foundational-action-intent-ledger";
import { DEFAULT_WORKSPACE, openRegistryDatabase } from "./index";
import { SqliteSourceCompatibilityObservationRepository } from "./source-compatibility-observations";
import { SqliteOperationalSupplyHealthRepository } from "./source-compatibility-supply-health";
import { SqliteSourceCompatibilityReprobeExecutionRepository } from "./source-compatibility-reprobe-execution";

const targetId = "cn-cnipa-trademark-search";
const observedAt = "2026-08-20T00:51:31.504Z";

function evidenceContext() {
  return {
    provider: "GITHUB_ACTIONS",
    repository: "yoomarks/markorbit-knowledge",
    runId: "32318381895",
    runAttempt: "1",
    commitSha: "efc95ba9ae35a2df9ac9dee4cb76b71c965c5409",
    workflowSha: "f123f55ce2ad78113160337accd6631a834e9c50",
    workflow: "Representative Source Live Canary",
    eventName: "pull_request",
    sourceRef: "agent/live-canary-evidence-provenance-v1",
    serverUrl: "https://github.com",
  };
}

function pendingIntent(now: string): FoundationalActionIntentRecord {
  const idempotencyKey = "supply-health-reprobe-cn-search";
  return {
    protocolVersion: "1.0",
    objectType: "FOUNDATIONAL_ACTION_INTENT",
    intentId: foundationalActionIntentId(DEFAULT_WORKSPACE.id, idempotencyKey),
    workspaceId: DEFAULT_WORKSPACE.id,
    jurisdiction: "CN",
    targetId,
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
    readinessProtocolVersion: SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION,
    queueProtocolVersion: "1.1",
    sourceSnapshotObservedAt: now,
    createdAt: now,
    updatedAt: now,
    replayed: false,
  };
}

describe("source supply compatibility provenance and re-probe projection", () => {
  it("surfaces exact Canary run provenance without inventing Source registration", () => {
    const database = openRegistryDatabase(":memory:");
    new SqliteSourceCompatibilityObservationRepository(database).record({
      targetId,
      jurisdiction: "CN",
      state: "DEGRADED",
      observedAt,
      primaryUri: "https://sbj.cnipa.gov.cn/sbj/sbcx/",
      renderJavascript: true,
      errorCode: "CANARY_ADAPTER_REQUIRED",
      errorMessage: "primary timed out while authority baseline remained collectible",
      baselineTargetId: "cn-cnipa-trademark-filing-guide",
      baselineState: "PASS",
      details: { evidenceContext: evidenceContext() },
    });

    const result = new SqliteOperationalSupplyHealthRepository(
      database,
      () => new Date("2026-08-20T01:00:00.000Z"),
    ).list({ workspaceId: DEFAULT_WORKSPACE.id, targetId });

    const item = result.items[0]!;
    expect(item.protocolVersion).toBe(SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION);
    expect(item.registrationState).toBe("UNREGISTERED");
    expect(item.sourceIds).toEqual([]);
    expect(item.compatibility).toMatchObject({
      state: "DEGRADED",
      freshness: "FRESH",
      evidenceProvenance: evidenceContext(),
    });
    expect(result.summary.compatibilityProvenanceObserved).toBe(1);
    expect(item.latestCompatibilityReprobe).toMatchObject({ state: "UNOBSERVED" });
    database.close();
  });

  it("projects latest governed re-probe failure without changing supply state or gaps", () => {
    const database = openRegistryDatabase(":memory:");
    new SqliteSourceCompatibilityObservationRepository(database).record({
      targetId,
      jurisdiction: "CN",
      state: "BLOCKED",
      observedAt,
      primaryUri: "https://sbj.cnipa.gov.cn/sbj/sbcx/",
      renderJavascript: true,
      errorCode: "CRAWL4AI_FETCH_FAILED",
      errorMessage: "navigation timeout",
      details: { evidenceContext: evidenceContext() },
    });
    const clock = () => new Date("2026-08-20T01:00:00.000Z");
    const health = new SqliteOperationalSupplyHealthRepository(database, clock);
    const before = health.list({ workspaceId: DEFAULT_WORKSPACE.id, targetId }).items[0]!;

    const intents = new SqliteFoundationalActionIntentRepository(database, clock);
    const intent = intents.create(pendingIntent(clock().toISOString()));
    intents.approve(intent.intentId, "operator.approver");
    const executions = new SqliteSourceCompatibilityReprobeExecutionRepository(database, clock);
    const started = executions.start({
      intentId: intent.intentId,
      workerId: "worker.compatibility",
      executedByActorId: "operator.executor",
      idempotencyKey: "supply-health-reprobe-execution-cn-search",
    });

    const whileStarted = health.list({ workspaceId: DEFAULT_WORKSPACE.id, targetId }).items[0]!;
    expect(whileStarted.latestCompatibilityReprobe).toMatchObject({
      state: "STARTED",
      executionId: started.executionId,
      intentId: intent.intentId,
    });
    expect(whileStarted.state).toBe(before.state);
    expect(whileStarted.gaps).toEqual(before.gaps);

    executions.fail({
      executionId: started.executionId,
      workerId: "worker.compatibility",
      errorCode: "SOURCE_COMPATIBILITY_REPROBE_RUNNER_FAILED",
      errorMessage: "browser process failed",
    });
    const after = health.list({ workspaceId: DEFAULT_WORKSPACE.id, targetId });
    expect(after.items[0]!.latestCompatibilityReprobe).toMatchObject({
      state: "FAILED",
      executionId: started.executionId,
      errorCode: "SOURCE_COMPATIBILITY_REPROBE_RUNNER_FAILED",
      errorMessage: "browser process failed",
    });
    expect(after.items[0]!.state).toBe(before.state);
    expect(after.items[0]!.gaps).toEqual(before.gaps);
    expect(after.summary.byCompatibilityReprobe).toMatchObject({ FAILED: 1 });
    database.close();
  });

  it("links a completed re-probe to its worker-authored compatibility observation", () => {
    const database = openRegistryDatabase(":memory:");
    let current = new Date("2026-08-20T01:00:00.000Z");
    const clock = () => current;
    const intents = new SqliteFoundationalActionIntentRepository(database, clock);
    const intent = intents.create(pendingIntent(current.toISOString()));
    intents.approve(intent.intentId, "operator.approver");
    const executions = new SqliteSourceCompatibilityReprobeExecutionRepository(database, clock);
    const started = executions.start({
      intentId: intent.intentId,
      workerId: "worker.compatibility",
      executedByActorId: "operator.executor",
      idempotencyKey: "supply-health-reprobe-execution-cn-search",
    });
    const completionObservedAt = "2026-08-20T01:05:00.000Z";
    const observation = new SqliteSourceCompatibilityObservationRepository(database).record({
      targetId,
      jurisdiction: "CN",
      state: "PASS",
      observedAt: completionObservedAt,
      primaryUri: "https://sbj.cnipa.gov.cn/sbj/sbcx/",
      renderJavascript: true,
      details: { recordedByWorkerId: "worker.compatibility" },
    });
    current = new Date("2026-08-20T01:06:00.000Z");
    executions.complete({
      executionId: started.executionId,
      workerId: "worker.compatibility",
      observedAt: completionObservedAt,
      state: "PASS",
    });

    const item = new SqliteOperationalSupplyHealthRepository(database, clock).list({
      workspaceId: DEFAULT_WORKSPACE.id,
      targetId,
    }).items[0]!;
    expect(item.latestCompatibilityReprobe).toMatchObject({
      state: "COMPLETED",
      executionId: started.executionId,
      observationId: observation.id,
      observationObservedAt: completionObservedAt,
      observationState: "PASS",
    });
    database.close();
  });
});
