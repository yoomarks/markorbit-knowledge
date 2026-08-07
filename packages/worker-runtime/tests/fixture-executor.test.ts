import { describe, expect, it } from "vitest";
import type { Job, JobLease } from "@markorbit/contracts";
import {
  FIXTURE_EXECUTOR,
  FixtureConnectorExecutor,
  type ClaimedExecutionContext,
  type WorkerExecutionClient,
} from "../src/index";

function context(): ClaimedExecutionContext {
  return {
    workerId: "wrk_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    job: {
      id: "job_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      planSnapshot: { output: { artifactKinds: ["HTML", "MARKDOWN"] } },
    } as Job,
    lease: { id: "lse_01ARZ3NDEKTSV4RRFFQ69G5FAV" } as JobLease,
  };
}

function client(events: string[]): WorkerExecutionClient {
  return {
    async start() {
      events.push("start");
    },
    async uploading() {
      events.push("uploading");
    },
    async verifying() {
      events.push("verifying");
    },
    async complete(_context, receipt) {
      events.push(`complete:${receipt.itemsObserved}:${receipt.bytesPrepared}`);
    },
    async fail(_context, failure) {
      events.push(`fail:${failure.code}`);
    },
  };
}

describe("FixtureConnectorExecutor", () => {
  it("produces deterministic metadata-only completion evidence", async () => {
    const executor = new FixtureConnectorExecutor();
    const firstEvents: string[] = [];
    const secondEvents: string[] = [];
    const first = await executor.execute(context(), client(firstEvents));
    const second = await executor.execute(context(), client(secondEvents));

    expect(first).toEqual(second);
    expect(first?.executor).toEqual(FIXTURE_EXECUTOR);
    expect(first?.metadataOnly).toBe(true);
    expect(firstEvents).toEqual(secondEvents);
    expect(firstEvents.slice(0, 3)).toEqual(["start", "uploading", "verifying"]);
  });

  it("injects deterministic failures without continuing to completion", async () => {
    const events: string[] = [];
    const result = await new FixtureConnectorExecutor().execute(
      context(),
      client(events),
      "FAIL_DURING_UPLOAD",
    );
    expect(result).toBeNull();
    expect(events).toEqual(["start", "uploading", "fail:FIXTURE_FAILURE_DURING_UPLOAD"]);
  });
});
