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
  {
    id: "eu-trademarks-root-name",
    targetId: "eu-euipo-trademarks-root",
    query: "trade marks",
  },
  { id: "eu-how-to-apply-name", targetId: "eu-euipo-how-to-apply", query: "apply" },
  { id: "eu-esearch-name", targetId: "eu-euipo-esearch-plus", query: "search" },
  {
    id: "eu-guidelines-name",
    targetId: "eu-euipo-trade-mark-guidelines",
    query: "guidelines",
  },
  { id: "eu-tmclass-name", targetId: "eu-euipo-tmclass", query: "goods services" },
  { id: "eu-fees-name", targetId: "eu-euipo-fees", query: "fees" },
  { id: "eu-opposition-name", targetId: "eu-euipo-opposition", query: "opposition" },
  {
    id: "eu-appeal-decisions-name",
    targetId: "eu-euipo-boards-of-appeal-decisions",
    query: "appeal decisions",
  },
  { id: "eu-law-name", targetId: "eu-euipo-law", query: "law" },
  {
    id: "eu-manage-trademark-name",
    targetId: "eu-euipo-manage-trade-mark",
    query: "manage application",
  },
  { id: "cn-trademark-portal-name", targetId: "cn-cnipa-trademark-portal", query: "商标" },
  {
    id: "cn-trademark-filing-name",
    targetId: "cn-cnipa-trademark-filing-guide",
    query: "商标注册申请",
  },
  { id: "cn-trademark-search-name", targetId: "cn-cnipa-trademark-search", query: "商标查询" },
  { id: "cn-trademark-fees-name", targetId: "cn-cnipa-trademark-fees", query: "收费" },
  {
    id: "cn-trademark-guidelines-name",
    targetId: "cn-cnipa-trademark-examination-guidelines",
    query: "审查审理指南",
  },
  { id: "cn-trademark-law-name", targetId: "cn-cnipa-trademark-law", query: "商标法" },
  {
    id: "jp-trademark-procedures-name",
    targetId: "jp-jpo-trademark-procedures",
    query: "trademark",
  },
  {
    id: "jp-trademark-step-name",
    targetId: "jp-jpo-trademark-step-by-step",
    query: "step-by-step trademark",
  },
  { id: "jp-trademark-fees-name", targetId: "jp-jpo-fees", query: "fees" },
  {
    id: "jp-trademark-guidelines-name",
    targetId: "jp-jpo-trademark-examination-guidelines",
    query: "examination guidelines",
  },
  {
    id: "jp-similar-goods-services-name",
    targetId: "jp-jpo-similar-goods-services-guidelines",
    query: "similar goods services",
  },
  {
    id: "kr-trademark-system-name",
    targetId: "kr-moip-trademark-system",
    query: "trademark system",
  },
  {
    id: "kr-trademark-application-name",
    targetId: "kr-moip-trademark-application-procedure",
    query: "application procedure",
  },
  { id: "kr-trademark-fees-name", targetId: "kr-moip-trademark-fees", query: "fees" },
  { id: "kr-trademark-laws-name", targetId: "kr-moip-trademark-laws", query: "trademark act" },
  {
    id: "kr-trademark-trials-name",
    targetId: "kr-moip-trademark-trials-appeals",
    query: "trials appeals",
  },
  {
    id: "gb-register-trademark-name",
    targetId: "gb-ukipo-register-trademark",
    query: "register trade mark",
  },
  {
    id: "gb-trademark-filing-name",
    targetId: "gb-ukipo-trademark-filing",
    query: "start application",
  },
  {
    id: "gb-trademark-search-name",
    targetId: "gb-ukipo-trademark-search",
    query: "search trade mark",
  },
  {
    id: "gb-trademark-forms-fees-name",
    targetId: "gb-ukipo-trademark-forms-fees",
    query: "forms fees",
  },
  {
    id: "gb-trademark-timeline-name",
    targetId: "gb-ukipo-trademark-timeline",
    query: "trade marks timeline",
  },
  {
    id: "gb-trademark-journal-name",
    targetId: "gb-ukipo-trademark-journal",
    query: "trade marks journal",
  },
  { id: "au-trademarks-name", targetId: "au-ipaustralia-trademarks", query: "trade marks" },
  {
    id: "au-trademark-search-name",
    targetId: "au-ipaustralia-trademark-search",
    query: "trade mark search",
  },
  {
    id: "au-trademark-fees-name",
    targetId: "au-ipaustralia-trademark-fees-timeframes",
    query: "timeframes fees",
  },
  {
    id: "au-trademark-filing-name",
    targetId: "au-ipaustralia-trademark-filing",
    query: "apply trade mark",
  },
  {
    id: "au-trademark-manual-name",
    targetId: "au-ipaustralia-trademark-manual",
    query: "trade marks manual",
  },
  {
    id: "au-goods-services-name",
    targetId: "au-ipaustralia-goods-services-picklist",
    query: "classification search",
  },
  { id: "sg-trademarks-name", targetId: "sg-ipos-trademarks", query: "trade marks" },
  {
    id: "sg-trademark-registration-name",
    targetId: "sg-ipos-trademark-registration",
    query: "register trade mark",
  },
  {
    id: "sg-trademark-search-name",
    targetId: "sg-ipos-trademark-search",
    query: "similar mark search",
  },
  {
    id: "sg-trademark-forms-fees-name",
    targetId: "sg-ipos-trademark-forms-fees",
    query: "forms fees",
  },
  {
    id: "sg-trademark-work-manual-name",
    targetId: "sg-ipos-trademark-guides-work-manual",
    query: "work manual",
  },
  { id: "de-trademarks-name", targetId: "de-dpma-trademarks", query: "trade marks" },
  {
    id: "de-trademark-filing-name",
    targetId: "de-dpma-trademark-filing",
    query: "required data",
  },
  {
    id: "de-trademark-search-name",
    targetId: "de-dpma-trademark-search",
    query: "trade mark searches",
  },
  {
    id: "de-trademark-fees-name",
    targetId: "de-dpma-trademark-fees",
    query: "trade mark fees",
  },
  {
    id: "de-trademark-law-name",
    targetId: "de-dpma-trademark-law-guidelines",
    query: "trade mark act",
  },
  {
    id: "de-trademark-forms-name",
    targetId: "de-dpma-trademark-forms",
    query: "trade mark applicants",
  },
  { id: "in-trademarks-name", targetId: "in-ipindia-trademarks", query: "basics trademarks" },
  {
    id: "in-trademark-filing-name",
    targetId: "in-ipindia-trademark-filing-process",
    query: "filing process",
  },
  {
    id: "in-trademark-search-name",
    targetId: "in-ipindia-trademark-search",
    query: "search existing trademarks",
  },
  {
    id: "in-trademark-forms-fees-name",
    targetId: "in-ipindia-trademark-forms-fees",
    query: "forms official fees",
  },
  {
    id: "in-trademark-act-name",
    targetId: "in-ipindia-trademark-act",
    query: "trade marks act",
  },
  {
    id: "in-trademark-rules-name",
    targetId: "in-ipindia-trademark-rules",
    query: "trade marks rules",
  },
  {
    id: "in-trademark-manual-name",
    targetId: "in-ipindia-trademark-manual",
    query: "trademarks practice procedure manual",
  },
  {
    id: "fr-trademark-portal-name",
    targetId: "fr-inpi-trademark-portal",
    query: "dépôt marque",
  },
  {
    id: "fr-trademark-filing-name",
    targetId: "fr-inpi-trademark-filing",
    query: "déposer marque",
  },
  {
    id: "fr-trademark-search-name",
    targetId: "fr-inpi-trademark-search",
    query: "base marques",
  },
  {
    id: "fr-trademark-fees-name",
    targetId: "fr-inpi-trademark-fees",
    query: "tarifs procédures",
  },
  {
    id: "fr-trademark-goods-services-name",
    targetId: "fr-inpi-trademark-goods-services",
    query: "produits services marque",
  },
  {
    id: "fr-trademark-directives-name",
    targetId: "fr-inpi-trademark-directives",
    query: "directives marques",
  },
  {
    id: "fr-trademark-opposition-name",
    targetId: "fr-inpi-trademark-opposition",
    query: "opposition enregistrement marque",
  },
  {
    id: "br-trademarks-name",
    targetId: "br-inpi-trademarks",
    query: "Brazil INPI trademarks",
  },
  {
    id: "br-trademark-filing-name",
    targetId: "br-inpi-trademark-filing-guide",
    query: "trademark filing guide",
  },
  {
    id: "br-trademark-search-name",
    targetId: "br-inpi-trademark-search",
    query: "trademark search",
  },
  {
    id: "br-trademark-costs-name",
    targetId: "br-inpi-trademark-costs",
    query: "trademark costs payment",
  },
  {
    id: "br-trademark-manual-name",
    targetId: "br-inpi-trademark-manual",
    query: "trademark manual",
  },
  {
    id: "br-trademark-legislation-name",
    targetId: "br-inpi-trademark-legislation",
    query: "trademark legislation",
  },
  {
    id: "br-trademark-classification-name",
    targetId: "br-inpi-trademark-classification",
    query: "trademark classification",
  },
  {
    id: "br-trademark-appeals-name",
    targetId: "br-inpi-trademark-appeals-nullity",
    query: "trademark appeals nullity",
  },
  {
    id: "mx-trademarks-name",
    targetId: "mx-impi-trademarks",
    query: "Mexico IMPI trademarks",
  },
  {
    id: "mx-trademark-filing-name",
    targetId: "mx-impi-trademark-filing",
    query: "trademark filing",
  },
  {
    id: "mx-trademark-search-name",
    targetId: "mx-impi-trademark-search",
    query: "trademark search MARCia",
  },
  {
    id: "mx-trademark-fees-name",
    targetId: "mx-impi-trademark-fees",
    query: "trademark fees",
  },
  {
    id: "mx-trademark-forms-name",
    targetId: "mx-impi-trademark-forms",
    query: "trademark forms",
  },
  {
    id: "mx-legal-framework-name",
    targetId: "mx-impi-legal-framework",
    query: "industrial property legal framework",
  },
  {
    id: "mx-trademark-classification-name",
    targetId: "mx-impi-trademark-classification",
    query: "trademark classification ClasNiza",
  },
  {
    id: "nz-trademarks-name",
    targetId: "nz-iponz-trademarks",
    query: "trade marks",
  },
  {
    id: "nz-trademark-filing-name",
    targetId: "nz-iponz-trademark-filing",
    query: "apply trade mark",
  },
  {
    id: "nz-trademark-search-name",
    targetId: "nz-iponz-trademark-search",
    query: "search existing trade marks",
  },
  {
    id: "nz-trademark-fees-name",
    targetId: "nz-iponz-trademark-fees",
    query: "trade mark fees",
  },
  {
    id: "nz-trademark-practice-guidelines-name",
    targetId: "nz-iponz-trademark-practice-guidelines",
    query: "practice guidelines",
  },
  {
    id: "nz-trademark-classification-name",
    targetId: "nz-iponz-trademark-classification",
    query: "classification specification",
  },
  {
    id: "nz-trademark-hearings-name",
    targetId: "nz-iponz-trademark-hearings",
    query: "trade mark hearings",
  },
  {
    id: "es-trademarks-name",
    targetId: "es-oepm-trademarks",
    query: "marcas nombres comerciales",
  },
  {
    id: "es-trademark-filing-name",
    targetId: "es-oepm-trademark-filing",
    query: "solicitud marca",
  },
  {
    id: "es-trademark-search-name",
    targetId: "es-oepm-trademark-search",
    query: "buscar marcas nombres comerciales",
  },
  {
    id: "es-trademark-fees-name",
    targetId: "es-oepm-trademark-fees",
    query: "tasas marcas nombres comerciales",
  },
  {
    id: "es-trademark-forms-name",
    targetId: "es-oepm-trademark-forms",
    query: "formularios marcas nombres comerciales",
  },
  {
    id: "es-trademark-directives-name",
    targetId: "es-oepm-trademark-examination-directives",
    query: "directrices examen marcas",
  },
  {
    id: "es-trademark-law-name",
    targetId: "es-oepm-trademark-law",
    query: "normativa marcas nombres comerciales",
  },
  {
    id: "es-trademark-classification-name",
    targetId: "es-oepm-trademark-classification",
    query: "CLINMAR clasificación Niza",
  },
  {
    id: "it-trademarks-name",
    targetId: "it-uibm-trademarks",
    query: "marchi UIBM",
  },
  {
    id: "it-trademark-filing-name",
    targetId: "it-uibm-trademark-filing",
    query: "come effettuare deposito marchio",
  },
  {
    id: "it-trademark-search-name",
    targetId: "it-uibm-trademark-search",
    query: "banca dati proprietà industriale marchi",
  },
  {
    id: "it-trademark-fees-name",
    targetId: "it-uibm-trademark-fees",
    query: "tariffe marchi",
  },
  {
    id: "it-trademark-forms-name",
    targetId: "it-uibm-trademark-forms",
    query: "marchi primo deposito modulistica",
  },
  {
    id: "it-trademark-examination-opposition-name",
    targetId: "it-uibm-trademark-examination-opposition",
    query: "esame domanda opposizione marchio",
  },
  {
    id: "it-industrial-property-code-name",
    targetId: "it-uibm-industrial-property-code",
    query: "codice proprietà industriale",
  },
  {
    id: "it-trademark-nullity-revocation-name",
    targetId: "it-uibm-trademark-nullity-revocation",
    query: "decadenza nullità marchio",
  },
  {
    id: "ch-trademarks-name",
    targetId: "ch-ipi-trademarks",
    query: "Swiss trade marks",
  },
  {
    id: "ch-trademark-filing-name",
    targetId: "ch-ipi-trademark-filing",
    query: "national trade mark applications",
  },
  {
    id: "ch-trademark-search-name",
    targetId: "ch-ipi-trademark-search",
    query: "Swissreg trade mark database",
  },
  {
    id: "ch-trademark-fees-name",
    targetId: "ch-ipi-trademark-fees",
    query: "trade mark costs fees",
  },
  {
    id: "ch-trademark-guidelines-name",
    targetId: "ch-ipi-trademark-guidelines",
    query: "trade mark guidelines 2026",
  },
  {
    id: "ch-trademark-classification-name",
    targetId: "ch-ipi-trademark-classification",
    query: "classification tool goods services",
  },
  {
    id: "ch-trademark-law-name",
    targetId: "ch-ipi-trademark-law",
    query: "trade mark law legal framework",
  },
  {
    id: "ch-trademark-proceedings-name",
    targetId: "ch-ipi-trademark-proceedings",
    query: "trade mark opposition cancellation non-use",
  },
  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },
  {
    id: "ca-trademarks-guide-name",
    targetId: "ca-cipo-trademarks-guide",
    query: "trademarks guide",
  },
  {
    id: "ca-trademark-search-name",
    targetId: "ca-cipo-trademark-search",
    query: "trademark search",
  },
  { id: "ca-trademark-fees-name", targetId: "ca-cipo-trademark-fees", query: "fees trademarks" },
  {
    id: "ca-trademark-services-name",
    targetId: "ca-cipo-trademark-online-services",
    query: "online services forms",
  },
  {
    id: "ca-trademark-opposition-name",
    targetId: "ca-cipo-trademark-opposition",
    query: "opposition proceedings",
  },
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
