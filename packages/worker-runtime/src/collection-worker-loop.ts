export interface WorkerLoopOptions {
  pollIntervalMs?: number;
  maxIterations?: number;
}

type CurrentQueueConsumer = {
  consumeOnce(): Promise<boolean>;
};

type LegacyQueueConsumer = {
  consume(): Promise<unknown | null>;
};

type LegacyJobRunner = {
  run(job: unknown): Promise<unknown>;
};

export class CollectionWorkerLoop {
  constructor(
    private readonly consumer: CurrentQueueConsumer | LegacyQueueConsumer,
    private readonly runner?: LegacyJobRunner,
  ) {}

  async runOnce(): Promise<boolean> {
    if ("consumeOnce" in this.consumer) {
      return this.consumer.consumeOnce();
    }

    const job = await this.consumer.consume();
    if (job === null) return false;
    if (this.runner) await this.runner.run(job);
    return true;
  }

  async run(options: WorkerLoopOptions = {}): Promise<number> {
    const maxIterations = options.maxIterations ?? 1;
    let processed = 0;

    while (processed < maxIterations) {
      const didProcess = await this.runOnce();
      if (!didProcess) break;
      processed += 1;
    }

    return processed;
  }
}
