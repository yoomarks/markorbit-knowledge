export interface WorkerHeartbeat {
  workerId: string;
  lastHeartbeatAt: Date;
  status: "ACTIVE" | "STOPPED";
}

export class WorkerHeartbeatManager {
  private readonly workers = new Map<string, WorkerHeartbeat>();

  heartbeat(workerId: string): WorkerHeartbeat {
    const record: WorkerHeartbeat = {
      workerId,
      lastHeartbeatAt: new Date(),
      status: "ACTIVE",
    };

    this.workers.set(workerId, record);
    return record;
  }

  get(workerId: string): WorkerHeartbeat | undefined {
    return this.workers.get(workerId);
  }

  stop(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.status = "STOPPED";
    }
  }
}
