import { describe, expect, it } from "vitest";
import { SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION } from "@markorbit/contracts";
import {
  DEFAULT_WORKSPACE,
  RegistryConflictError,
  openRegistryDatabase,
} from "@markorbit/persistence";
import {
  foundationalActionIntentId,
  SqliteFoundationalActionIntentRepository,
  type FoundationalActionIntentRecord,
} from "@markorbit/persistence/foundational-action-intents";
import { SqliteSourceCompatibilityObservationRepository } from "@markorbit/persistence/source-compatibility-observations";
import { SqliteSourceCompatibilityReprobeExecutionRepository } from "@markorbit/persistence/source-compatibility-reprobe-executions";
import { recordSourceCompatibilityWorkerIntake } from "../source-compatibility-worker-intake";

const workerId = "worker.compatibility";
const targetId = "eu-euipo-trademark-search";
const observedAt = "2026-08-20T03:05:00.000Z";

function pendingIntent(now: string): FoundationalActionIntentRecord {
  const idempotencyKey = "worker-intake-eu-search";
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

function summary(input: { targetId?: string; jurisdiction?: string } = {}) {
  return {
    version: "REPRESENTATIVE_SOURCE_LIVE_CANARY_RESULT_V2",
    observedAt,
    observations: [
      {
        jurisdiction: input.jurisdiction ?? "EU",
        profile: "INTERACTIVE_SEARCH",
        targetId: input.targetId ?? targetId,
        family: "SEARCH",
        requestedUri: "https://euipo.europa.eu/eSearch/",
        renderJavascript: true,
        state: "PASS",
        elapsedMs: 1200,
        pagesAttempted: 1,
        artifactCount: 2,
        artifactKinds: ["HTML", "MARKDOWN"],
        finalUris: ["https://euipo.europa.eu/eSearch/"],
        totalBytes: 2048,
      },
    ],
  };
}

function fixture() {
  const database = openRegistryDatabase(":memory:");
  const clock = () => new Date("2026-08-20T03:00:00.000Z");
  const intents = new SqliteFoundationalActionIntentRepository(database, clock);
  const intent = intents.create(pendingIntent(clock().toISOString()));
  intents.approve(intent.intentId, "operator.approver");
  const execution = new SqliteSourceCompatibilityReprobeExecutionRepository(database, clock).start({
    intentId: intent.intentId,
    workerId,
    executedByActorId: "operator.executor",
    idempotencyKey: "worker-intake-eu-search-execution",
  });
  return { database, execution };
}

function workers(expectedWorkerId = workerId) {
  return {
    verifyCredential(actualWorkerId: string, credential: string) {
      expect(actualWorkerId).toBe(expectedWorkerId);
      expect(credential).toBe("secret");
      return { workerId: actualWorkerId } as never;
    },
  };
}

describe("compatibility worker re-probe observation binding", () => {
  it("records exactly one observation bound to the authenticated STARTED execution", () => {
    const { database, execution } = fixture();
    const result = recordSourceCompatibilityWorkerIntake(
      {
        workerId,
        credential: "secret",
        summary: summary(),
        reprobeExecutionId: execution.executionId,
      },
      { database, workers: workers() },
    );

    expect(result).toMatchObject({ recorded: 1, observedAt, states: { PASS: 1 } });
    const observation = new SqliteSourceCompatibilityObservationRepository(database)
      .latest([targetId])
      .get(targetId);
    expect(observation?.details).toMatchObject({
      recordedByWorkerId: workerId,
      reprobeExecutionId: execution.executionId,
    });
    database.close();
  });

  it("rejects target scope mismatch before writing compatibility evidence", () => {
    const { database, execution } = fixture();
    expect(() =>
      recordSourceCompatibilityWorkerIntake(
        {
          workerId,
          credential: "secret",
          summary: summary({ targetId: "eu-other-target" }),
          reprobeExecutionId: execution.executionId,
        },
        { database, workers: workers() },
      ),
    ).toThrowError(
      expect.objectContaining({ code: "SOURCE_COMPATIBILITY_REPROBE_OBSERVATION_SCOPE_MISMATCH" }),
    );
    expect(
      new SqliteSourceCompatibilityObservationRepository(database).latest(["eu-other-target"]).size,
    ).toBe(0);
    database.close();
  });

  it("rejects binding by a different authenticated worker", () => {
    const { database, execution } = fixture();
    expect(() =>
      recordSourceCompatibilityWorkerIntake(
        {
          workerId: "worker.other",
          credential: "secret",
          summary: summary(),
          reprobeExecutionId: execution.executionId,
        },
        { database, workers: workers("worker.other") },
      ),
    ).toThrow(RegistryConflictError);
    expect(
      new SqliteSourceCompatibilityObservationRepository(database).latest([targetId]).size,
    ).toBe(0);
    database.close();
  });
});
