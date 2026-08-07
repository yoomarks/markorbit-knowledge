import type { CollectionSchedulerPort } from "./collection-scheduler-port";

export type ScheduledCollectionJob = {
  sourceId: string;
  runAt: Date;
};

export class MemoryCollectionScheduler implements CollectionSchedulerPort {
  private readonly jobs: ScheduledCollectionJob[] = [];

  schedule(job: ScheduledCollectionJob): void {
    this.jobs.push(job);
  }

  list(): ScheduledCollectionJob[] {
    return [...this.jobs];
  }
}
