export type WorkerSlot = {
  workerId: string;
  acquiredAt: number;
};

export class WorkerConcurrencyController {
  private readonly active = new Map<string, WorkerSlot>();

  constructor(private readonly limit: number) {}

  acquire(workerId: string): boolean {
    if (this.active.has(workerId)) return true;
    if (this.active.size >= this.limit) return false;

    this.active.set(workerId, {
      workerId,
      acquiredAt: Date.now(),
    });

    return true;
  }

  release(workerId: string): void {
    this.active.delete(workerId);
  }

  getActiveCount(): number {
    return this.active.size;
  }
}
