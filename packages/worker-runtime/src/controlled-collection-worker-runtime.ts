import type { CollectionArtifactAcquirer } from "./artifact-backed-collection-executor";
import { ArtifactBackedCollectionExecutor } from "./artifact-backed-collection-executor";
import type { HttpControlledCollectionClient } from "./http-controlled-collection-client";

export type ControlledCollectionWorkerOptions = {
  runtimeVersion?: string;
};

/**
 * Minimal external Worker loop for one governed claim.
 *
 * Claim/lease ownership remains in Worker Protocol v1. Connector-specific I/O is
 * injected via CollectionArtifactAcquirer, and all produced bytes must pass the
 * RawArtifact ingestion protocol before execution can complete.
 */
export class ControlledCollectionWorkerRuntime {
  private readonly runtimeVersion: string;

  constructor(
    private readonly client: HttpControlledCollectionClient,
    private readonly acquirer: CollectionArtifactAcquirer,
    options: ControlledCollectionWorkerOptions = {},
  ) {
    this.runtimeVersion = options.runtimeVersion ?? "1.0.0";
  }

  async runOnce(): Promise<boolean> {
    await this.client.heartbeat(this.runtimeVersion, []);
    const claim = await this.client.claim();
    if (!claim.job || !claim.lease || !claim.leaseToken) return false;

    await this.client.heartbeat(this.runtimeVersion, [claim.lease.id]);
    const executor = new ArtifactBackedCollectionExecutor(this.acquirer, this.client);
    try {
      await executor.execute({
        workerId: this.client.workerId,
        job: claim.job,
        lease: claim.lease,
        leaseToken: claim.leaseToken,
      });
      return true;
    } finally {
      await this.client.heartbeat(this.runtimeVersion, []);
    }
  }
}
