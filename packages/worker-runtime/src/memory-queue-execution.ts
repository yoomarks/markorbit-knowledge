import type { Job } from "@markorbit/contracts";
import type { QueueExecutionPort } from "./queue-execution-port";

export class MemoryQueueExecution implements QueueExecutionPort {
  private readonly queue: Job[] = [];

  async enqueue(job: Job): Promise<void> {
    this.queue.push(job);
  }

  async dequeue(): Promise<Job | null> {
    return this.queue.shift() ?? null;
  }

  size(): number {
    return this.queue.length;
  }
}
