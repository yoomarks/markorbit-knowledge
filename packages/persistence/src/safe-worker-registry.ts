import { RegistryConflictError } from "./index";
import {
  SqliteWorkerRegistryRepository as BaseSqliteWorkerRegistryRepository,
  type ClaimResult,
  type CreateWorkerInput,
  type CredentialRotationResult,
  type HeartbeatInput,
  type LeaseListFilters,
  type LeaseListResult,
  type UpdateWorkerInput,
  type WorkerCreationResult,
  type WorkerListFilters,
  type WorkerListResult,
  type WorkerRegistryRepository,
} from "./worker-registry";
import type { JobLease, WorkerDefinition, WorkerRuntimeView } from "@markorbit/contracts";

export {
  DEFAULT_HEARTBEAT_CLOCK_SKEW_MS,
  DEFAULT_HEARTBEAT_FRESHNESS_MS,
  DEFAULT_LEASE_DURATION_MS,
  DEFAULT_MAX_LEASE_LIFETIME_MS,
  LeaseNotFoundError,
  WorkerAuthenticationError,
  WorkerAuthorizationError,
  WorkerNotFoundError,
  assertHeartbeatInput,
  assertLeaseFilterValues,
  assertWorkerListFilters,
  ensureWorkerRegistry,
  generateHeartbeatId,
  generateLeaseId,
  generateWorkerId,
  workerProtocolWritesOnlyLeaseStates,
} from "./worker-registry";

export type {
  ClaimResult,
  CreateWorkerInput,
  CredentialRotationResult,
  HeartbeatInput,
  LeaseListFilters,
  LeaseListResult,
  UpdateWorkerInput,
  WorkerCreationResult,
  WorkerListFilters,
  WorkerListResult,
  WorkerProtocolOptions,
  WorkerRegistryRepository,
  WorkerStatusSummary,
} from "./worker-registry";

/**
 * Public SQLite Worker Registry adapter.
 *
 * The underlying lease implementation performs authentication and token checks
 * before deciding that a lease has expired. When it reports an expiry conflict,
 * this facade immediately runs the idempotent reap transaction so the durable
 * lease and Job state reflect the already-observed expiry before the error is
 * returned to the caller.
 */
export class SqliteWorkerRegistryRepository implements WorkerRegistryRepository {
  private readonly inner: BaseSqliteWorkerRegistryRepository;

  constructor(...args: ConstructorParameters<typeof BaseSqliteWorkerRegistryRepository>) {
    this.inner = new BaseSqliteWorkerRegistryRepository(...args);
  }

  create(input: CreateWorkerInput): WorkerCreationResult {
    return this.inner.create(input);
  }

  getById(id: string): WorkerRuntimeView | null {
    return this.inner.getById(id);
  }

  list(filters?: WorkerListFilters): WorkerListResult {
    return this.inner.list(filters);
  }

  update(id: string, input: UpdateWorkerInput, expectedUpdatedAt: string): WorkerRuntimeView {
    return this.inner.update(id, input, expectedUpdatedAt);
  }

  rotateCredential(id: string): CredentialRotationResult {
    return this.inner.rotateCredential(id);
  }

  verifyCredential(workerId: string, credential: string): WorkerDefinition {
    return this.inner.verifyCredential(workerId, credential);
  }

  verifyLease(workerId: string, credential: string, leaseId: string, leaseToken: string): JobLease {
    return this.inner.verifyLease(workerId, credential, leaseId, leaseToken);
  }

  heartbeat(input: HeartbeatInput, credential: string): WorkerRuntimeView {
    return this.inner.heartbeat(input, credential);
  }

  claim(workerId: string, credential: string): ClaimResult {
    return this.inner.claim(workerId, credential);
  }

  claimSpecific(workerId: string, credential: string, jobId: string): ClaimResult {
    return this.inner.claimSpecific(workerId, credential, jobId);
  }

  renewLease(workerId: string, credential: string, leaseId: string, leaseToken: string): JobLease {
    try {
      return this.inner.renewLease(workerId, credential, leaseId, leaseToken);
    } catch (error) {
      if (
        error instanceof RegistryConflictError &&
        (error.code === "LEASE_EXPIRED" || error.code === "LEASE_MAX_LIFETIME_REACHED")
      ) {
        this.inner.reapExpired();
      }
      throw error;
    }
  }

  releaseLease(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    reason?: string,
  ): JobLease {
    return this.inner.releaseLease(workerId, credential, leaseId, leaseToken, reason);
  }

  reapExpired(): number {
    return this.inner.reapExpired();
  }

  listLeases(filters?: LeaseListFilters): LeaseListResult {
    return this.inner.listLeases(filters);
  }
}
