import type { CollectionJobRunner } from "./collection-job-runner";

export interface CollectionQueueMessage {
  jobId: string;
  sourceId: string;
}

export interface CollectionQueuePort {
  receive(): Promise<CollectionQueueMessage | null>;
  ack(message: CollectionQueueMessage): Promise<void>;
}

export class CollectionQueueConsumer {
  constructor(
    private readonly queue: CollectionQueuePort,
    private readonly runner: CollectionJobRunner,
  ) {}

  async consumeOnce(): Promise<boolean> {
    const message = await this.queue.receive();
    if (!message) return false;

    await this.runner.run(message);
    await this.queue.ack(message);
    return true;
  }
}
