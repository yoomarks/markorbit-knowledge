import { createHash } from "node:crypto";
import type { SourceCandidate, SourceDefinition, SourceDiscoveryBatch } from "@markorbit/contracts";
import type { SourceRepository } from "./index";
import { RegistryError, RegistryValidationError } from "./index";
import type { SourceCandidateRecord, SourceDiscoveryRepository } from "./source-discovery-registry";

const MAX_WAVE_TARGETS = 100;

export type ProductionValidationPriority = "P0" | "P1" | "P2";
export type ProductionValidationState = "PENDING_REAL_RUN" | "VALIDATED" | "BLOCKED";

export type ProductionValidationManifestTarget = {
  id: string;
  jurisdiction: string;
  authority: string;
  canonicalUri: string;
  sourceClass: "OFFICIAL_AUTHORITY";
  priority: ProductionValidationPriority;
  validationState: ProductionValidationState;
};

export type ProductionValidationManifest = {
  manifestVersion: "1.0";
  waveId: string;
  governance: {
    collectionAuthorizationRequired: true;
    discoveryDoesNotActivateSource: true;
    noAutomaticProductionScheduling: true;
    realObservationsOnly: true;
  };
  targets: ProductionValidationManifestTarget[];
};

export type ProductionValidationDiscoveryState =
  | "QUEUED"
  | "ALREADY_IN_DISCOVERY"
  | "ALREADY_REGISTERED";

export type ProductionValidationDiscoveryResult = {
  targetId: string;
  state: ProductionValidationDiscoveryState;
  candidate?: SourceCandidateRecord;
  sourceId?: string;
  batchId?: string;
};

export type ProductionValidationDiscoveryIntakeResult = {
  workspaceId: string;
  waveId: string;
  batchId?: string;
  results: ProductionValidationDiscoveryResult[];
  summary: Record<ProductionValidationDiscoveryState, number> & { total: number };
};

export type ProductionValidationDiscoveryDependencies = {
  sources: SourceRepository;
  discovery: SourceDiscoveryRepository;
  clock?: () => Date;
};

function stableId(prefix: "seed" | "disc" | "cand", ...parts: string[]): string {
  const digest = createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);
  return `${prefix}_${digest}`;
}

function canonicalUri(value: string, field: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new RegistryValidationError(`${field} must be a valid URL`);
  }
  if (url.protocol !== "https:") {
    throw new RegistryValidationError(`${field} must use https`);
  }
  url.hash = "";
  return url.toString();
}

function validateManifest(manifest: ProductionValidationManifest): ProductionValidationManifestTarget[] {
  if (manifest.manifestVersion !== "1.0") {
    throw new RegistryValidationError("Unsupported production validation manifestVersion");
  }
  if (!manifest.waveId?.trim()) {
    throw new RegistryValidationError("Production validation waveId is required");
  }
  if (
    manifest.governance?.collectionAuthorizationRequired !== true ||
    manifest.governance?.discoveryDoesNotActivateSource !== true ||
    manifest.governance?.noAutomaticProductionScheduling !== true ||
    manifest.governance?.realObservationsOnly !== true
  ) {
    throw new RegistryValidationError("Production validation governance boundaries are required");
  }
  if (!Array.isArray(manifest.targets) || manifest.targets.length === 0) {
    throw new RegistryValidationError("Production validation targets are required");
  }
  if (manifest.targets.length > MAX_WAVE_TARGETS) {
    throw new RegistryValidationError(
      `Production validation intake is limited to ${MAX_WAVE_TARGETS} targets per wave`,
    );
  }

  const ids = new Set<string>();
  const uris = new Set<string>();
  return manifest.targets.map((target, index) => {
    const id = target.id?.trim();
    if (!id) throw new RegistryValidationError(`targets[${index}].id is required`);
    if (ids.has(id)) throw new RegistryValidationError(`Duplicate target id: ${id}`);
    ids.add(id);
    if (target.sourceClass !== "OFFICIAL_AUTHORITY") {
      throw new RegistryValidationError(`${id}: production validation Wave 1 is official-only`);
    }
    const uri = canonicalUri(target.canonicalUri, `${id}.canonicalUri`);
    if (uris.has(uri)) throw new RegistryValidationError(`Duplicate canonicalUri: ${uri}`);
    uris.add(uri);
    return { ...target, id, canonicalUri: uri };
  });
}

function listWorkspaceSources(repository: SourceRepository, workspaceId: string): SourceDefinition[] {
  const sources: SourceDefinition[] = [];
  let offset = 0;
  while (true) {
    const page = repository.list({ workspaceId, limit: 100, offset });
    sources.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) return sources;
  }
}

function findRegisteredSource(
  sources: SourceDefinition[],
  target: ProductionValidationManifestTarget,
): SourceDefinition | undefined {
  return sources.find((source) => {
    const uris = [source.canonicalUri, ...source.entrypoints.map((entrypoint) => entrypoint.uri)].filter(
      (uri): uri is string => Boolean(uri),
    );
    return uris.some((uri) => {
      try {
        return canonicalUri(uri, "source URI") === target.canonicalUri;
      } catch {
        return false;
      }
    });
  });
}

