import { describe, expect, it } from "vitest";
import workerFixture from "../../../fixtures/contracts/worker/v1/worker-definition.valid.json";
import heartbeatFixture from "../../../fixtures/contracts/worker/v1/worker-heartbeat.valid.json";
import leaseFixture from "../../../fixtures/contracts/worker/v1/job-lease.valid.json";
import {
  JOB_LEASE_STATUSES,
  WORKER_DESIRED_STATES,
  WORKER_HEALTH_STATES,
  isJobLease,
  isWorkerDefinition,
  isWorkerHeartbeat,
} from "../src/index";

describe("Worker Protocol v1", () => {
  it("accepts canonical Worker, heartbeat and lease fixtures", () => {
    expect(isWorkerDefinition(workerFixture)).toBe(true);
    expect(isWorkerHeartbeat(heartbeatFixture)).toBe(true);
    expect(isJobLease(leaseFixture)).toBe(true);
  });

  it("exports unique protocol vocabularies", () => {
    for (const values of [WORKER_DESIRED_STATES, WORKER_HEALTH_STATES, JOB_LEASE_STATUSES]) {
      expect(values.length).toBeGreaterThan(0);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("rejects unknown fields and invalid typed identifiers", () => {
    expect(isWorkerDefinition({ ...workerFixture, unexpected: true })).toBe(false);
    expect(isWorkerHeartbeat({ ...heartbeatFixture, id: "heartbeat-invalid" })).toBe(false);
    expect(isJobLease({ ...leaseFixture, workerId: "worker-invalid" })).toBe(false);
  });

  it("rejects credential-like data anywhere in protocol objects", () => {
    expect(
      isWorkerDefinition({
        ...workerFixture,
        extensions: { "x-runtime": { token: "must-not-be-stored" } },
      }),
    ).toBe(false);
    expect(
      isWorkerHeartbeat({
        ...heartbeatFixture,
        diagnostics: { "x-debug": { apiKey: "must-not-be-stored" } },
      }),
    ).toBe(false);
  });

  it("requires exact unique Connector bindings", () => {
    expect(
      isWorkerDefinition({
        ...workerFixture,
        connectorBindings: [workerFixture.connectorBindings[0], workerFixture.connectorBindings[0]],
      }),
    ).toBe(false);
  });

  it("enforces lease closure metadata", () => {
    expect(
      isJobLease({
        ...leaseFixture,
        status: "RELEASED",
        closedAt: "2026-07-16T02:03:00Z",
        closeReason: "Released by Worker",
        updatedAt: "2026-07-16T02:03:00Z",
      }),
    ).toBe(true);
    expect(
      isJobLease({
        ...leaseFixture,
        status: "RELEASED",
      }),
    ).toBe(false);
    expect(
      isJobLease({
        ...leaseFixture,
        closedAt: "2026-07-16T02:03:00Z",
      }),
    ).toBe(false);
  });
});
