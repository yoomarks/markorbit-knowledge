export type SourceConfig = {
  sourceId: string;
  adapter: string;
  enabled: boolean;
  rateLimitPerMinute: number;
};

export class SourceConfigRegistry {
  private readonly configs = new Map<string, SourceConfig>();

  register(config: SourceConfig): void {
    this.configs.set(config.sourceId, config);
  }

  get(sourceId: string): SourceConfig | undefined {
    return this.configs.get(sourceId);
  }
}
