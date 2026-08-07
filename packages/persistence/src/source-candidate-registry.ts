import type { SourceCandidate } from "@markorbit/contracts";

export interface SourceCandidateRepository {
  save(candidate: SourceCandidate): SourceCandidate;
  list(): SourceCandidate[];
}

export class InMemorySourceCandidateRepository implements SourceCandidateRepository {
  private readonly items = new Map<string, SourceCandidate>();

  save(candidate: SourceCandidate): SourceCandidate {
    this.items.set(candidate.id, candidate);
    return candidate;
  }

  list(): SourceCandidate[] {
    return [...this.items.values()];
  }
}
