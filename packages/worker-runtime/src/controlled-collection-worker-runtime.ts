import type { JobLease } from "@markorbit/contracts";
import type {
  ArtifactBackedExecutionClient,
  CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import { ArtifactBackedCollectionExecutor } from "./artifact-backed-collection-executor";
import type { ControlledWorkerClaim } from "./http-controlled-collection-client";

export interface ControlledCollectionWorkerClient extends ArtifactBackedExecutionClient {
  readonly workerId: string;
  heartbeat(runtimeVersion: string, activeLeaseIds?: string[]): Promise<void>;
  claim(): Promise<ControlledWorkerClaim>;
  renewLease(leaseId: string, leaseToken: string): Promise<JobLease>;
}

export type ControlledCollectionWorkerOptions = {
  runtimeVersion?: string;
  keepAliveIntervalMs?: number;
  onBackgroundError?: (error: unknown) => void;
};

/**
 * External Worker loop for one governed claim.
 *
 * Claim/lease ownership remains in Worker Protocol v1. Connector-specific I/O is
 * injected via CollectionArtifactAcquirer, and all produced bytes must pass the
 * RawArtifact ingestion protocol before execution can complete.
 *
 * Long-running production acquisition renews the lease and reports an active
 * heartbeat in the background. Keepalive failures are surfaced through the
 * optional callback but do not silently rewrite Job state; the control plane
 * remains authoritative for lease expiry and reconciliation.
 */
export class ControlledCollectionWorkerRuntime {
  private readonly runtimeVersion: string;
  private readonly keepAliveIntervalMs: number;
  private readonly onBackgroundError?: (error: unknown) => void;

  constructor(
    private readonly client: ControlledCollectionWorkerClient,
    private readonly acquirer: CollectionArtifactAcquirer,
    options: ControlledCollectionWorkerOptions = {},
  ) {
    this.runtimeVersion = options.runtimeVersion ?? "1.0.0";
    this.keepAliveIntervalMs = options.keepAliveIntervalMs ?? 30_000;
    if (!Number.isInteger(this.keepAliveIntervalMs) || this.keepAliveIntervalMs < 1_000) {
      throw new Error("keepAliveIntervalMs must be an integer greater than or equal to 1000");
    }
    this.onBackgroundError = options.onBackgroundError;
  }

  private startKeepAlive(lease: JobLease, leaseToken: string): () => void {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pulse = async () => {
      if (stopped) return;
      try {
        await this.client.renewLease(lease.id, leaseToken);
        await this.client.heartbeat(this.runtimeVersion, [lease.id]);
      } catch (error) {
        this.onBackgroundError?.(error);
      } finally {
        if (!stopped) timer = setTimeout(pulse, this.keepAliveIntervalMs);
      }
    };

    timer = setTimeout(pulse, this.keepAliveIntervalMs);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }

  async runOnce(): Promise<boolean> {
    await this.client.heartbeat(this.runtimeVersion, []);
    const claim = await this.client.claim();
    if (!claim.job || !claim.lease || !claim.leaseToken) return false;

    await this.client.heartbeat(this.runtimeVersion, [claim.lease.id]);
    const stopKeepAlive = this.startKeepAlive(claim.lease, claim.leaseToken);
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
      stopKeepAlive();
      try {
        await this.client.heartbeat(this.runtimeVersion, []);
      } catch (error) {
        this.onBackgroundError?.(error);
      }
    }
  }
}
