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

const MAX_BATCH_TARGETS = 100;

export type CoverageDiscoveryIntakeState = "QUEUED" | "ALREADY_IN_DISCOVERY" | "ALREADY_COVERED";

export type CoverageDiscoveryIntakeResult = {
  workspaceId: string;
  targetId: string;
  state: CoverageDiscoveryIntakeState;
  candidate?: SourceCandidateRecord;
  sourceIds?: string[];
  batchId?: string;
};

export type CoverageDiscoveryBatchIntakeResult = {
  workspaceId: string;
  requestedTargetIds: string[];
  results: CoverageDiscoveryIntakeResult[];
  summary: Record<CoverageDiscoveryIntakeState, number> & { total: number };
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

function assertWorkspaceId(value: string): string {
  const workspaceId = value.trim();
  if (!workspaceId) throw new RegistryError("WORKSPACE_ID_REQUIRED", "workspaceId is required");
  return workspaceId;
}

function requireActiveTarget(targetId: string): SourceCoverageTarget {
  const target = getSourceCoverageTarget(targetId.trim());
  if (!target) {
    throw new RegistryError(
      "SOURCE_COVERAGE_TARGET_NOT_FOUND",
      `Source coverage target ${targetId.trim()} was not found`,
      { targetId: targetId.trim() },
    );
  }
  if (target.catalogState !== "ACTIVE") {
    throw new RegistryConflictError(
      "SOURCE_COVERAGE_TARGET_NOT_ACTIVE",
      `Source coverage target ${target.id} is ${target.catalogState} and cannot enter Discovery`,
      { targetId: target.id, catalogState: target.catalogState },
    );
  }
  return target;
}

function alreadyCovered(
  workspaceId: string,
  target: SourceCoverageTarget,
  sourceIds: string[],
): CoverageDiscoveryIntakeResult {
  return {
    workspaceId,
    targetId: target.id,
    state: "ALREADY_COVERED",
    sourceIds: [...sourceIds],
  };
}

function queueUnregisteredTarget(
  workspaceId: string,
  target: SourceCoverageTarget,
  dependencies: CoverageDiscoveryIntakeDependencies,
): CoverageDiscoveryIntakeResult {
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

export function queueSourceCoverageGapForDiscovery(
  input: { workspaceId: string; targetId: string },
  dependencies: CoverageDiscoveryIntakeDependencies,
): CoverageDiscoveryIntakeResult {
  const workspaceId = assertWorkspaceId(input.workspaceId);
  const target = requireActiveTarget(input.targetId);
  const sources = listWorkspaceSources(dependencies.sources, workspaceId);
  const registration = evaluateSourceCoverage(sources, [target])[0];
  if (registration?.state === "REGISTERED") {
    return alreadyCovered(workspaceId, target, registration.sourceIds);
  }
  return queueUnregisteredTarget(workspaceId, target, dependencies);
}

export function queueSourceCoverageGapsForDiscovery(
  input: { workspaceId: string; targetIds: string[] },
  dependencies: CoverageDiscoveryIntakeDependencies,
): CoverageDiscoveryBatchIntakeResult {
  const workspaceId = assertWorkspaceId(input.workspaceId);
  if (!Array.isArray(input.targetIds) || input.targetIds.length === 0) {
    throw new RegistryError(
      "SOURCE_COVERAGE_TARGET_IDS_REQUIRED",
      "targetIds must contain at least one Source Coverage target",
    );
  }
  const targetIds = [
    ...new Set(input.targetIds.map((targetId) => targetId.trim()).filter(Boolean)),
  ];
  if (targetIds.length === 0) {
    throw new RegistryError(
      "SOURCE_COVERAGE_TARGET_IDS_REQUIRED",
      "targetIds must contain at least one Source Coverage target",
    );
  }
  if (targetIds.length > MAX_BATCH_TARGETS) {
    throw new RegistryError(
      "SOURCE_COVERAGE_BATCH_LIMIT_EXCEEDED",
      `Coverage Discovery intake is limited to ${MAX_BATCH_TARGETS} unique targets per request`,
      { maxTargets: MAX_BATCH_TARGETS, requestedTargets: targetIds.length },
    );
  }

  // Validate the complete request before mutating Discovery so a bad target cannot
  // leave a partially queued batch behind.
  const targets = targetIds.map(requireActiveTarget);
  const sources = listWorkspaceSources(dependencies.sources, workspaceId);
  const registrations = new Map(
    evaluateSourceCoverage(sources, targets).map((registration) => [
      registration.targetId,
      registration,
    ]),
  );
  const results = targets.map((target) => {
    const registration = registrations.get(target.id);
    return registration?.state === "REGISTERED"
      ? alreadyCovered(workspaceId, target, registration.sourceIds)
      : queueUnregisteredTarget(workspaceId, target, dependencies);
  });

  return {
    workspaceId,
    requestedTargetIds: targets.map((target) => target.id),
    results,
    summary: {
      total: results.length,
      QUEUED: results.filter((result) => result.state === "QUEUED").length,
      ALREADY_IN_DISCOVERY: results.filter((result) => result.state === "ALREADY_IN_DISCOVERY")
        .length,
      ALREADY_COVERED: results.filter((result) => result.state === "ALREADY_COVERED").length,
    },
  };
}
