export type QueueJob = {
  id: string;
  payload: unknown;
  priority?: number;
};

export interface QueueExecutionPort {
  enqueue(job: QueueJob): Promise<void>;
  dequeue(): Promise<QueueJob | null>;
  acknowledge(jobId: string): Promise<void>;
  retry(jobId: string): Promise<void>;
}
