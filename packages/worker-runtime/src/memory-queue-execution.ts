import type { QueueExecutionPort, QueueJob } from "./queue-execution-port";

export class MemoryQueueExecution implements QueueExecutionPort {
  private readonly queue: QueueJob[] = [];
  private readonly inFlight = new Map<string, QueueJob>();

  async enqueue(job: QueueJob): Promise<void> {
    this.queue.push(job);
  }

  async dequeue(): Promise<QueueJob | null> {
    const job = this.queue.shift() ?? null;
    if (job) this.inFlight.set(job.id, job);
    return job;
  }

  async acknowledge(jobId: string): Promise<void> {
    this.inFlight.delete(jobId);
  }

  async retry(jobId: string): Promise<void> {
    const job = this.inFlight.get(jobId);
    if (!job) return;
    this.inFlight.delete(jobId);
    this.queue.unshift(job);
  }

  size(): number {
    return this.queue.length;
  }
}
