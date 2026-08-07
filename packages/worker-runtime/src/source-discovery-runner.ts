import type { SourceCandidate, SourceDiscoveryBatch } from "@markorbit/contracts";

export type SourceDiscoveryProvider = {
  discover(input: SourceDiscoveryBatch): Promise<SourceCandidate[]>;
};

export class SourceDiscoveryRunner {
  constructor(private readonly provider: SourceDiscoveryProvider) {}

  async run(batch: SourceDiscoveryBatch): Promise<SourceCandidate[]> {
    return this.provider.discover(batch);
  }
}
