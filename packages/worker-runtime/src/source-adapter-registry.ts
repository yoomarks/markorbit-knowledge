import type { SourceMetadataSchema } from "./source-metadata-schema";

export interface RegisteredSourceAdapter {
  metadata: SourceMetadataSchema;
  collect(input: unknown): Promise<unknown>;
}

export class SourceAdapterRegistry {
  private adapters = new Map<string, RegisteredSourceAdapter>();

  register(adapter: RegisteredSourceAdapter): void {
    this.adapters.set(adapter.metadata.sourceId, adapter);
  }

  get(sourceId: string): RegisteredSourceAdapter | undefined {
    return this.adapters.get(sourceId);
  }
}
