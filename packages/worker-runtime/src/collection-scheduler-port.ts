export type CollectionScheduleRequest = {
  collectionPlanId: string;
  trigger: "MANUAL" | "SCHEDULED";
  metadata?: Record<string, unknown>;
};

export type CollectionScheduleResult = {
  collectionRunId: string;
  status: "QUEUED" | "STARTED";
};

/**
 * Runtime boundary for collection scheduling.
 * Scheduler decides when execution starts; it does not own collection state.
 */
export interface CollectionSchedulerPort {
  schedule(request: CollectionScheduleRequest): Promise<CollectionScheduleResult>;
}
