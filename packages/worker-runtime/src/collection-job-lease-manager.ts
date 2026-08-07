export interface CollectionJobLease {
  jobId: string;
  workerId: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface CollectionJobLeaseManager {
  acquire(jobId: string, workerId: string, ttlMs: number): CollectionJobLease | null;
  release(jobId: string, workerId: string): boolean;
  isActive(jobId: string): boolean;
}

export class MemoryCollectionJobLeaseManager implements CollectionJobLeaseManager {
  private readonly leases = new Map<string, CollectionJobLease>();

  acquire(jobId: string, workerId: string, ttlMs: number): CollectionJobLease | null {
    const current = this.leases.get(jobId);
    if (current && new Date(current.expiresAt).getTime() > Date.now()) {
      return null;
    }

    const now = Date.now();
    const lease: CollectionJobLease = {
      jobId,
      workerId,
      acquiredAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString(),
    };

    this.leases.set(jobId, lease);
    return lease;
  }

  release(jobId: string, workerId: string): boolean {
    const lease = this.leases.get(jobId);
    if (!lease || lease.workerId !== workerId) return false;

    this.leases.delete(jobId);
    return true;
  }

  isActive(jobId: string): boolean {
    const lease = this.leases.get(jobId);
    return !!lease && new Date(lease.expiresAt).getTime() > Date.now();
  }
}
