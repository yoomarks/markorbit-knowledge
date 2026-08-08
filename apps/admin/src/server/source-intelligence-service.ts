import { RegistryNotFoundError, type SourceRepository } from "@markorbit/persistence";
import type { RawArtifactRepository, RawArtifactView } from "@markorbit/persistence/raw-artifacts";
import type { SourceGraphRepository } from "@markorbit/persistence/source-graph";
import type { SourceIntelligenceRepository } from "@markorbit/persistence/source-intelligence";
import {
  evaluateSourceIntelligence,
  projectSourceIntelligenceV2,
} from "@markorbit/worker-runtime";
import type {
  SourceGraphNode,
  SourceIntelligenceAssessment,
  SourceIntelligenceAssessmentV2,
} from "@markorbit/contracts";

const RELEVANT_TOPICS = new Set(["TRADEMARKS", "SEARCH", "FEES", "FORMS", "GUIDANCE", "LEGAL"]);

export type SourceIntelligenceServiceDependencies = {
  sources: Pick<SourceRepository, "getById">;
  graph: Pick<SourceGraphRepository, "snapshotBySourceId">;
  artifacts: Pick<RawArtifactRepository, "list">;
  intelligence: SourceIntelligenceRepository;
  now?: () => string;
};

function isRelevantContentNode(node: SourceGraphNode): boolean {
  if (node.kind === "DOCUMENT") return true;
  return node.kind === "PAGE" && typeof node.topic === "string" && RELEVANT_TOPICS.has(node.topic);
}

function collectArtifacts(
  repository: Pick<RawArtifactRepository, "list">,
  sourceId: string,
): RawArtifactView[] {
  const items: RawArtifactView[] = [];
  let offset = 0;
  for (;;) {
    const page = repository.list({ sourceId, limit: 100, offset });
    items.push(...page.items);
    offset += page.items.length;
    if (offset >= page.total || page.items.length === 0) return items;
  }
}

export class SourceIntelligenceService {
  private readonly now: () => string;

  constructor(private readonly dependencies: SourceIntelligenceServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  latest(sourceId: string): SourceIntelligenceAssessment | null {
    return this.dependencies.intelligence.latestForSource(sourceId);
  }

  latestV2(sourceId: string): SourceIntelligenceAssessmentV2 | null {
    const latest = this.latest(sourceId);
    return latest ? projectSourceIntelligenceV2(latest) : null;
  }

  assess(sourceId: string): SourceIntelligenceAssessment {
    const source = this.dependencies.sources.getById(sourceId);
    if (!source) throw new RegistryNotFoundError(sourceId);
    const graph = this.dependencies.graph.snapshotBySourceId(sourceId);
    const artifacts = collectArtifacts(this.dependencies.artifacts, sourceId);
    const previous = this.dependencies.intelligence.latestForSource(sourceId);
    const nodes = graph?.nodes ?? [];
    const contentNodes = nodes.filter((node) => node.kind === "PAGE" || node.kind === "DOCUMENT");
    const hashes = new Set(artifacts.map((view) => view.artifact.binaryHash.value));
    const rawArtifactBytes = artifacts.reduce((sum, view) => sum + view.artifact.sizeBytes, 0);
    const latestCapturedAt = artifacts.reduce<string | undefined>((latest, view) => {
      if (!latest || Date.parse(view.artifact.capturedAt) > Date.parse(latest))
        return view.artifact.capturedAt;
      return latest;
    }, undefined);

    const evaluated = evaluateSourceIntelligence({
      workspaceId: source.workspaceId,
      sourceId: source.id,
      ...(graph?.profile.id ? { profileId: graph.profile.id } : {}),
      assessedAt: this.now(),
      snapshot: {
        sourceCategory: source.category,
        sourceStatus: source.status,
        explicitAuthorityLevel: source.authorityLevel,
        graphNodeCount: nodes.length,
        contentNodeCount: contentNodes.length,
        relevantContentNodeCount: contentNodes.filter(isRelevantContentNode).length,
        retainedNodeCount: nodes.filter((node) => node.reviewState === "RETAINED").length,
        rawProvenanceNodeCount: nodes.filter((node) =>
          node.provenance.some((provenance) => provenance.kind === "RAW_ARTIFACT"),
        ).length,
        rawArtifactCount: artifacts.length,
        distinctArtifactHashCount: hashes.size,
        rawArtifactBytes,
        ...(latestCapturedAt ? { latestCapturedAt } : {}),
        ...(previous
          ? {
              previousAssessmentId: previous.id,
              previousGraphNodeCount: previous.input.graphNodeCount,
              previousDistinctArtifactHashCount: previous.input.distinctArtifactHashCount,
            }
          : {}),
      },
    });

    return this.dependencies.intelligence.save(evaluated);
  }

  assessV2(sourceId: string): SourceIntelligenceAssessmentV2 {
    return projectSourceIntelligenceV2(this.assess(sourceId));
  }
}
