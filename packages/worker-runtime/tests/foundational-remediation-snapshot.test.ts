import { describe, expect, it } from "vitest";
import {
  FOUNDATIONAL_READINESS_PROTOCOL_VERSION,
  type FoundationalReadinessGate,
} from "../src/foundational-readiness";
import { buildFoundationalRemediationQueue } from "../src/foundational-remediation-queue";
import { assembleFoundationalRemediationQueueSnapshot } from "../src/foundational-remediation-snapshot";

function readiness(jurisdiction = "US"): FoundationalReadinessGate {
  return {
    protocolVersion: FOUNDATIONAL_READINESS_PROTOCOL_VERSION,
    objectType: "FOUNDATIONAL_READINESS_GATE",
    jurisdiction,
    state: "NOT_READY",
    totalCount: 1,
    readyCount: 0,
    blockingCount: 1,
    readyPercent: 0,
    byStage: {
      REGISTER: 1,
      COLLECT: 0,
      INGEST: 0,
      CONVERT: 0,
      INDEX: 0,
      QUALITY: 0,
      RELEVANCE: 0,
      HEALTH: 0,
      READY: 0,
    },
    targets: [
      {
        targetId: "us-uspto-trademarks-root",
        stage: "REGISTER",
        ready: false,
        healthState: "BLOCKED",
        gaps: ["SOURCE_UNREGISTERED"],
        reason: "SOURCE_UNREGISTERED",
        retrievalQualityState: "NOT_APPLICABLE",
        retrievalAuditDocumentCount: 0,
        retrievalAuditGaps: [],
        retrievalRelevanceState: "NOT_APPLICABLE",
        retrievalRelevanceProbeCount: 0,
        retrievalRelevanceGaps: [],
      },
    ],
  };
}

describe("foundational remediation snapshot", () => {
  it("assembles an explicitly read-only control-plane response", () => {
    const gate = readiness();
    const queue = buildFoundationalRemediationQueue(gate, "default");
    const snapshot = assembleFoundationalRemediationQueueSnapshot({
      workspaceId: "default",
      topK: 5,
      observedAt: "2026-08-10T00:00:00.000Z",
      readiness: gate,
      remediationQueue: queue,
      apiRemediation: {
        requiredCount: 1,
        preparedCount: 1,
        invalidCount: 0,
        items: [
          {
            targetId: "us-uspto-trademarks-root",
            state: "PREPARED_AWAITING_WORKER_BINDING",
            requiredArtifactKinds: ["JSON"],
            sourceId: "src_api",
            planId: "pln_api",
            endpointBinding: "uspto-search",
            workerEndpointBindingState: "EXTERNAL_UNVERIFIED",
            collectionAuthorization: "NONE",
            automaticExecution: false,
          },
        ],
      },
    });

    expect(snapshot.protocolVersion).toBe("1.1");
    expect(snapshot.objectType).toBe("FOUNDATIONAL_REMEDIATION_QUEUE_SNAPSHOT");
    expect(snapshot.executionPolicy).toBe("READ_ONLY");
    expect(snapshot.collectionAuthorization).toBe("NONE");
    expect(snapshot.mutationPerformed).toBe(false);
    expect(snapshot.jurisdiction).toBe("US");
    expect(snapshot.apiRemediation.preparedCount).toBe(1);
    expect(snapshot.apiRemediation.items[0].workerEndpointBindingState).toBe("EXTERNAL_UNVERIFIED");
    expect(snapshot.remediationQueue.items[0].actions[0].automaticExecution).toBe(false);
  });

  it("defaults API remediation status to an empty read-only summary", () => {
    const gate = readiness();
    const queue = buildFoundationalRemediationQueue(gate, "default");
    const snapshot = assembleFoundationalRemediationQueueSnapshot({
      workspaceId: "default",
      observedAt: "2026-08-10T00:00:00.000Z",
      readiness: gate,
      remediationQueue: queue,
    });

    expect(snapshot.apiRemediation).toEqual({
      requiredCount: 0,
      preparedCount: 0,
      invalidCount: 0,
      items: [],
    });
  });

  it("rejects mismatched readiness and remediation jurisdiction", () => {
    const gate = readiness("US");
    const queue = buildFoundationalRemediationQueue(readiness("WO"), "default");
    expect(() =>
      assembleFoundationalRemediationQueueSnapshot({
        workspaceId: "default",
        observedAt: "2026-08-10T00:00:00.000Z",
        readiness: gate,
        remediationQueue: queue,
      }),
    ).toThrow(/jurisdictions must match/);
  });

  it("rejects mismatched readiness and remediation target counts", () => {
    const gate = readiness();
    const queue = { ...buildFoundationalRemediationQueue(gate, "default"), totalTargetCount: 2 };
    expect(() =>
      assembleFoundationalRemediationQueueSnapshot({
        workspaceId: "default",
        observedAt: "2026-08-10T00:00:00.000Z",
        readiness: gate,
        remediationQueue: queue,
      }),
    ).toThrow(/target counts must match/);
  });

  it("rejects API remediation summaries outside readiness scope", () => {
    const gate = readiness();
    const queue = buildFoundationalRemediationQueue(gate, "default");
    expect(() =>
      assembleFoundationalRemediationQueueSnapshot({
        workspaceId: "default",
        observedAt: "2026-08-10T00:00:00.000Z",
        readiness: gate,
        remediationQueue: queue,
        apiRemediation: {
          requiredCount: 1,
          preparedCount: 0,
          invalidCount: 0,
          items: [
            {
              targetId: "us-unknown",
              state: "UNPREPARED",
              requiredArtifactKinds: ["JSON"],
              sourceId: null,
              planId: null,
              endpointBinding: null,
              workerEndpointBindingState: "EXTERNAL_UNVERIFIED",
              collectionAuthorization: "NONE",
              automaticExecution: false,
            },
          ],
        },
      }),
    ).toThrow(/outside readiness scope/);
  });
});
