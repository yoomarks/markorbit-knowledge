import { afterEach, describe, expect, it, vi } from "vitest";
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
  type ControlledCollectionWorkerClient,
} from "../src/controlled-collection-worker-runtime";

afterEach(() => {
  vi.useRealTimers();
});

describe("ControlledCollectionWorkerRuntime", () => {
  it("renews and heartbeats an active lease during long acquisition", async () => {
    vi.useFakeTimers();

    const job = {
      planSnapshot: { output: { artifactKinds: ["HTML"] } },
    } as unknown as Job;
    const lease = { id: "lse_test" } as unknown as JobLease;

    let releaseAcquisition!: () => void;
    let markAcquisitionStarted!: () => void;
    const acquisitionStarted = new Promise<void>((resolve) => {
      markAcquisitionStarted = resolve;
    });
    const acquisitionRelease = new Promise<void>((resolve) => {
      releaseAcquisition = resolve;
    });

    const heartbeat = vi.fn(async () => undefined);
    const renewLease = vi.fn(async () => lease);
    const client: ControlledCollectionWorkerClient = {
      workerId: "wrk_test",
      heartbeat,
      renewLease,
      async claim() {
        return { job, lease, leaseToken: "mls_test" };
      },
      async start() {
        return {} as ExecutionAttempt;
      },
      async uploading() {},
      async createArtifactSession() {
        return { id: "ais_test" } as ArtifactIngestionSession;
      },
      async uploadArtifactContent() {},
      async finalizeArtifact() {
        return { id: "air_test" } as ArtifactIngestionReceipt;
      },
      async verifying() {},
      async complete() {},
      async fail() {},
    };

    const acquirer: CollectionArtifactAcquirer = {
      executor: { executorId: "test-acquirer", version: "1.0.0", mode: "PRODUCTION" },
      async acquire() {
        markAcquisitionStarted();
        await acquisitionRelease;
        return [
          {
            artifactKind: "HTML",
            mimeType: "text/html",
            originalName: "page.html",
            sourceUri: "https://www.uspto.gov/trademarks",
            content: new TextEncoder().encode("<html>USPTO</html>"),
          },
        ];
      },
    };

    const runtime = new ControlledCollectionWorkerRuntime(client, acquirer, {
      runtimeVersion: "1.0.0",
      keepAliveIntervalMs: 1_000,
    });

    const execution = runtime.runOnce();
    await acquisitionStarted;

    await vi.advanceTimersByTimeAsync(1_000);
    expect(renewLease).toHaveBeenCalledWith("lse_test", "mls_test");
    expect(heartbeat).toHaveBeenCalledWith("1.0.0", ["lse_test"]);

    releaseAcquisition();
    await execution;
    expect(heartbeat).toHaveBeenLastCalledWith("1.0.0", []);
  });

  it("reports keepalive failures without taking terminal-state authority", async () => {
    vi.useFakeTimers();

    const job = {
      planSnapshot: { output: { artifactKinds: ["HTML"] } },
    } as unknown as Job;
    const lease = { id: "lse_test" } as unknown as JobLease;
    let releaseAcquisition!: () => void;
    let markAcquisitionStarted!: () => void;
    const acquisitionStarted = new Promise<void>((resolve) => {
      markAcquisitionStarted = resolve;
    });
    const acquisitionRelease = new Promise<void>((resolve) => {
      releaseAcquisition = resolve;
    });
    const backgroundErrors: unknown[] = [];

    const client: ControlledCollectionWorkerClient = {
      workerId: "wrk_test",
      async heartbeat() {},
      async claim() {
        return { job, lease, leaseToken: "mls_test" };
      },
      async renewLease() {
        throw new Error("lease control plane unavailable");
      },
      async start() {
        return {} as ExecutionAttempt;
      },
      async uploading() {},
      async createArtifactSession() {
        return { id: "ais_test" } as ArtifactIngestionSession;
      },
      async uploadArtifactContent() {},
      async finalizeArtifact() {
        return { id: "air_test" } as ArtifactIngestionReceipt;
      },
      async verifying() {},
      async complete() {},
      async fail() {},
    };
    const acquirer: CollectionArtifactAcquirer = {
      executor: { executorId: "test-acquirer", version: "1.0.0", mode: "PRODUCTION" },
      async acquire() {
        markAcquisitionStarted();
        await acquisitionRelease;
        return [
          {
            artifactKind: "HTML",
            mimeType: "text/html",
            originalName: "page.html",
            sourceUri: "https://www.uspto.gov/trademarks",
            content: new TextEncoder().encode("<html>USPTO</html>"),
          },
        ];
      },
    };

    const runtime = new ControlledCollectionWorkerRuntime(client, acquirer, {
      keepAliveIntervalMs: 1_000,
      onBackgroundError(error) {
        backgroundErrors.push(error);
      },
    });
    const execution = runtime.runOnce();
    await acquisitionStarted;
    await vi.advanceTimersByTimeAsync(1_000);

    expect(backgroundErrors).toHaveLength(1);
    expect(backgroundErrors[0]).toBeInstanceOf(Error);

    releaseAcquisition();
    await execution;
  });
});
