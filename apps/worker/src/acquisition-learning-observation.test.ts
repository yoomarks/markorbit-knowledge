import { describe, expect, it } from "vitest";
import type { ControlledCollectionCompletion } from "@markorbit/worker-runtime";
import { buildReceiptAcquisitionLearningObservation } from "./acquisition-learning-observation";

describe("receipt acquisition learning observation", () => {
  it("does not fabricate HTTP statuses absent from the execution receipt", () => {
    const completion = {
      context: {
        job: { id: "job_test", runId: "run_test", sourceId: "src_test", planId: "plan_test" },
      },
      receipt: {
        executor: { executorId: "fixture", version: "1", mode: "PRODUCTION" },
        itemsObserved: 3,
        bytesPrepared: 300,
        metadataOnly: false,
      },
      startedAt: "2026-08-22T00:00:00.000Z",
      finishedAt: "2026-08-22T00:00:01.000Z",
    } as unknown as ControlledCollectionCompletion;
    const observation = buildReceiptAcquisitionLearningObservation(completion);
    expect(observation?.httpStatusCounts).toEqual({});
    expect(observation?.evidenceRefs).toContain("http-status-observation:unmeasured");
  });
});
