import { DatabaseSync } from "node:sqlite";
import { RegistryValidationError } from "./index";
import { SqliteRetrievalIndexRepository } from "./retrieval-index";
import { SqliteSourceSupplyHealthRepository } from "./source-supply-health";

export const RETRIEVAL_RELEVANCE_AUDIT_PROTOCOL_VERSION = "1.0" as const;

export type RetrievalRelevanceAuditState = "READY" | "DEGRADED" | "BLOCKED" | "NOT_APPLICABLE";

export type RetrievalRelevanceGap =
  | "PROBE_NOT_CONFIGURED"
  | "NO_CURRENT_RETRIEVAL_DOCUMENT"
  | "SOURCE_FILTERED_QUERY_MISS"
  | "GLOBAL_TOP_K_MISS";

export type RetrievalRelevanceProbe = {
  id: string;
  targetId: string;
  query: string;
};

export type RetrievalRelevanceProbeResult = {
  probeId: string;
  query: string;
  state: Exclude<RetrievalRelevanceAuditState, "NOT_APPLICABLE">;
  sourceFilteredHitCount: number;
  matchedSourceIds: string[];
  globalTopSourceIds: string[];
  expectedSourceInGlobalTopK: boolean;
  gaps: RetrievalRelevanceGap[];
};

export type RetrievalRelevanceAuditRecord = {
  protocolVersion: typeof RETRIEVAL_RELEVANCE_AUDIT_PROTOCOL_VERSION;
  objectType: "RETRIEVAL_RELEVANCE_AUDIT";
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  displayName: string;
  sourceIds: string[];
  currentDocumentCount: number;
  topK: number;
  state: RetrievalRelevanceAuditState;
  gaps: RetrievalRelevanceGap[];
  probes: RetrievalRelevanceProbeResult[];
  auditedAt: string;
};

export type RetrievalRelevanceAuditSummary = {
  total: number;
  byState: Record<RetrievalRelevanceAuditState, number>;
  gapCounts: Partial<Record<RetrievalRelevanceGap, number>>;
};

export type RetrievalRelevanceAuditFilters = {
  workspaceId: string;
  jurisdiction?: string;
  targetId?: string;
  topK?: number;
};

export type RetrievalRelevanceAuditResult = {
  protocolVersion: typeof RETRIEVAL_RELEVANCE_AUDIT_PROTOCOL_VERSION;
  objectType: "RETRIEVAL_RELEVANCE_AUDIT_LIST";
  filters: {
    workspaceId: string;
    jurisdiction?: string;
    targetId?: string;
    topK: number;
  };
  summary: RetrievalRelevanceAuditSummary;
  items: RetrievalRelevanceAuditRecord[];
  auditedAt: string;
  scoringMode: "SQLITE_FTS5_BM25_DETERMINISTIC_SMOKE";
  semanticJudgment: false;
};

export const FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES = [
  { id: "us-trademarks-root-name", targetId: "us-uspto-trademarks-root", query: "trademark" },
  { id: "us-trademark-search-name", targetId: "us-uspto-trademark-search", query: "search" },
  {
    id: "us-trademark-center-name",
    targetId: "us-uspto-trademark-center",
    query: "trademark center",
  },
  { id: "us-tsdr-name", targetId: "us-uspto-tsdr", query: "TSDR" },
  { id: "us-tmep-name", targetId: "us-uspto-tmep-current", query: "TMEP" },
  { id: "us-tbmp-name", targetId: "us-uspto-tbmp-current", query: "TBMP" },
  {
    id: "us-id-manual-name",
    targetId: "us-uspto-id-manual",
    query: "identification",
  },
  { id: "us-fees-name", targetId: "us-uspto-trademark-fees", query: "fees" },
  {
    id: "us-maintenance-name",
    targetId: "us-uspto-registration-maintenance",
    query: "maintenance",
  },
  { id: "us-ttab-name", targetId: "us-uspto-ttab", query: "TTAB" },
  {
    id: "us-gazette-name",
    targetId: "us-uspto-trademark-official-gazette",
    query: "Gazette",
  },
  { id: "wo-madrid-system-name", targetId: "wo-wipo-madrid-system", query: "Madrid" },
  { id: "wo-madrid-monitor-name", targetId: "wo-wipo-madrid-monitor", query: "monitor" },
  {
    id: "wo-global-brand-database-name",
    targetId: "wo-wipo-global-brand-database",
    query: "brand database",
  },
  { id: "wo-nice-name", targetId: "wo-wipo-nice-classification", query: "Nice" },
  {
    id: "wo-madrid-legal-texts-name",
    targetId: "wo-wipo-madrid-legal-texts",
    query: "legal texts",
  },
  { id: "wo-madrid-forms-name", targetId: "wo-wipo-madrid-forms", query: "forms" },
  { id: "wo-madrid-fees-name", targetId: "wo-wipo-madrid-fees", query: "fees" },
  { id: "wo-madrid-gazette-name", targetId: "wo-wipo-madrid-gazette", query: "Gazette" },
] satisfies readonly RetrievalRelevanceProbe[];

const PROBES_BY_TARGET = new Map<string, RetrievalRelevanceProbe[]>();
for (const probe of FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES) {
  const existing = PROBES_BY_TARGET.get(probe.targetId) ?? [];
  existing.push({ ...probe });
  PROBES_BY_TARGET.set(probe.targetId, existing);
}

function normalizeTopK(value?: number): number {
  if (value === undefined) return 5;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RegistryValidationError("topK must be a positive integer");
  }
  return Math.min(value, 20);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function targetState(
  probes: readonly RetrievalRelevanceProbeResult[],
): RetrievalRelevanceAuditState {
  if (probes.some((probe) => probe.state === "BLOCKED")) return "BLOCKED";
  if (probes.some((probe) => probe.state === "DEGRADED")) return "DEGRADED";
  return "READY";
}

