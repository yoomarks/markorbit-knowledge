import { describe, expect, it } from "vitest";
import type {
  ArtifactIngestionReceipt,
  ArtifactIngestionSession,
  ExecutionAttempt,
  Job,
  JobLease,
} from "@markorbit/contracts";
import type { CollectionArtifactAcquirer } from "../src/artifact-backed-collection-executor";
import {
  ControlledCollectionWorkerRuntime,
  type ControlledCollectionCompletion,
  type ControlledCollectionWorkerClient,
} from "../src/controlled-collection-worker-runtime";

function fixture() {
  const job = {
    runId: "run_learning",
    sourceId: "src_learning",
    planId: "pln_learning",
    planSnapshot: { output: { artifactKinds: ["HTML"] } },
  } as unknown as Job;
  const lease = { id: "lse_learning" } as unknown as JobLease;
  const client: ControlledCollectionWorkerClient = {
    workerId: "wrk_learning",
    async heartbeat() {},
    async renewLease() {
      return lease;
    },
    async claim() {
      return { job, lease, leaseToken: "mls_learning" };
    },
    async start() {
      return {} as ExecutionAttempt;
    },
    async uploading() {},
    async createArtifactSession() {
      return { id: "ais_learning" } as ArtifactIngestionSession;
    },
    async uploadArtifactContent() {},
    async finalizeArtifact() {
      return { id: "air_learning" } as ArtifactIngestionReceipt;
    },
    async verifying() {},
    async complete() {},
    async fail() {},
  };
  const acquirer: CollectionArtifactAcquirer = {
    executor: { executorId: "learning-acquirer", version: "1.0.0", mode: "PRODUCTION" },
    async acquire() {
      return [
        {
          artifactKind: "HTML",
          mimeType: "text/html",
          originalName: "page.html",
          sourceUri: "https://example.test/page",
          content: new TextEncoder().encode("<html>evidence</html>"),
        },
      ];
    },
  };
  return { job, client, acquirer };
}

describe("ControlledCollectionWorkerRuntime completion observer", () => {
  it("surfaces governed context and the completed receipt after control-plane completion", async () => {
    const { job, client, acquirer } = fixture();
    const completions: ControlledCollectionCompletion[] = [];
    const runtime = new ControlledCollectionWorkerRuntime(client, acquirer, {
      onCompleted(completion) {
        completions.push(completion);
      },
    });

    await expect(runtime.runOnce()).resolves.toBe(true);
    expect(completions).toHaveLength(1);
    const completion = completions[0]!;
    expect(completion.context.job).toBe(job);
    expect(completion.context.workerId).toBe("wrk_learning");
    expect(completion.receipt).toMatchObject({
      executor: { executorId: "learning-acquirer", version: "1.0.0", mode: "PRODUCTION" },
      itemsObserved: 1,
      metadataOnly: false,
    });
    expect(Date.parse(completion.finishedAt)).toBeGreaterThanOrEqual(
      Date.parse(completion.startedAt),
    );
  });

  it("reports a learning observer failure without changing successful collection outcome", async () => {
    const { client, acquirer } = fixture();
    const backgroundErrors: unknown[] = [];
    const runtime = new ControlledCollectionWorkerRuntime(client, acquirer, {
      async onCompleted() {
        throw new Error("learning control plane unavailable");
      },
      onBackgroundError(error) {
        backgroundErrors.push(error);
      },
    });

    await expect(runtime.runOnce()).resolves.toBe(true);
    expect(backgroundErrors).toHaveLength(1);
    expect(backgroundErrors[0]).toMatchObject({ message: "learning control plane unavailable" });
  });
});
