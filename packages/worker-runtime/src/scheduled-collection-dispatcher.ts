import type { CollectionSchedulerPort } from "./collection-scheduler-port";
import type { QueueExecutionPort } from "./queue-execution-port";

export type CollectionDispatchRequest = {
  sourceId: string;
  cursor?: string;
  metadata?: Record<string, unknown>;
};

export class ScheduledCollectionDispatcher {
  constructor(
    private readonly scheduler: CollectionSchedulerPort,
    private readonly queue: QueueExecutionPort,
  ) {}

  async dispatch(request: CollectionDispatchRequest): Promise<void> {
    const job = await this.scheduler.schedule(request);
    await this.queue.enqueue(job);
  }
}
