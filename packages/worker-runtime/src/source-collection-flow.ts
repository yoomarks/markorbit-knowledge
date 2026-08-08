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

/**
 * Bridges discovery to collection without collapsing the human review gate.
 * Fresh DISCOVERED/REVIEWED candidates are returned for review; only candidates
 * already carrying the explicit ACCEPTED state may be handed to a collection
 * planner. Production admin review persists that transition before creating the
 * governed SourceDefinition and paused Collection Plan.
 */
export class SourceCollectionFlow {
  constructor(
    private readonly discovery: SourceDiscoveryRunner,
    private readonly planner: CollectionPlanner,
  ) {}

  async run(batch: SourceDiscoveryBatch): Promise<SourceCollectionResult> {
    const candidates = await this.discovery.run(batch);
    const accepted = candidates.filter((candidate) => candidate.status === "ACCEPTED");
    const plans = await Promise.all(
      accepted.map((candidate) => this.planner.createPlan(candidate)),
    );

    return { candidates, plans };
  }
}
