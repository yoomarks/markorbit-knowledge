import type { SourceMetadataSchema } from "./source-metadata-schema";

export interface SourceAdapter {
  metadata: SourceMetadataSchema;
  collect(input: unknown): Promise<unknown>;
}

export class SourceAdapterRegistry {
  private adapters = new Map<string, SourceAdapter>();

  register(adapter: SourceAdapter): void {
    this.adapters.set(adapter.metadata.sourceId, adapter);
  }

  get(sourceId: string): SourceAdapter | undefined {
    return this.adapters.get(sourceId);
  }
}
