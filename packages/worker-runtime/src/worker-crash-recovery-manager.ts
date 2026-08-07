export type WorkerLeaseState = "ACTIVE" | "EXPIRED" | "RECOVERED";

export interface WorkerLeaseRecord {
  jobId: string;
  workerId: string;
  heartbeatAt: number;
  expiresAt: number;
  state: WorkerLeaseState;
}

export class WorkerCrashRecoveryManager {
  constructor(private readonly now: () => number = () => Date.now()) {}

  recoverExpiredLeases(records: WorkerLeaseRecord[]): WorkerLeaseRecord[] {
    const current = this.now();

    return records.map((record) => {
      if (record.state === "ACTIVE" && record.expiresAt < current) {
        return {
          ...record,
          state: "RECOVERED",
        };
      }

      return record;
    });
  }
}