function candidateMetadata(
  manifest: ProductionValidationManifest,
  target: ProductionValidationManifestTarget,
) {
  return {
    source: "production-validation-manifest",
    productionValidation: {
      waveId: manifest.waveId,
      targetId: target.id,
      jurisdiction: target.jurisdiction,
      authority: target.authority,
      sourceClass: target.sourceClass,
      priority: target.priority,
      validationState: target.validationState,
      collectionAuthorizationRequired: true,
      noAutomaticProductionScheduling: true,
    },
  };
}

export function queueProductionValidationWaveForDiscovery(
  input: { workspaceId: string; manifest: ProductionValidationManifest },
  dependencies: ProductionValidationDiscoveryDependencies,
): ProductionValidationDiscoveryIntakeResult {
  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId) throw new RegistryError("WORKSPACE_ID_REQUIRED", "workspaceId is required");
  const targets = validateManifest(input.manifest);
  const sources = listWorkspaceSources(dependencies.sources, workspaceId);
  const results: ProductionValidationDiscoveryResult[] = [];
  const toQueue: ProductionValidationManifestTarget[] = [];

  for (const target of targets) {
    const source = findRegisteredSource(sources, target);
    if (source) {
      results.push({ targetId: target.id, state: "ALREADY_REGISTERED", sourceId: source.id });
      continue;
    }
    const existing = dependencies.discovery.getCandidateByLocator(target.canonicalUri);
    if (existing) {
      results.push({
        targetId: target.id,
        state: "ALREADY_IN_DISCOVERY",
        candidate: existing,
        batchId: existing.batchId,
      });
      continue;
    }
    toQueue.push(target);
  }

  let batchId: string | undefined;
  if (toQueue.length > 0) {
    const now = (dependencies.clock ?? (() => new Date()))().toISOString();
    batchId = stableId(
      "disc",
      workspaceId,
      input.manifest.waveId,
      ...toQueue.map((target) => target.id).sort(),
    );
    const seeds = toQueue.map((target) =>
      dependencies.discovery.createSeed({
        seedId: stableId("seed", workspaceId, input.manifest.waveId, target.id),
        locator: target.canonicalUri,
        metadata: candidateMetadata(input.manifest, target),
      }),
    );
    const batch: SourceDiscoveryBatch = {
      batchId,
      seeds: seeds.map((seed) => ({
        seedId: seed.seedId,
        locator: seed.locator,
        metadata: seed.metadata,
      })),
      createdAt: now,
      constraints: {
        maxDepth: 0,
        maxCandidates: toQueue.length,
        maxFetches: 0,
        sameHostOnly: true,
        respectRobots: true,
        discoverSitemaps: false,
        discoverExternalLinks: false,
        maxExpansionGeneration: 0,
      },
      lineage: { generation: 0 },
    };
    dependencies.discovery.createBatch(batch);
    const candidates: SourceCandidate[] = toQueue.map((target) => ({
      candidateId: stableId("cand", workspaceId, input.manifest.waveId, target.id),
      locator: target.canonicalUri,
      title: target.authority,
      discoveredAt: now,
      status: "DISCOVERED",
      discoveredFrom: `production-validation:${input.manifest.waveId}`,
      discoveryMethod: "MANUAL",
      depth: 0,
      metadata: candidateMetadata(input.manifest, target),
    }));
    dependencies.discovery.completeBatch(batchId, candidates);

    for (const target of toQueue) {
      const candidate = dependencies.discovery.getCandidateByLocator(target.canonicalUri);
      if (!candidate) {
        throw new RegistryError(
          "PRODUCTION_VALIDATION_DISCOVERY_INTAKE_FAILED",
          `Production validation target ${target.id} did not produce a Discovery candidate`,
        );
      }
      results.push({
        targetId: target.id,
        state: "QUEUED",
        candidate,
        batchId,
      });
    }
  }

  const ordered = targets.map((target) => {
    const result = results.find((item) => item.targetId === target.id);
    if (!result) {
      throw new RegistryError(
        "PRODUCTION_VALIDATION_DISCOVERY_RESULT_MISSING",
        `Production validation target ${target.id} has no intake result`,
      );
    }
    return result;
  });
  const summary = {
    QUEUED: ordered.filter((result) => result.state === "QUEUED").length,
    ALREADY_IN_DISCOVERY: ordered.filter((result) => result.state === "ALREADY_IN_DISCOVERY").length,
    ALREADY_REGISTERED: ordered.filter((result) => result.state === "ALREADY_REGISTERED").length,
    total: ordered.length,
  };
  return {
    workspaceId,
    waveId: input.manifest.waveId,
    ...(batchId ? { batchId } : {}),
    results: ordered,
    summary,
  };
}
