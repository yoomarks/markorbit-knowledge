import { describe, expect, it } from "vitest";
import { SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION } from "@markorbit/contracts";
import {
  foundationalActionIntentId,
  SqliteFoundationalActionIntentRepository,
  type FoundationalActionIntentRecord,
} from "./foundational-action-intent-ledger";
import { DEFAULT_WORKSPACE, RegistryConflictError, openRegistryDatabase } from "./index";
import { SqliteSourceCompatibilityObservationRepository } from "./source-compatibility-observations";
import { SqliteSourceCompatibilityReprobeExecutionRepository } from "./source-compatibility-reprobe-execution";
import { reconcileSourceCompatibilityReprobeExecution } from "./source-compatibility-reprobe-reconciliation";

const targetId = "eu-euipo-trademark-search";
const workerId = "worker.compatibility";

function pendingIntent(now: string): FoundationalActionIntentRecord {
  const idempotencyKey = "reconcile-eu-search";
  return {
    protocolVersion: "1.0",
    objectType: "FOUNDATIONAL_ACTION_INTENT",
    intentId: foundationalActionIntentId(DEFAULT_WORKSPACE.id, idempotencyKey),
    workspaceId: DEFAULT_WORKSPACE.id,
    jurisdiction: "EU",
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

function startedExecution() {
  const database = openRegistryDatabase(":memory:");
  let current = new Date("2026-08-20T02:00:00.000Z");
  const clock = () => current;
  const intents = new SqliteFoundationalActionIntentRepository(database, clock);
  const intent = intents.create(pendingIntent(current.toISOString()));
  intents.approve(intent.intentId, "operator.approver");
  const executions = new SqliteSourceCompatibilityReprobeExecutionRepository(database, clock);
  const execution = executions.start({
    intentId: intent.intentId,
    workerId,
    executedByActorId: "operator.executor",
    idempotencyKey: "reconcile-eu-search-execution",
  });
  return {
    database,
    execution,
    advance(value: string) {
      current = new Date(value);
    },
  };
}

function boundObservation(
  database: ReturnType<typeof openRegistryDatabase>,
  executionId: string,
  observedAt: string,
  state: "PASS" | "DEGRADED" | "BLOCKED" = "PASS",
) {
  return new SqliteSourceCompatibilityObservationRepository(database).record({
    targetId,
    jurisdiction: "EU",
    state,
    observedAt,
    primaryUri: "https://euipo.europa.eu/eSearch/",
    renderJavascript: true,
    details: { recordedByWorkerId: workerId, reprobeExecutionId: executionId },
  });
}

describe("source compatibility re-probe reconciliation", () => {
  it("completes STARTED execution from its already-persisted bound observation", () => {
    const fixture = startedExecution();
    const observedAt = "2026-08-20T02:05:00.000Z";
    const observation = boundObservation(
      fixture.database,
      fixture.execution.executionId,
      observedAt,
      "DEGRADED",
    );
    fixture.advance("2026-08-20T02:06:00.000Z");

    const result = reconcileSourceCompatibilityReprobeExecution(
      fixture.database,
      { executionId: fixture.execution.executionId, workerId },
      () => new Date("2026-08-20T02:06:00.000Z"),
    );

    expect(result.reconciled).toBe(true);
    expect(result.execution).toMatchObject({
      status: "COMPLETED",
      executionId: fixture.execution.executionId,
      observationId: observation.id,
      observationObservedAt: observedAt,
      observationState: "DEGRADED",
    });
    fixture.database.close();
  });

  it("returns unreconciled without mutating STARTED execution when no bound evidence exists", () => {
    const fixture = startedExecution();
    new SqliteSourceCompatibilityObservationRepository(fixture.database).record({
      targetId,
      jurisdiction: "EU",
      state: "PASS",
      observedAt: "2026-08-20T02:05:00.000Z",
      primaryUri: "https://euipo.europa.eu/eSearch/",
      renderJavascript: true,
      details: { recordedByWorkerId: workerId },
    });

    const result = reconcileSourceCompatibilityReprobeExecution(fixture.database, {
      executionId: fixture.execution.executionId,
      workerId,
    });
    expect(result.reconciled).toBe(false);
    expect(result.execution.status).toBe("STARTED");
    expect(
      new SqliteSourceCompatibilityReprobeExecutionRepository(fixture.database).getById(
        fixture.execution.executionId,
      )?.status,
    ).toBe("STARTED");
    fixture.database.close();
  });

  it("rejects wrong-worker reconciliation", () => {
    const fixture = startedExecution();
    boundObservation(fixture.database, fixture.execution.executionId, "2026-08-20T02:05:00.000Z");
    expect(() =>
      reconcileSourceCompatibilityReprobeExecution(fixture.database, {
        executionId: fixture.execution.executionId,
        workerId: "worker.other",
      }),
    ).toThrow(RegistryConflictError);
    fixture.database.close();
  });

  it("fails closed when more than one observation is bound to one execution", () => {
    const fixture = startedExecution();
    boundObservation(fixture.database, fixture.execution.executionId, "2026-08-20T02:05:00.000Z");
    boundObservation(
      fixture.database,
      fixture.execution.executionId,
      "2026-08-20T02:06:00.000Z",
      "BLOCKED",
    );
    expect(() =>
      reconcileSourceCompatibilityReprobeExecution(fixture.database, {
        executionId: fixture.execution.executionId,
        workerId,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "SOURCE_COMPATIBILITY_REPROBE_RECONCILIATION_AMBIGUOUS" }),
    );
    fixture.database.close();
  });
});
