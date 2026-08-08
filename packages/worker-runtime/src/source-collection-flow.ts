import type {
  SourceCandidate,
  SourceDiscoveryBatch,
  CollectionRegistryPlan,
} from "@markorbit/contracts";
import { SourceDiscoveryRunner } from "./source-discovery-runner";

export type CollectionPlanner = {
  createPlan(candidate: SourceCandidate): Promise<CollectionRegistryPlan>;
};

export type SourceCollectionResult = {
  candidates: SourceCandidate[];
  plans: CollectionRegistryPlan[];
};

export class SourceCollectionFlow {
  constructor(
    private readonly discovery: SourceDiscoveryRunner,
    private readonly planner: CollectionPlanner,
  ) {}

  async run(batch: SourceDiscoveryBatch): Promise<SourceCollectionResult> {
    const candidates = await this.discovery.run(batch);
    const plans = await Promise.all(
      candidates.map((candidate) => this.planner.createPlan(candidate)),
    );

    return { candidates, plans };
  }
}