function summarize(
  items: readonly RetrievalRelevanceAuditRecord[],
): RetrievalRelevanceAuditSummary {
  const summary: RetrievalRelevanceAuditSummary = {
    total: items.length,
    byState: { READY: 0, DEGRADED: 0, BLOCKED: 0, NOT_APPLICABLE: 0 },
    gapCounts: {},
  };
  for (const item of items) {
    summary.byState[item.state] += 1;
    for (const gap of item.gaps) summary.gapCounts[gap] = (summary.gapCounts[gap] ?? 0) + 1;
  }
  return summary;
}

export class SqliteRetrievalRelevanceAuditRepository {
  private readonly retrieval: SqliteRetrievalIndexRepository;
  private readonly supply: SqliteSourceSupplyHealthRepository;

  constructor(
    database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.retrieval = new SqliteRetrievalIndexRepository(database, clock);
    this.supply = new SqliteSourceSupplyHealthRepository(database, clock);
  }

  list(filters: RetrievalRelevanceAuditFilters): RetrievalRelevanceAuditResult {
    const workspaceId = filters.workspaceId.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    const jurisdiction = filters.jurisdiction?.trim().toUpperCase() || undefined;
    const targetId = filters.targetId?.trim() || undefined;
    const topK = normalizeTopK(filters.topK);
    const auditedAt = this.clock().toISOString();

    const supply = this.supply.list({
      workspaceId,
      jurisdiction,
      targetId,
      coverageTier: "FOUNDATIONAL",
      catalogState: "ACTIVE",
    });

    const items = supply.items.map((item): RetrievalRelevanceAuditRecord => {
      const probes = (PROBES_BY_TARGET.get(item.targetId) ?? []).map((probe) => ({ ...probe }));
      if (probes.length === 0) {
        return {
          protocolVersion: RETRIEVAL_RELEVANCE_AUDIT_PROTOCOL_VERSION,
          objectType: "RETRIEVAL_RELEVANCE_AUDIT",
          workspaceId,
          jurisdiction: item.jurisdiction,
          targetId: item.targetId,
          displayName: item.displayName,
          sourceIds: [...item.sourceIds],
          currentDocumentCount: item.retrieval.currentDocumentCount,
          topK,
          state: "BLOCKED",
          gaps: ["PROBE_NOT_CONFIGURED"],
          probes: [],
          auditedAt,
        };
      }

      if (item.sourceIds.length === 0 || item.retrieval.currentDocumentCount === 0) {
        return {
          protocolVersion: RETRIEVAL_RELEVANCE_AUDIT_PROTOCOL_VERSION,
          objectType: "RETRIEVAL_RELEVANCE_AUDIT",
          workspaceId,
          jurisdiction: item.jurisdiction,
          targetId: item.targetId,
          displayName: item.displayName,
          sourceIds: [...item.sourceIds],
          currentDocumentCount: item.retrieval.currentDocumentCount,
          topK,
          state: "NOT_APPLICABLE",
          gaps: ["NO_CURRENT_RETRIEVAL_DOCUMENT"],
          probes: [],
          auditedAt,
        };
      }

      const probeResults = probes.map((probe): RetrievalRelevanceProbeResult => {
        const matchedSourceIds = item.sourceIds.filter(
          (sourceId) =>
            this.retrieval.search({
              workspaceId,
              query: probe.query,
              sourceId,
              jurisdiction: item.jurisdiction,
              limit: topK,
            }).total > 0,
        );
        const global = this.retrieval.search({
          workspaceId,
          query: probe.query,
          jurisdiction: item.jurisdiction,
          limit: topK,
        });
        const globalTopSourceIds = unique(global.items.map((result) => result.document.sourceId));
        const expectedSourceInGlobalTopK = globalTopSourceIds.some((sourceId) =>
          item.sourceIds.includes(sourceId),
        );
        const gaps: RetrievalRelevanceGap[] = [];
        if (matchedSourceIds.length === 0) gaps.push("SOURCE_FILTERED_QUERY_MISS");
        else if (!expectedSourceInGlobalTopK) gaps.push("GLOBAL_TOP_K_MISS");
        return {
          probeId: probe.id,
          query: probe.query,
          state:
            matchedSourceIds.length === 0
              ? "BLOCKED"
              : expectedSourceInGlobalTopK
                ? "READY"
                : "DEGRADED",
          sourceFilteredHitCount: matchedSourceIds.length,
          matchedSourceIds,
          globalTopSourceIds,
          expectedSourceInGlobalTopK,
          gaps,
        };
      });
      const gaps = unique(probeResults.flatMap((probe) => probe.gaps)) as RetrievalRelevanceGap[];
      return {
        protocolVersion: RETRIEVAL_RELEVANCE_AUDIT_PROTOCOL_VERSION,
        objectType: "RETRIEVAL_RELEVANCE_AUDIT",
        workspaceId,
        jurisdiction: item.jurisdiction,
        targetId: item.targetId,
        displayName: item.displayName,
        sourceIds: [...item.sourceIds],
        currentDocumentCount: item.retrieval.currentDocumentCount,
        topK,
        state: targetState(probeResults),
        gaps,
        probes: probeResults,
        auditedAt,
      };
    });

    return {
      protocolVersion: RETRIEVAL_RELEVANCE_AUDIT_PROTOCOL_VERSION,
      objectType: "RETRIEVAL_RELEVANCE_AUDIT_LIST",
      filters: { workspaceId, jurisdiction, targetId, topK },
      summary: summarize(items),
      items,
      auditedAt,
      scoringMode: "SQLITE_FTS5_BM25_DETERMINISTIC_SMOKE",
      semanticJudgment: false,
    };
  }
}
