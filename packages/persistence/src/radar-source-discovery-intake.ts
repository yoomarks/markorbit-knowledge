import { createHash } from "node:crypto";
import type {
  RadarCandidateProposal,
  RadarSourceIntakePlan,
  RadarSourceProposal,
  SourceCandidate,
  SourceDefinition,
  SourceDiscoveryBatch,
} from "@markorbit/contracts";
import type { SourceRepository } from "./index";
import { RegistryError } from "./index";
import type {
  SourceCandidateRecord,
  SourceDiscoveryRepository,
} from "./source-discovery-registry";

const MAX_RADAR_INTAKE_ITEMS = 250;

export type RadarDiscoveryIntakeState =
  | "QUEUED"
  | "ALREADY_IN_DISCOVERY"
  | "ALREADY_COVERED"
  | "SKIPPED_BLOCKED"
  | "SKIPPED_NO_LOCATOR";

export type RadarDiscoveryIntakeResult = {
  workspaceId: string;
  externalId: string;
  itemType: "SOURCE_PROPOSAL" | "CANDIDATE_PROPOSAL";
  state: RadarDiscoveryIntakeState;
  locator?: string;
  candidate?: SourceCandidateRecord;
  sourceIds?: string[];
  batchId?: string;
  reason?: string;
};

export type RadarDiscoveryBatchIntakeResult = {
  workspaceId: string;
  intakeVersion: RadarSourceIntakePlan["version"];
  requestedItems: number;
  results: RadarDiscoveryIntakeResult[];
  summary: Record<RadarDiscoveryIntakeState, number> & { total: number };
};

export type RadarDiscoveryIntakeDependencies = {
  sources: SourceRepository;
  discovery: SourceDiscoveryRepository;
  clock?: () => Date;
};

type QueueableRadarItem =
  | { itemType: "SOURCE_PROPOSAL"; source: RadarSourceProposal; locator?: string }
  | { itemType: "CANDIDATE_PROPOSAL"; candidate: RadarCandidateProposal; locator?: string };

function assertWorkspaceId(value: string): string {
  const workspaceId = value.trim();
  if (!workspaceId) throw new RegistryError("WORKSPACE_ID_REQUIRED", "workspaceId is required");
  return workspaceId;
}

function stableId(
  prefix: "radar_seed" | "radar_disc" | "radar_cand",
  workspaceId: string,
  itemType: QueueableRadarItem["itemType"],
  externalId: string,
  locator: string,
): string {
  const digest = createHash("sha256")
    .update(`${workspaceId}\u0000${itemType}\u0000${externalId}\u0000${locator}`)
    .digest("hex")
    .slice(0, 32);
  return `${prefix}_${digest}`;
}

function normalizeHttpLocator(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  url.hash = "";
  return url.toString();
}

function acquisitionLocators(
  source: RadarSourceProposal,
  kinds: RadarSourceProposal["acquisitions"][number]["kind"][],
): string[] {
  return source.acquisitions
    .filter((acquisition) => kinds.includes(acquisition.kind))
    .map((acquisition) => acquisition.locator);
}

function sourceProposalLocator(source: RadarSourceProposal): string | undefined {
  const endpointPreferred = (() => {
    switch (source.sourceType) {
      case "newsletter":
      case "email_alert":
        return [
          source.newsletterUrl,
          ...acquisitionLocators(source, ["EMAIL"]),
          source.homepageUrl,
          source.newsUrl,
        ];
      case "rss":
        return [
          ...acquisitionLocators(source, ["RSS"]),
          source.newsUrl,
          source.homepageUrl,
        ];
      case "sitemap":
        return [
          ...acquisitionLocators(source, ["SITEMAP"]),
          source.homepageUrl,
          source.newsUrl,
        ];
      case "api":
        return [
          ...acquisitionLocators(source, ["API"]),
          source.homepageUrl,
          source.newsUrl,
        ];
      case "pdf":
        return [
          ...acquisitionLocators(source, ["PDF_WATCH"]),
          source.newsUrl,
          source.homepageUrl,
        ];
      default:
        return [
          source.newsUrl,
          ...acquisitionLocators(source, ["HTML_WATCH", "API", "PDF_WATCH", "RSS", "SITEMAP"]),
          source.homepageUrl,
          source.newsletterUrl,
        ];
    }
  })();

  for (const locator of endpointPreferred) {
    const normalized = normalizeHttpLocator(locator);
    if (normalized) return normalized;
  }
  return undefined;
}

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

function registeredSourceIdsByLocator(sources: SourceDefinition[]): Map<string, string[]> {
  const byLocator = new Map<string, string[]>();
  for (const source of sources) {
    const locators = [
      source.canonicalUri,
      ...source.entrypoints.map((entrypoint) => entrypoint.uri),
    ];
    for (const rawLocator of locators) {
      const locator = normalizeHttpLocator(rawLocator);
      if (!locator) continue;
      const ids = byLocator.get(locator) ?? [];
      if (!ids.includes(source.id)) ids.push(source.id);
      byLocator.set(locator, ids);
    }
  }
  return byLocator;
}

