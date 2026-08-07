import type { SourceAdapter } from "./source-adapter-port";

export class SourceRegistry {
  private readonly adapters = new Map<string, SourceAdapter>();

  register(adapter: SourceAdapter): void {
    this.adapters.set(adapter.sourceId, adapter);
  }

  resolve(sourceId: string): SourceAdapter | undefined {
    return this.adapters.get(sourceId);
  }

  list(): string[] {
    return [...this.adapters.keys()];
  }
}
