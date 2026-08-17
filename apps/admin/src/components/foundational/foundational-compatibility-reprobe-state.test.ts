import { describe, expect, it } from "vitest";
import type { SourceCompatibilityReprobeExecution } from "@markorbit/persistence/source-compatibility-reprobe-executions";
import type { FoundationalActionIntent } from "@markorbit/worker-runtime/foundational-action-intent";
import type { FoundationalRemediationQueueSnapshot } from "@markorbit/worker-runtime/foundational-remediation-snapshot";
import {
  compatibilityReprobeExecutionIdempotencyKey,
  compatibilityReprobePhase,
  compatibilityReprobeWorkerCommand,
  listControlledCompatibilityReprobeActions,
} from "./foundational-compatibility-reprobe-state";

function snapshot(): FoundationalRemediationQueueSnapshot {
  return {
    remediationQueue: {
      items: [
        {
          targetId: "us-uspto-trademarks-root",
          stage: "HEALTH",
          actions: [
            {
              code: "REPROBE_SOURCE_COMPATIBILITY",
              executionPath: "MANUAL_OPERATOR",
              collectionAuthorizationRequired: false,
              automaticExecution: false,
              operatorInstruction: "Run controlled re-probe",
            },
            {
              code: "REVIEW_SUPPLY_HEALTH",
              executionPath: "MANUAL_OPERATOR",
              collectionAuthorizationRequired: false,
              automaticExecution: false,
              operatorInstruction: "Review health",
            },
          ],
        },
      ],
    },
  } as unknown as FoundationalRemediationQueueSnapshot;
}

function intent(status: FoundationalActionIntent["status"]): FoundationalActionIntent {
  return {
    protocolVersion: "1.0",
    objectType: "FOUNDATIONAL_ACTION_INTENT",
    intentId: "fai_0123456789abcdef0123456789abcdef",
    workspaceId: "default",
    jurisdiction: "US",
    targetId: "us-uspto-trademarks-root",
    readinessStage: "HEALTH",
    actionCode: "REPROBE_SOURCE_COMPATIBILITY",
    operatorInstruction: "Run controlled re-probe",
    executionPath: "MANUAL_OPERATOR",
    collectionAuthorizationRequired: false,
    automaticExecution: false,
    executionAuthorization: "NONE",
    requestedByActorId: "operator.requester",
    approvalRequired: true,
    approvedByActorId: status === "APPROVED" ? "operator.reviewer" : null,
    canceledByActorId: status === "CANCELED" ? "operator.requester" : null,
    status,
    idempotencyKey: "intent-key",
    readinessProtocolVersion: "1.3",
    queueProtocolVersion: "1.1",
    sourceSnapshotObservedAt: "2026-08-18T00:00:00.000Z",
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
    replayed: false,
  };
}

function execution(
  status: SourceCompatibilityReprobeExecution["status"],
): SourceCompatibilityReprobeExecution {
  return {
    version: "SOURCE_COMPATIBILITY_REPROBE_EXECUTION_V1",
    objectType: "SOURCE_COMPATIBILITY_REPROBE_EXECUTION",
    executionId: "scrx_0123456789abcdef0123456789abcdef",
    intentId: "fai_0123456789abcdef0123456789abcdef",
    workspaceId: "default",
    jurisdiction: "US",
    targetId: "us-uspto-trademarks-root",
    requestedByActorId: "operator.requester",
    approvedByActorId: "operator.reviewer",
    executedByActorId: "operator.executor",
    workerId: "worker.compatibility",
    status,
    idempotencyKey: "execution-key",
    startedAt: "2026-08-18T00:05:00.000Z",
    completedAt: status === "STARTED" ? null : "2026-08-18T00:06:00.000Z",
    observationId: status === "COMPLETED" ? "sco_0123456789abcdef0123456789abcdef" : null,
    observationObservedAt: status === "COMPLETED" ? "2026-08-18T00:05:30.000Z" : null,
    observationState: status === "COMPLETED" ? "PASS" : null,
    errorCode: status === "FAILED" ? "RUNNER_FAILED" : null,
    errorMessage: status === "FAILED" ? "runner failed" : null,
    replayed: false,
  };
}

describe("foundational compatibility re-probe UI state", () => {
  it("exposes only the governed stale compatibility action", () => {
    expect(listControlledCompatibilityReprobeActions(snapshot())).toEqual([
      {
        targetId: "us-uspto-trademarks-root",
        actionCode: "REPROBE_SOURCE_COMPATIBILITY",
        stage: "HEALTH",
        operatorInstruction: "Run controlled re-probe",
        executionPath: "MANUAL_OPERATOR",
        collectionAuthorizationRequired: false,
        automaticExecution: false,
      },
    ]);
  });

  it("maps intent and receipt lifecycle to operator phases", () => {
    expect(compatibilityReprobePhase(null, null)).toBe("REQUEST_APPROVAL");
    expect(compatibilityReprobePhase(intent("CANCELED"), null)).toBe("REQUEST_APPROVAL");
    expect(compatibilityReprobePhase(intent("PENDING_APPROVAL"), null)).toBe("PENDING_APPROVAL");
    expect(compatibilityReprobePhase(intent("APPROVED"), null)).toBe("READY_FOR_WORKER");
    expect(compatibilityReprobePhase(intent("APPROVED"), execution("STARTED"))).toBe("RUNNING");
    expect(compatibilityReprobePhase(intent("APPROVED"), execution("COMPLETED"))).toBe("COMPLETED");
    expect(compatibilityReprobePhase(intent("APPROVED"), execution("FAILED"))).toBe(
      "FAILED_REAPPROVAL_REQUIRED",
    );
  });

  it("generates a deterministic credential-free Worker handoff command", () => {
    const intentId = "fai_0123456789abcdef0123456789abcdef";
    const command = compatibilityReprobeWorkerCommand({
      intentId,
      executedByActorId: "operator:local-admin",
    });

    expect(command).toContain("operate:compatibility-reprobe");
    expect(command).toContain(`--intent-id=${intentId}`);
    expect(command).toContain("--executed-by=operator:local-admin");
    expect(command).toContain(
      `--idempotency-key=${compatibilityReprobeExecutionIdempotencyKey(intentId)}`,
    );
    expect(command).not.toContain("MARKORBIT_WORKER_CREDENTIAL");
    expect(command).not.toContain("Bearer");
    expect(command).not.toContain("secret");
  });
});
