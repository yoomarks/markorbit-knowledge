import type { SourceCandidate, SourceDefinition } from "@markorbit/contracts";

export class SourceRegistry {
  private readonly definitions = new Map<string, SourceDefinition>();
  private readonly candidates = new Map<string, SourceCandidate>();

  register(definition: SourceDefinition): SourceDefinition {
    this.definitions.set(definition.id, definition);
    return definition;
  }

  addCandidate(candidate: SourceCandidate): SourceCandidate {
    this.candidates.set(candidate.candidateId, candidate);
    return candidate;
  }

  get(sourceId: string): SourceDefinition | undefined {
    return this.definitions.get(sourceId);
  }

  list(): SourceDefinition[] {
    return [...this.definitions.values()];
  }

  listCandidates(): SourceCandidate[] {
    return [...this.candidates.values()];
  }
}
