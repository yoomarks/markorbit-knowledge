import type { CollectionSchedulerPort } from "./collection-scheduler-port";
import type { QueueExecutionPort } from "./queue-execution-port";

export type CollectionDispatchRequest = {
  collectionPlanId: string;
  sourceId?: string;
  cursor?: string;
  metadata?: Record<string, unknown>;
};

export class ScheduledCollectionDispatcher {
  constructor(
    private readonly scheduler: CollectionSchedulerPort,
    private readonly queue: QueueExecutionPort,
  ) {}

  async dispatch(request: CollectionDispatchRequest): Promise<void> {
    const schedule = await this.scheduler.schedule({
      collectionPlanId: request.collectionPlanId,
      trigger: "SCHEDULED",
      metadata: request.metadata,
    });

    await this.queue.enqueue({
      id: schedule.collectionRunId,
      payload: {
        collectionPlanId: request.collectionPlanId,
        sourceId: request.sourceId,
        cursor: request.cursor,
        schedule,
      },
    });
  }
}
