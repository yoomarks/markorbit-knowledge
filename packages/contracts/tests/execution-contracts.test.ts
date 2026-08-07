import { describe, expect, it } from "vitest";
import collectionRunFixture from "../../../fixtures/contracts/execution/v1/collection-run.valid.json";
import jobFixture from "../../../fixtures/contracts/execution/v1/job.valid.json";
import {
  COLLECTION_RUN_STATUSES,
  EXECUTION_ACTOR_TYPES,
  RUN_TRIGGER_TYPES,
  isCollectionRun,
  isExecutionContract,
  isJob,
} from "../src/index";

describe("Execution Contract v1", () => {
  it("accepts canonical CollectionRun and Job fixtures", () => {
    expect(isCollectionRun(collectionRunFixture)).toBe(true);
    expect(isJob(jobFixture)).toBe(true);
    expect(isExecutionContract(collectionRunFixture)).toBe(true);
    expect(isExecutionContract(jobFixture)).toBe(true);
  });

  it("exports unique execution vocabularies", () => {
    for (const values of [COLLECTION_RUN_STATUSES, RUN_TRIGGER_TYPES, EXECUTION_ACTOR_TYPES]) {
      expect(values.length).toBeGreaterThan(0);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("rejects unknown fields and invalid typed identifiers", () => {
    expect(isCollectionRun({ ...collectionRunFixture, unexpected: true })).toBe(false);
    expect(isJob({ ...jobFixture, id: "job-invalid" })).toBe(false);
  });

  it("requires aligned immutable snapshots", () => {
    expect(
      isCollectionRun({
        ...collectionRunFixture,
        sourceSnapshot: {
          ...collectionRunFixture.sourceSnapshot,
          id: "src_01ARZ3NDEKTSV4RRFFQ69G5FB7",
        },
      }),
    ).toBe(false);
    expect(
      isJob({
        ...jobFixture,
        connector: { connectorId: "other-connector", version: "1.0.0" },
      }),
    ).toBe(false);
  });

  it("enforces cancellation metadata only on cancelled records", () => {
    expect(
      isCollectionRun({
        ...collectionRunFixture,
        status: "CANCELLED",
        cancelledAt: "2026-07-16T00:31:00Z",
        cancellationReason: "Operator cancelled before Worker execution",
      }),
    ).toBe(true);
    expect(
      isCollectionRun({
        ...collectionRunFixture,
        cancelledAt: "2026-07-16T00:31:00Z",
      }),
    ).toBe(false);
  });

  it("rejects credential-like extension values", () => {
    expect(
      isCollectionRun({
        ...collectionRunFixture,
        extensions: { "x-runtime": { apiKey: "must-not-be-stored" } },
      }),
    ).toBe(false);
  });

  it("requires retry triggers to reference a parent run", () => {
    expect(
      isCollectionRun({
        ...collectionRunFixture,
        trigger: {
          type: "RETRY",
          requestedBy: { actorType: "SYSTEM" },
        },
      }),
    ).toBe(false);
  });
});