function sourceMetadata(source: RadarSourceProposal): Record<string, unknown> {
  return {
    radarIntake: {
      origin: "RADAR_CODEX_ONBOARDING",
      externalSourceId: source.externalSourceId,
      organizationName: source.organizationName,
      organizationKey: source.organizationKey,
      endpointKey: source.endpointKey,
      authorityType: source.authorityType,
      sourceType: source.sourceType,
      priority: source.priority,
      subscriptionStatus: source.subscriptionStatus,
      confirmed: source.confirmed,
      jurisdiction: source.jurisdiction,
      country: source.country,
      region: source.region,
      language: source.language,
      topic: source.topic,
      acquisitions: source.acquisitions,
      routingEvidence: source.routingEvidence,
      advisoryScores: source.advisoryScores,
      discoveredBy: source.discoveryProvenance.discoveredBy,
      parentSource: source.discoveryProvenance.parentSource,
      notes: source.notes,
    },
  };
}

function candidateMetadata(candidate: RadarCandidateProposal): Record<string, unknown> {
  return {
    radarIntake: {
      origin: "RADAR_CODEX_ONBOARDING",
      externalCandidateId: candidate.externalCandidateId,
      organizationName: candidate.organizationName,
      country: candidate.country,
      category: candidate.category,
      discoveredFrom: candidate.discoveredFrom,
      reason: candidate.reason,
      estimatedPriority: candidate.estimatedPriority,
      externalStatus: candidate.externalStatus,
      notes: candidate.notes,
    },
  };
}

function queueableItems(plan: RadarSourceIntakePlan): QueueableRadarItem[] {
  return [
    ...plan.sourceProposals.map((source) => ({
      itemType: "SOURCE_PROPOSAL" as const,
      source,
      locator: sourceProposalLocator(source),
    })),
    ...plan.candidateProposals.map((candidate) => ({
      itemType: "CANDIDATE_PROPOSAL" as const,
      candidate,
      locator: normalizeHttpLocator(candidate.url),
    })),
  ];
}

function itemIdentity(item: QueueableRadarItem): {
  externalId: string;
  title: string;
  disposition: RadarSourceProposal["disposition"] | RadarCandidateProposal["disposition"];
  discoveredFrom?: string;
  metadata: Record<string, unknown>;
} {
  if (item.itemType === "SOURCE_PROPOSAL") {
    return {
      externalId: item.source.externalSourceId,
      title: item.source.name,
      disposition: item.source.disposition,
      discoveredFrom:
        item.source.discoveryProvenance.parentSource ??
        item.source.homepageUrl ??
        item.source.newsUrl,
      metadata: sourceMetadata(item.source),
    };
  }
  return {
    externalId: item.candidate.externalCandidateId,
    title: item.candidate.name,
    disposition: item.candidate.disposition,
    discoveredFrom: item.candidate.discoveredFrom,
    metadata: candidateMetadata(item.candidate),
  };
}

function skippedResult(
  workspaceId: string,
  item: QueueableRadarItem,
  state: "SKIPPED_BLOCKED" | "SKIPPED_NO_LOCATOR",
  reason: string,
): RadarDiscoveryIntakeResult {
  const identity = itemIdentity(item);
  return {
    workspaceId,
    externalId: identity.externalId,
    itemType: item.itemType,
    state,
    ...(item.locator ? { locator: item.locator } : {}),
    reason,
  };
}

