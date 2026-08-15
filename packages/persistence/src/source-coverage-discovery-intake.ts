import { createHash } from "node:crypto";
import type {
  SourceCandidate,
  SourceCoverageTarget,
  SourceDefinition,
  SourceDiscoveryBatch,
} from "@markorbit/contracts";
import type { SourceRepository } from "./index";
import { RegistryConflictError, RegistryError } from "./index";
import type { SourceCandidateRecord, SourceDiscoveryRepository } from "./source-discovery-registry";
import { evaluateSourceCoverage, getSourceCoverageTarget } from "./source-coverage-catalog";

export type CoverageDiscoveryIntakeState = "QUEUED" | "ALREADY_IN_DISCOVERY" | "ALREADY_COVERED";

export type CoverageDiscoveryIntakeResult = {
  workspaceId: string;
  targetId: string;
  state: CoverageDiscoveryIntakeState;
  candidate?: SourceCandidateRecord;
  sourceIds?: string[];
  batchId?: string;
};

export type CoverageDiscoveryIntakeDependencies = {
  sources: SourceRepository;
  discovery: SourceDiscoveryRepository;
  clock?: () => Date;
};

function listWorkspaceSources(
  repository: SourceRepository,
  workspaceId: string,
): SourceDefinition[] {
  const sources: SourceDefinition[] = [];
  let offset = 0;
  while (true) {
    const page = repository.list({ workspaceId, limit: 100, offset });
    sources.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) return sources;
  }
}

function stableId(prefix: "disc" | "cand" | "seed", workspaceId: string, targetId: string): string {
  const digest = createHash("sha256")
    .update(`${workspaceId}\u0000${targetId}`)
    .digest("hex")
    .slice(0, 32);
  return `${prefix}_${digest}`;
}

function operatorIntakeDefaults(target: SourceCoverageTarget) {
  return {
    category: target.category,
    authorityLevel: target.authorityLevel,
    jurisdictions: [target.jurisdiction],
    languages: [...target.languages],
    note: `Curated coverage gap for ${target.displayName}. Review in Discovery before enabling collection.`,
    tags: ["coverage-gap", `coverage-${target.family.toLowerCase()}`, `coverage-${target.id}`],
  };
}

function coverageProvenance(target: SourceCoverageTarget) {
  return {
    source: "SOURCE_COVERAGE_CATALOG",
    targetId: target.id,
    jurisdiction: target.jurisdiction,
    authorityName: target.authorityName,
    family: target.family,
    coverageTier: target.coverageTier,
    catalogState: target.catalogState,
    verifiedAt: target.verifiedAt,
    verificationEvidenceUri: target.verificationEvidenceUri,
    canonicalUri: target.canonicalUri,
    entrypoints: target.entrypoints.map((entrypoint) => ({ ...entrypoint })),
  };
}

export function queueSourceCoverageGapForDiscovery(
  input: { workspaceId: string; targetId: string },
  dependencies: CoverageDiscoveryIntakeDependencies,
): CoverageDiscoveryIntakeResult {
  const workspaceId = input.workspaceId.trim();
  const targetId = input.targetId.trim();
  if (!workspaceId) throw new RegistryError("WORKSPACE_ID_REQUIRED", "workspaceId is required");
  const target = getSourceCoverageTarget(targetId);
  if (!target) {
    throw new RegistryError(
      "SOURCE_COVERAGE_TARGET_NOT_FOUND",
      `Source coverage target ${targetId} was not found`,
      { targetId },
    );
  }
  if (target.catalogState !== "ACTIVE") {
    throw new RegistryConflictError(
      "SOURCE_COVERAGE_TARGET_NOT_ACTIVE",
      `Source coverage target ${target.id} is ${target.catalogState} and cannot enter Discovery`,
      { targetId: target.id, catalogState: target.catalogState },
    );
  }

  const sources = listWorkspaceSources(dependencies.sources, workspaceId);
  const registration = evaluateSourceCoverage(sources, [target])[0];
  if (registration?.state === "REGISTERED") {
    return {
      workspaceId,
      targetId: target.id,
      state: "ALREADY_COVERED",
      sourceIds: [...registration.sourceIds],
    };
  }

  const existing = dependencies.discovery.getCandidateByLocator(target.canonicalUri);
  if (existing) {
    return {
      workspaceId,
      targetId: target.id,
      state: "ALREADY_IN_DISCOVERY",
      candidate: existing,
      batchId: existing.batchId,
    };
  }

  const now = (dependencies.clock ?? (() => new Date()))().toISOString();
  const seed = dependencies.discovery.createSeed({
    seedId: stableId("seed", workspaceId, target.id),
    locator: target.canonicalUri,
    metadata: {
      source: "source-coverage-catalog",
      workspaceId,
      coverageIntake: coverageProvenance(target),
      operatorIntakeDefaults: operatorIntakeDefaults(target),
    },
  });
  const batch: SourceDiscoveryBatch = {
    batchId: stableId("disc", workspaceId, target.id),
    seeds: [
      {
        seedId: seed.seedId,
        locator: seed.locator,
        metadata: {
          source: "source-coverage-catalog",
          coverageTargetId: target.id,
        },
      },
    ],
    createdAt: now,
    constraints: {
      maxDepth: 0,
      maxCandidates: 1,
      sameHostOnly: true,
      discoverExternalLinks: false,
      maxExpansionGeneration: 0,
    },
    lineage: { generation: 0 },
  };
  dependencies.discovery.createBatch(batch);

  const candidate: SourceCandidate = {
    candidateId: stableId("cand", workspaceId, target.id),
    locator: target.canonicalUri,
    title: target.displayName,
    discoveredAt: now,
    status: "DISCOVERED",
    discoveredFrom: target.verificationEvidenceUri,
    discoveryMethod: "MANUAL",
    depth: 0,
    metadata: {
      coverageIntake: coverageProvenance(target),
      operatorIntakeDefaults: operatorIntakeDefaults(target),
    },
  };
  dependencies.discovery.completeBatch(batch.batchId, [candidate]);
  const queued =
    dependencies.discovery.getCandidate(candidate.candidateId) ??
    dependencies.discovery.getCandidateByLocator(target.canonicalUri);
  if (!queued) {
    throw new RegistryError(
      "SOURCE_COVERAGE_DISCOVERY_INTAKE_FAILED",
      `Coverage target ${target.id} did not produce a Discovery candidate`,
      { targetId: target.id },
    );
  }

  return {
    workspaceId,
    targetId: target.id,
    state: "QUEUED",
    candidate: queued,
    batchId: batch.batchId,
  };
}
