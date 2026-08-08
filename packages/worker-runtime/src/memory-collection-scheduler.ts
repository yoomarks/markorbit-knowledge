import type {
  CollectionScheduleRequest,
  CollectionScheduleResult,
  CollectionSchedulerPort,
} from "./collection-scheduler-port";

export class MemoryCollectionScheduler implements CollectionSchedulerPort {
  private readonly requests: CollectionScheduleRequest[] = [];

  async schedule(request: CollectionScheduleRequest): Promise<CollectionScheduleResult> {
    this.requests.push(request);
    return {
      collectionRunId: `run-${request.collectionPlanId}-${this.requests.length}`,
      status: "QUEUED",
    };
  }

  list(): CollectionScheduleRequest[] {
    return [...this.requests];
  }
}