function queueItem(
  workspaceId: string,
  item: QueueableRadarItem,
  registeredByLocator: Map<string, string[]>,
  dependencies: RadarDiscoveryIntakeDependencies,
): RadarDiscoveryIntakeResult {
  const identity = itemIdentity(item);
  if (identity.disposition === "BLOCKED") {
    return skippedResult(
      workspaceId,
      item,
      "SKIPPED_BLOCKED",
      "Radar intake disposition is BLOCKED; review must happen outside Discovery intake.",
    );
  }
  if (!item.locator) {
    return skippedResult(
      workspaceId,
      item,
      "SKIPPED_NO_LOCATOR",
      "Existing Discovery candidates require a canonical HTTP(S) locator.",
    );
  }

  const coveredSourceIds = registeredByLocator.get(item.locator);
  if (coveredSourceIds?.length) {
    return {
      workspaceId,
      externalId: identity.externalId,
      itemType: item.itemType,
      state: "ALREADY_COVERED",
      locator: item.locator,
      sourceIds: [...coveredSourceIds],
    };
  }

  const existing = dependencies.discovery.getCandidateByLocator(item.locator);
  if (existing) {
    return {
      workspaceId,
      externalId: identity.externalId,
      itemType: item.itemType,
      state: "ALREADY_IN_DISCOVERY",
      locator: item.locator,
      candidate: existing,
      batchId: existing.batchId,
    };
  }

  const now = (dependencies.clock ?? (() => new Date()))().toISOString();
  const seedId = stableId(
    "radar_seed",
    workspaceId,
    item.itemType,
    identity.externalId,
    item.locator,
  );
  const batchId = stableId(
    "radar_disc",
    workspaceId,
    item.itemType,
    identity.externalId,
    item.locator,
  );
  const candidateId = stableId(
    "radar_cand",
    workspaceId,
    item.itemType,
    identity.externalId,
    item.locator,
  );
  const seed = dependencies.discovery.createSeed({
    seedId,
    locator: item.locator,
    metadata: {
      source: "radar-source-intake",
      workspaceId,
      externalId: identity.externalId,
      itemType: item.itemType,
    },
  });
  const batch: SourceDiscoveryBatch = {
    batchId,
    seeds: [
      {
        seedId: seed.seedId,
        locator: seed.locator,
        metadata: {
          source: "radar-source-intake",
          externalId: identity.externalId,
          itemType: item.itemType,
        },
      },
    ],
    createdAt: now,
    constraints: {
      maxDepth: 0,
      maxCandidates: 1,
      maxFetches: 0,
      sameHostOnly: true,
      discoverSitemaps: false,
      discoverExternalLinks: false,
      maxExternalCandidates: 0,
      maxExpansionGeneration: 0,
    },
    lineage: { generation: 0 },
  };
  dependencies.discovery.createBatch(batch);

  const candidate: SourceCandidate = {
    candidateId,
    locator: item.locator,
    title: identity.title,
    discoveredAt: now,
    status: "DISCOVERED",
    discoveredFrom: identity.discoveredFrom,
    discoveryMethod: "MANUAL",
    depth: 0,
    metadata: identity.metadata,
  };
  dependencies.discovery.completeBatch(batchId, [candidate]);
  const queued =
    dependencies.discovery.getCandidate(candidateId) ??
    dependencies.discovery.getCandidateByLocator(item.locator);
  if (!queued) {
    throw new RegistryError(
      "RADAR_DISCOVERY_INTAKE_FAILED",
      `Radar intake item ${identity.externalId} did not produce a Discovery candidate`,
      { externalId: identity.externalId, itemType: item.itemType },
    );
  }

  return {
    workspaceId,
    externalId: identity.externalId,
    itemType: item.itemType,
    state: "QUEUED",
    locator: item.locator,
    candidate: queued,
    batchId,
  };
}

export function queueRadarSourceIntakeForDiscovery(
  input: { workspaceId: string; plan: RadarSourceIntakePlan },
  dependencies: RadarDiscoveryIntakeDependencies,
): RadarDiscoveryBatchIntakeResult {
  const workspaceId = assertWorkspaceId(input.workspaceId);
  if (
    input.plan.mode !== "PLAN" ||
    input.plan.mutationPerformed ||
    input.plan.activationAuthorized ||
    input.plan.collectionAuthorized
  ) {
    throw new RegistryError(
      "RADAR_INTAKE_PLAN_REQUIRED",
      "Radar Discovery intake accepts only a zero-mutation, zero-authorization PLAN document",
    );
  }
  if (input.plan.summary.errors > 0) {
    throw new RegistryError(
      "RADAR_INTAKE_PLAN_HAS_ERRORS",
      "Radar Discovery intake refuses a plan with validation errors",
      { errors: input.plan.summary.errors },
    );
  }

  const items = queueableItems(input.plan);
  if (items.length > MAX_RADAR_INTAKE_ITEMS) {
    throw new RegistryError(
      "RADAR_INTAKE_LIMIT_EXCEEDED",
      `Radar Discovery intake is limited to ${MAX_RADAR_INTAKE_ITEMS} items per request`,
      { maxItems: MAX_RADAR_INTAKE_ITEMS, requestedItems: items.length },
    );
  }

  const registeredByLocator = registeredSourceIdsByLocator(
    listWorkspaceSources(dependencies.sources, workspaceId),
  );
  const results = items.map((item) =>
    queueItem(workspaceId, item, registeredByLocator, dependencies),
  );

  const count = (state: RadarDiscoveryIntakeState) =>
    results.filter((result) => result.state === state).length;
  return {
    workspaceId,
    intakeVersion: input.plan.version,
    requestedItems: items.length,
    results,
    summary: {
      total: results.length,
      QUEUED: count("QUEUED"),
      ALREADY_IN_DISCOVERY: count("ALREADY_IN_DISCOVERY"),
      ALREADY_COVERED: count("ALREADY_COVERED"),
      SKIPPED_BLOCKED: count("SKIPPED_BLOCKED"),
      SKIPPED_NO_LOCATOR: count("SKIPPED_NO_LOCATOR"),
    },
  };
}
