export type RuntimeEvent = {
  name: string;
  timestamp: string;
  attributes?: Record<string, string | number | boolean>;
};

export interface ObservabilityPort {
  emit(event: RuntimeEvent): Promise<void>;
}

export class MemoryObservability implements ObservabilityPort {
  readonly events: RuntimeEvent[] = [];

  async emit(event: RuntimeEvent): Promise<void> {
    this.events.push(event);
  }
}
