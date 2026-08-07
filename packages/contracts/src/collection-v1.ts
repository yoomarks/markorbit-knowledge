export const COLLECTION_VERSION = "collection-v1" as const;

export interface CollectionTarget {
  targetId: string;
  sourceId: string;
  locator: string;
}

export interface CollectionPlan {
  planId: string;
  targets: CollectionTarget[];
  createdAt: string;
}

export interface CollectionRun {
  runId: string;
  planId: string;
  status: "created" | "running" | "completed" | "failed";
  startedAt?: string;
  finishedAt?: string;
}
