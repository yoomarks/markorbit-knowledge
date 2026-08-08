import type { SourceCandidate, SourceDiscoveryBatch } from "@markorbit/contracts";
import { classifyDiscoveryCandidate } from "./discovery-candidate-intelligence";

export type SourceDiscoveryProvider = {
  discover(input: SourceDiscoveryBatch): Promise<SourceCandidate[]>;
};

function candidateKind(candidate: SourceCandidate): "PAGE" | "DOCUMENT" | "FEED" | undefined {
  const kind = candidate.metadata?.kind;
  return kind === "PAGE" || kind === "DOCUMENT" || kind === "FEED" ? kind : undefined;
}

function robotsAllowed(candidate: SourceCandidate): boolean | undefined {
  const value = candidate.metadata?.robotsAllowed;
  return typeof value === "boolean" ? value : undefined;
}

export function enrichDiscoveryCandidate(candidate: SourceCandidate): SourceCandidate {
  const intelligence = classifyDiscoveryCandidate({
    locator: candidate.locator,
    label: candidate.title,
    method: candidate.discoveryMethod,
    kind: candidateKind(candidate),
    depth: candidate.depth,
    robotsAllowed: robotsAllowed(candidate),
  });

  return {
    ...candidate,
    metadata: {
      ...(candidate.metadata ?? {}),
      ...intelligence,
      intelligenceVersion: "deterministic-v1",
    },
  };
}

export class SourceDiscoveryRunner {
  constructor(private readonly provider: SourceDiscoveryProvider) {}

  async run(batch: SourceDiscoveryBatch): Promise<SourceCandidate[]> {
    const candidates = await this.provider.discover(batch);
    return candidates.map(enrichDiscoveryCandidate);
  }
}
