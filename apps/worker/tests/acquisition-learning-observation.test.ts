import { describe, expect, it } from "vitest";
import type {
  ControlledCollectionCompletion,
  ControlledCollectionFailure,
} from "@markorbit/worker-runtime";
import {
  buildFailedAcquisitionLearningObservation,
  buildReceiptAcquisitionLearningObservation,
} from "../src/acquisition-learning-observation";

const context = {
  job: { runId: "run_learning", sourceId: "src_learning", planId: "pln_learning" },
} as unknown as ControlledCollectionCompletion["context"];

describe("acquisition learning observations", () => {
  it("uses Crawl4AI telemetry instead of artifact count as fetch evidence", () => {
    const completion = {
      context,
      startedAt: "2026-09-11T00:00:00.000Z",
      finishedAt: "2026-09-11T00:01:00.000Z",
      receipt: {
        itemsObserved: 8,
        bytesPrepared: 4096,
        metadataOnly: false,
        executor: { executorId: "crawl4ai-python", version: "1.0.0" },
      },
    } as unknown as ControlledCollectionCompletion;
    const observation = buildReceiptAcquisitionLearningObservation(completion, {
      pagesAttempted: 10,
      pagesSucceeded: 8,
      pagesFailed: 2,
      redirects: 1,
      internalLinksDiscovered: 25,
      maxDepthObserved: 2,
      attachmentsAttempted: 0,
      httpStatusCounts: { "200": 8, "404": 2 },
    });
    expect(observation?.counts).toMatchObject({
      discovered: 25,
      attempted: 10,
      fetched: 8,
      accepted: 8,
    });
    expect(observation?.httpStatusCounts).toEqual({ "200": 8, "404": 2 });
    expect(observation?.failureSignatures).toEqual([{ code: "CRAWL4AI_PAGE_FAILURE", count: 2 }]);
  });

  it("turns failed acquisition into durable failure evidence input", () => {
    const failure = {
      context,
      startedAt: "2026-09-11T00:00:00.000Z",
      finishedAt: "2026-09-11T00:00:05.000Z",
      error: Object.assign(new Error("blocked"), { code: "ROBOTS_BLOCKED" }),
    } as unknown as ControlledCollectionFailure;
    const observation = buildFailedAcquisitionLearningObservation(failure);
    expect(observation.outcome).toBe("FAILED");
    expect(observation.failureSignatures).toEqual([{ code: "ROBOTS_BLOCKED", count: 1 }]);
    expect(observation.evidenceRefs).toContain("failure-signature:ROBOTS_BLOCKED");
  });
});
