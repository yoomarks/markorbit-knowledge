import { type CollectionQueueConsumer } from "./collection-queue-consumer";

export interface WorkerLoopOptions {
  pollIntervalMs?: number;
  maxIterations?: number;
}

export class CollectionWorkerLoop {
  constructor(private readonly consumer: CollectionQueueConsumer) {}

  async run(options: WorkerLoopOptions = {}): Promise<number> {
    const maxIterations = options.maxIterations ?? 1;
    let processed = 0;

    while (processed < maxIterations) {
      const result = await this.consumer.consume();
      if (!result) break;
      processed += 1;
    }

    return processed;
  }
}
