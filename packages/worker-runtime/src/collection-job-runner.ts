import { type SourceAdapterPort } from "./source-adapter-port";

export type CollectionJob = {
  sourceId: string;
  payload: unknown;
};

export type CollectionJobResult = {
  sourceId: string;
  success: boolean;
  output?: unknown;
  error?: string;
};

export class CollectionJobRunner {
  constructor(private readonly adapters: Map<string, SourceAdapterPort>) {}

  async run(job: CollectionJob): Promise<CollectionJobResult> {
    const adapter = this.adapters.get(job.sourceId);
    if (!adapter) {
      return { sourceId: job.sourceId, success: false, error: "SOURCE_ADAPTER_NOT_FOUND" };
    }

    try {
      const output = await adapter.collect(job.payload);
      return { sourceId: job.sourceId, success: true, output };
    } catch (error) {
      return {
        sourceId: job.sourceId,
        success: false,
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      };
    }
  }
}
