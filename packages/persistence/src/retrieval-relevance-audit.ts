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
  {
    id: "se-trademarks-name",
    targetId: "se-prv-trademarks",
    query: "PRV trademarks Sweden",
  },
  {
    id: "se-trademark-filing-name",
    targetId: "se-prv-trademark-filing",
    query: "prepare trademark application",
  },
  {
    id: "se-trademark-search-name",
    targetId: "se-prv-trademark-search",
    query: "Swedish trademark database",
  },
  {
    id: "se-trademark-fees-name",
    targetId: "se-prv-trademark-fees",
    query: "trademark fees",
  },
  {
    id: "se-trademark-classification-name",
    targetId: "se-prv-trademark-classification",
    query: "goods services trademark classes",
  },
  {
    id: "se-trademark-law-name",
    targetId: "se-prv-trademark-law",
    query: "trademark laws regulations",
  },
  {
    id: "se-trademark-examination-opposition-name",
    targetId: "se-prv-trademark-examination-opposition",
    query: "processing trademark applications opposition",
  },
  {
    id: "no-trademarks-name",
    targetId: "no-nipo-trademarks",
    query: "NIPO trademarks Norway",
  },
  {
    id: "no-trademark-filing-name",
    targetId: "no-nipo-trademark-filing",
    query: "start trademark application",
  },
  {
    id: "no-trademark-search-name",
    targetId: "no-nipo-trademark-search",
    query: "register search trademarks Norway",
  },
  {
    id: "no-trademark-fees-name",
    targetId: "no-nipo-trademark-fees",
    query: "trademark fees price list",
  },
  {
    id: "no-trademark-classification-name",
    targetId: "no-nipo-trademark-classification",
    query: "classification goods services product selector",
  },
  {
    id: "no-trademark-law-name",
    targetId: "no-nipo-trademark-law",
    query: "Norwegian Trademarks Act regulations",
  },
  {
    id: "no-trademark-proceedings-name",
    targetId: "no-nipo-trademark-proceedings",
    query: "trademark opposition administrative review",
  },
  {
    id: "dk-trademarks-name",
    targetId: "dk-dkpto-trademarks",
    query: "DKPTO trademarks Denmark",
  },
  {
    id: "dk-trademark-filing-name",
    targetId: "dk-dkpto-trademark-filing",
    query: "apply trademark eFiling Denmark",
  },
  {
    id: "dk-trademark-search-name",
    targetId: "dk-dkpto-trademark-search",
    query: "PVSOnline trademark search",
  },
  {
    id: "dk-trademark-fees-name",
    targetId: "dk-dkpto-trademark-fees",
    query: "trademark prices fees",
  },
  {
    id: "dk-trademark-guidelines-name",
    targetId: "dk-dkpto-trademark-guidelines",
    query: "Varemærkehåndbogen trademark guidelines",
  },
  {
    id: "dk-trademark-classification-name",
    targetId: "dk-dkpto-trademark-classification",
    query: "Nice classification varer tjenesteydelser",
  },
  {
    id: "dk-trademark-law-name",
    targetId: "dk-dkpto-trademark-law",
    query: "trademark law Trade Marks Act Denmark",
  },
  {
    id: "fi-trademarks-name",
    targetId: "fi-prh-trademarks",
    query: "PRH trademarks Finland",
  },
  {
    id: "fi-trademark-filing-name",
    targetId: "fi-prh-trademark-filing",
    query: "apply trademark online Finland",
  },
  {
    id: "fi-trademark-search-name",
    targetId: "fi-prh-trademark-search",
    query: "Trademark Information Service Finland",
  },
  {
    id: "fi-trademark-fees-name",
    targetId: "fi-prh-trademark-fees",
    query: "trademark application registration fees 2026",
  },
  {
    id: "fi-trademark-classification-name",
    targetId: "fi-prh-trademark-classification",
    query: "NCL 13-2026 classification goods services",
  },
  {
    id: "fi-trademark-law-name",
    targetId: "fi-prh-trademark-law",
    query: "Trademarks Act legislation Finland",
  },
  {
    id: "fi-trademark-proceedings-name",
    targetId: "fi-prh-trademark-proceedings",
    query: "trademark opposition revocation invalidation",
  },
  {
    id: "at-trademarks-name",
    targetId: "at-patentamt-trademarks",
    query: "Austrian Patent Office trademark protection",
  },
  {
    id: "at-trademark-filing-name",
    targetId: "at-patentamt-trademark-filing",
    query: "national trademark online filing Austria",
  },
  {
    id: "at-trademark-search-name",
    targetId: "at-patentamt-trademark-search",
    query: "see.ip trademark search Austria",
  },
  {
    id: "at-trademark-fees-name",
    targetId: "at-patentamt-trademark-fees",
    query: "trademark application fees Austria",
  },
  {
    id: "at-trademark-classification-name",
    targetId: "at-patentamt-trademark-classification",
    query: "Nice Classification NCL 13-2026 trademark",
  },
  {
    id: "at-trademark-law-name",
    targetId: "at-patentamt-trademark-law",
    query: "Trademark Protection Act law legislation Austria",
  },
  {
    id: "at-trademark-proceedings-name",
    targetId: "at-patentamt-trademark-proceedings",
    query: "trademark opposition cancellation proceedings appeals Austria",
  },
  {
    id: "ie-trademarks-name",
    targetId: "ie-ipoi-trademarks",
    query: "IPOI trade marks Ireland",
  },
  {
    id: "ie-trademark-filing-name",
    targetId: "ie-ipoi-trademark-filing",
    query: "apply for a trade mark Ireland",
  },
  {
    id: "ie-trademark-search-name",
    targetId: "ie-ipoi-trademark-search",
    query: "Irish trademark search database",
  },
  {
    id: "ie-trademark-fees-name",
    targetId: "ie-ipoi-trademark-fees",
    query: "statutory trade mark fees Ireland",
  },
  {
    id: "ie-trademark-classification-name",
    targetId: "ie-ipoi-trademark-classification",
    query: "classifying goods services Nice Ireland",
  },
  {
    id: "ie-trademark-law-name",
    targetId: "ie-ipoi-trademark-law-practice",
    query: "Trade Marks Act rules practice Ireland",
  },
  {
    id: "ie-trademark-opposition-name",
    targetId: "ie-ipoi-trademark-opposition",
    query: "trade mark opposition Ireland IPOI",
  },
  {
    id: "pt-trademarks-name",
    targetId: "pt-inpi-trademarks",
    query: "INPI marcas Portugal registar marca nacional",
  },
  {
    id: "pt-trademark-filing-name",
    targetId: "pt-inpi-trademark-filing",
    query: "pedido online marcas logotipos Portugal",
  },
  {
    id: "pt-trademark-search-name",
    targetId: "pt-inpi-trademark-search",
    query: "pesquisa online marcas INPI Portugal",
  },
  {
    id: "pt-trademark-fees-name",
    targetId: "pt-inpi-trademark-fees",
    query: "tabela taxas propriedade industrial 2026 marcas",
  },
  {
    id: "pt-trademark-classification-name",
    targetId: "pt-inpi-trademark-classification",
    query: "13 edição Classificação Nice produtos serviços marcas",
  },
  {
    id: "pt-trademark-examination-name",
    targetId: "pt-inpi-trademark-examination-guidelines",
    query: "Guidelines Exame motivos absolutos relativos marcas",
  },
  {
    id: "pt-trademark-law-name",
    targetId: "pt-inpi-trademark-law",
    query: "Código Propriedade Industrial marcas Portugal",
  },
  {
    id: "pl-trademarks-name",
    targetId: "pl-uprp-trademarks",
    query: "znaki towarowe informacje podstawowe UPRP",
  },
  {
    id: "pl-trademark-filing-name",
    targetId: "pl-uprp-trademark-filing",
    query: "procedura krajowa zgłoszenie znaku towarowego",
  },
  {
    id: "pl-trademark-search-name",
    targetId: "pl-uprp-trademark-search",
    query: "e-Wyszukiwarka znaki towarowe UPRP",
  },
  {
    id: "pl-trademark-fees-name",
    targetId: "pl-uprp-trademark-fees",
    query: "opłaty zgłoszeniowe znaki towarowe UPRP",
  },
  {
    id: "pl-trademark-classification-name",
    targetId: "pl-uprp-trademark-classification",
    query: "Klasyfikacja nicejska towary usługi UPRP",
  },
  {
    id: "pl-trademark-guidelines-name",
    targetId: "pl-uprp-trademark-guidelines",
    query: "wytyczne znaki towarowe Prezesa UPRP",
  },
  {
    id: "pl-trademark-law-proceedings-name",
    targetId: "pl-uprp-trademark-law-proceedings",
    query: "Prawo własności przemysłowej procedura sprzeciwowa znak towarowy",
  },
  {
    id: "cz-trademarks-name",
    targetId: "cz-upv-trademarks",
    query: "Industrial Property Office Czech trademarks",
  },
  {
    id: "cz-trademark-filing-name",
    targetId: "cz-upv-trademark-filing",
    query: "national trademark application Czech",
  },
  {
    id: "cz-trademark-search-name",
    targetId: "cz-upv-trademark-search",
    query: "trademark databases Czech ÚPV WIPO EUIPO",
  },
  {
    id: "cz-trademark-fees-name",
    targetId: "cz-upv-trademark-fees",
    query: "trademark administrative fees Czech",
  },
  {
    id: "cz-trademark-classification-name",
    targetId: "cz-upv-trademark-classification",
    query: "Nice Classification 13 2026 ochranné známky",
  },
  {
    id: "cz-trademark-law-name",
    targetId: "cz-upv-trademark-law",
    query: "Act 441 2003 Trademarks Czech legislation",
  },
  {
    id: "cz-trademark-common-practices-name",
    targetId: "cz-upv-trademark-common-practices",
    query: "Common Communications trademark practice EUIPO member states Czech",
  },
  {
    id: "sk-trademarks-name",
    targetId: "sk-indprop-trademarks",
    query: "Industrial Property Office Slovak Republic trade marks",
  },
  {
    id: "sk-trademark-filing-name",
    targetId: "sk-indprop-trademark-filing",
    query: "file trade mark application Slovakia Fast Track",
  },
  {
    id: "sk-trademark-search-name",
    targetId: "sk-indprop-trademark-search",
    query: "Webregister trademarks Slovakia daily",
  },
  {
    id: "sk-trademark-fees-name",
    targetId: "sk-indprop-trademark-fees",
    query: "trade mark administrative fees Slovakia",
  },
  {
    id: "sk-trademark-classification-name",
    targetId: "sk-indprop-trademark-classification",
    query: "NCL 13-2026 Nice Classification Slovakia",
  },
  {
    id: "sk-trademark-law-name",
    targetId: "sk-indprop-trademark-law",
    query: "Act 506 2009 trademarks Decree 567 Slovakia",
  },
  {
    id: "sk-trademark-proceedings-forms-name",
    targetId: "sk-indprop-trademark-proceedings-forms",
    query: "trademark opposition revocation invalidity forms Slovakia",
  },
  {
    id: "hu-trademarks-name",
    targetId: "hu-hipo-trademarks",
    query: "HIPO trademark protection Hungary",
  },
  {
    id: "hu-trademark-filing-name",
    targetId: "hu-hipo-trademark-filing",
    query: "national trademark application Hungary opposition",
  },
  {
    id: "hu-trademark-search-name",
    targetId: "hu-hipo-trademark-search",
    query: "HIPO IP databases E-register trademark",
  },
  {
    id: "hu-trademark-fees-name",
    targetId: "hu-hipo-trademark-fees",
    query: "trademark schedule fees Hungary HUF",
  },
  {
    id: "hu-trademark-classification-name",
    targetId: "hu-hipo-trademark-classification",
    query: "Nice Classification 13th edition 2026 Hungary",
  },
  {
    id: "hu-trademark-law-name",
    targetId: "hu-hipo-trademark-law",
    query: "Act XI 1997 trademarks geographical indications Hungary",
  },
  {
    id: "hu-trademark-proceedings-name",
    targetId: "hu-hipo-trademark-proceedings",
    query: "electronic trademark opposition cancellation revocation HIPO",
  },
  {
    id: "ro-trademarks-name",
    targetId: "ro-osim-trademarks",
    query: "OSIM trademark information Romania",
  },
  {
    id: "ro-trademark-filing-name",
    targetId: "ro-osim-trademark-filing",
    query: "OSIM online trademark filing Romania",
  },
  {
    id: "ro-trademark-search-name",
    targetId: "ro-osim-trademark-search",
    query: "OSIM national trademark online register Romania",
  },
  {
    id: "ro-trademark-fees-name",
    targetId: "ro-osim-trademark-fees",
    query: "OSIM 2026 trademark fees Annex 4 Romania",
  },
  {
    id: "ro-trademark-classification-name",
    targetId: "ro-osim-trademark-classification",
    query: "OSIM Nice classification TMclass goods services Romania",
  },
  {
    id: "ro-trademark-law-name",
    targetId: "ro-osim-trademark-law",
    query: "Law 84 1998 trademarks geographical indications Romania OSIM",
  },
  {
    id: "ro-trademark-proceedings-name",
    targetId: "ro-osim-trademark-proceedings",
    query: "OSIM trademark opposition cancellation appeal forms Romania",
  },
  {
    id: "bg-trademarks-name",
    targetId: "bg-bpo-trademarks",
    query: "Bulgaria Patent Office trademark summary",
  },
  {
    id: "bg-trademark-filing-name",
    targetId: "bg-bpo-trademark-filing",
    query: "Bulgaria national trademark registration filing opposition",
  },
  {
    id: "bg-trademark-search-name",
    targetId: "bg-bpo-trademark-search",
    query: "Bulgaria State Register trademarks BPO",
  },
  {
    id: "bg-trademark-fees-name",
    targetId: "bg-bpo-trademark-fees",
    query: "Bulgaria Patent Office tariff fees 2026 trademarks",
  },
  {
    id: "bg-trademark-classification-name",
    targetId: "bg-bpo-trademark-classification",
    query: "Bulgaria trademark Nice classes goods services list",
  },
  {
    id: "bg-trademark-law-name",
    targetId: "bg-bpo-trademark-law",
    query: "Bulgaria Trademarks Geographical Indications Act 2026",
  },
  {
    id: "bg-trademark-proceedings-name",
    targetId: "bg-bpo-trademark-proceedings",
    query: "Bulgaria trademark opposition appeal revocation invalidity BPO",
  },
  {
    id: "hr-trademarks-name",
    targetId: "hr-dziv-trademarks",
    query: "Croatia SIPO trademark registration process",
  },
  {
    id: "hr-trademark-filing-name",
    targetId: "hr-dziv-trademark-filing",
    query: "Croatia SIPO e filing trademarks opposition revocation invalidity",
  },
  {
    id: "hr-trademark-search-name",
    targetId: "hr-dziv-trademark-search",
    query: "Croatia trademark e register DZIV",
  },
  {
    id: "hr-trademark-fees-name",
    targetId: "hr-dziv-trademark-fees",
    query: "Croatia SIPO trademark procedural fees costs",
  },
  {
    id: "hr-trademark-classification-name",
    targetId: "hr-dziv-trademark-classification",
    query: "Croatia trademark Nice classification TMclass goods services",
  },
  {
    id: "hr-trademark-law-name",
    targetId: "hr-dziv-trademark-law",
    query: "Croatia Trademark Act 14 2019 Trademark Regulations 38 2019",
  },
  {
    id: "hr-trademark-proceedings-name",
    targetId: "hr-dziv-trademark-proceedings",
    query: "Croatia trademark opposition revocation invalidity forms DZIV",
  },
  {
    id: "si-trademarks-name",
    targetId: "si-sipo-trademarks",
    query: "Slovenia trademark protection SIPO URSIL",
  },
  {
    id: "si-trademark-filing-name",
    targetId: "si-sipo-trademark-filing",
    query: "Slovenia registering trademark Nice application opposition SIPO",
  },
  {
    id: "si-trademark-search-name",
    targetId: "si-sipo-trademark-search",
    query: "Slovenia SIPO marks database applications registered marks",
  },
  {
    id: "si-trademark-fees-name",
    targetId: "si-sipo-trademark-fees",
    query: "Slovenian Intellectual Property Office fees charges trademarks",
  },
  {
    id: "si-trademark-classification-name",
    targetId: "si-sipo-trademark-classification",
    query: "Slovenia Nice Classification 13 2026 goods services trademarks",
  },
  {
    id: "si-trademark-law-name",
    targetId: "si-sipo-trademark-law",
    query: "Slovenia Industrial Property Act Trademark Rules PISRS",
  },
  {
    id: "si-trademark-proceedings-name",
    targetId: "si-sipo-trademark-proceedings",
    query: "Slovenia trademark opposition revocation invalidity SIPO",
  },
  {
    id: "gr-trademarks-name",
    targetId: "gr-obi-trademarks",
    query: "Greece OBI National Trademark Register trademarks",
  },
  {
    id: "gr-trademark-filing-name",
    targetId: "gr-obi-trademark-filing",
    query: "Greece OBI electronic trademark filing TAXIS Nice classes",
  },
  {
    id: "gr-trademark-search-name",
    targetId: "gr-obi-trademark-search",
    query: "Greece OBI trademark availability check TMview national register",
  },
  {
    id: "gr-trademark-fees-name",
    targetId: "gr-obi-trademark-fees",
    query: "Greece OBI trademark fees filing additional class opposition renewal",
  },
  {
    id: "gr-trademark-classification-name",
    targetId: "gr-obi-trademark-classification",
    query: "Greece OBI Nice Classification 13 2026 TMclass",
  },
  {
    id: "gr-trademark-law-name",
    targetId: "gr-obi-trademark-law",
    query: "Greece trademark Law 4679 2020 OBI legislation",
  },
  {
    id: "gr-trademark-proceedings-name",
    targetId: "gr-obi-trademark-proceedings",
    query: "Greece OBI Administrative Committee trademarks opposition appeals 2026",
  },
  {
    id: "cy-trademarks-name",
    targetId: "cy-ip-trademarks",
    query: "Cyprus national trademark registration Intellectual Property Section",
  },
  {
    id: "cy-trademark-filing-name",
    targetId: "cy-ip-trademark-filing",
    query: "Cyprus FTM02 trademark application CY Login",
  },
  {
    id: "cy-trademark-search-name",
    targetId: "cy-ip-trademark-search",
    query: "Cyprus Trademarks Register search",
  },
  {
    id: "cy-trademark-fees-name",
    targetId: "cy-ip-trademark-fees",
    query: "Cyprus trademark forms fees opposition FTM14",
  },
  {
    id: "cy-trademark-classification-name",
    targetId: "cy-ip-trademark-classification",
    query: "Cyprus trademark goods services classification FTM03",
  },
  {
    id: "cy-trademark-law-name",
    targetId: "cy-ip-trademark-law",
    query: "Cyprus Trade Marks Law Regulations",
  },
  {
    id: "cy-trademark-proceedings-name",
    targetId: "cy-ip-trademark-proceedings",
    query: "Cyprus trademark opposition revocation invalidity FTM14 FTM27",
  },
  {
    id: "mt-trademarks-name",
    targetId: "mt-iprd-trademarks",
    query: "Malta Industrial Property Registrations Directorate trademarks",
  },
  {
    id: "mt-trademark-filing-name",
    targetId: "mt-iprd-trademark-filing",
    query: "Malta apply trademark online Commerce Department",
  },
  {
    id: "mt-trademark-search-name",
    targetId: "mt-iprd-trademark-search",
    query: "Malta National Trademark Register ips",
  },
  {
    id: "mt-trademark-fees-name",
    targetId: "mt-iprd-trademark-fees",
    query: "Malta trademark fee 115 schedule",
  },
  {
    id: "mt-trademark-classification-name",
    targetId: "mt-iprd-trademark-classification",
    query: "Malta trademark Nice classes TMClass goods services",
  },
  {
    id: "mt-trademark-law-name",
    targetId: "mt-iprd-trademark-law",
    query: "Malta Trademark Act Chapter 597 Trademark Rules 597.04",
  },
  {
    id: "mt-trademark-proceedings-name",
    targetId: "mt-iprd-trademark-proceedings",
    query: "Malta trademark opposition 90 days online",
  },
  {
    id: "ee-trademarks-name",
    targetId: "ee-epa-trademarks",
    query: "Estonian Patent Office Patendiamet trademarks",
  },
  {
    id: "ee-trademark-filing-name",
    targetId: "ee-epa-trademark-filing",
    query: "Estonia national trademark filing application Patent Office",
  },
  {
    id: "ee-trademark-search-name",
    targetId: "ee-epa-trademark-search",
    query: "Estonian Patent Office trademark database daily updated",
  },
  {
    id: "ee-trademark-fees-name",
    targetId: "ee-epa-trademark-fees",
    query: "Estonia trademark filing fees additional class renewal",
  },
  {
    id: "ee-trademark-classification-name",
    targetId: "ee-epa-trademark-classification",
    query: "Estonia Nice Classification 13 2026 goods services",
  },
  {
    id: "ee-trademark-law-name",
    targetId: "ee-epa-trademark-law",
    query: "Estonia Trade Marks Act Patent Office legal acts",
  },
  {
    id: "ee-trademark-proceedings-name",
    targetId: "ee-epa-trademark-proceedings",
    query: "Estonia trademark opposition Board of Appeal two months",
  },
  {
    id: "lv-trademarks-name",
    targetId: "lv-lpo-trademarks",
    query: "Latvian Patent Office trademark services",
  },
  {
    id: "lv-trademark-filing-name",
    targetId: "lv-lpo-trademark-filing",
    query: "Latvia filing trademark application electronic Nice classes",
  },
  {
    id: "lv-trademark-search-name",
    targetId: "lv-lpo-trademark-search",
    query: "Latvia Patent Office trademark database search",
  },
  {
    id: "lv-trademark-fees-name",
    targetId: "lv-lpo-trademark-fees",
    query: "Latvia trademark fees 2026 filing additional class registration",
  },
  {
    id: "lv-trademark-classification-name",
    targetId: "lv-lpo-trademark-classification",
    query: "Latvia Nice Classification 13 2026 goods services",
  },
  {
    id: "lv-trademark-law-name",
    targetId: "lv-lpo-trademark-law",
    query: "Latvia Trade Mark Law Patent Office",
  },
  {
    id: "lv-trademark-proceedings-name",
    targetId: "lv-lpo-trademark-proceedings",
    query: "Latvia trademark opposition appeal revocation invalidity Board of Appeal",
  },
  {
    id: "lt-trademarks-name",
    targetId: "lt-vpb-trademarks",
    query: "Lithuania State Patent Bureau trademarks",
  },
  {
    id: "lt-trademark-filing-name",
    targetId: "lt-vpb-trademark-filing",
    query: "Lithuania trademark registration electronic filing VPB",
  },
  {
    id: "lt-trademark-search-name",
    targetId: "lt-vpb-trademark-search",
    query: "Lithuania VPB trademark databases search",
  },
  {
    id: "lt-trademark-fees-name",
    targetId: "lt-vpb-trademark-fees",
    query: "Lithuania trademark fees filing opposition invalidation",
  },
  {
    id: "lt-trademark-classification-name",
    targetId: "lt-vpb-trademark-classification",
    query: "Lithuania trademark Nice classification goods services TMclass",
  },
  {
    id: "lt-trademark-law-name",
    targetId: "lt-vpb-trademark-law",
    query: "Lithuania Law on Trademarks registration rules",
  },
  {
    id: "lt-trademark-proceedings-name",
    targetId: "lt-vpb-trademark-proceedings",
    query: "Lithuania trademark appeal opposition invalidity cancellation Appeals Division",
  },
  {
    id: "tr-trademarks-name",
    targetId: "tr-turkpatent-trademarks",
    query: "Türkiye trademark TÜRKPATENT application examination opposition",
  },
  {
    id: "tr-trademark-filing-name",
    targetId: "tr-turkpatent-trademark-filing",
    query: "TÜRKPATENT EPATS trademark application",
  },
  {
    id: "tr-trademark-search-name",
    targetId: "tr-turkpatent-trademark-search",
    query: "TÜRKPATENT trademark research file tracking classes bulletin",
  },
  {
    id: "tr-trademark-fees-name",
    targetId: "tr-turkpatent-trademark-fees",
    query: "TÜRKPATENT 2026 trademark fees opposition cancellation",
  },
  {
    id: "tr-trademark-classification-name",
    targetId: "tr-turkpatent-trademark-classification",
    query: "TÜRKPATENT Nice classification goods services MGS TMclass",
  },
  {
    id: "tr-trademark-law-name",
    targetId: "tr-turkpatent-trademark-law",
    query: "6769 Industrial Property Code trademark regulation Türkiye",
  },
  {
    id: "tr-trademark-proceedings-name",
    targetId: "tr-turkpatent-trademark-proceedings",
    query: "TÜRKPATENT trademark opposition appeal re-examination cancellation",
  },
  {
    id: "rs-trademarks-name",
    targetId: "rs-zis-trademarks",
    query: "Serbia trademark Intellectual Property Office examination opposition",
  },
  {
    id: "rs-trademark-filing-name",
    targetId: "rs-zis-trademark-filing",
    query: "Serbia IPO electronic trademark application eApplication",
  },
  {
    id: "rs-trademark-search-name",
    targetId: "rs-zis-trademark-search",
    query: "Serbia E-register national trademarks search",
  },
  {
    id: "rs-trademark-fees-name",
    targetId: "rs-zis-trademark-fees",
    query: "Serbia trademark application registration fees RSD",
  },
  {
    id: "rs-trademark-classification-name",
    targetId: "rs-zis-trademark-classification",
    query: "Serbia Nice Classification 13 2026 trademarks",
  },
  {
    id: "rs-trademark-law-name",
    targetId: "rs-zis-trademark-law",
    query: "Serbia Trademark Law 6 2020 methodology opposition regulation",
  },
  {
    id: "rs-trademark-proceedings-name",
    targetId: "rs-zis-trademark-proceedings",
    query: "Serbia trademark opposition cancellation non-use forms instructions",
  },
  {
    id: "sa-trademarks-name",
    targetId: "sa-saip-trademarks",
    query: "Saudi Authority Intellectual Property trademark services",
  },
  {
    id: "sa-trademark-filing-name",
    targetId: "sa-saip-trademark-filing",
    query: "SAIP Unified Intellectual Property Platform trademark registration filing",
  },
  {
    id: "sa-trademark-search-name",
    targetId: "sa-saip-trademark-search",
    query: "SAIP search platform registered trademarks Saudi national database",
  },
  {
    id: "sa-trademark-fees-name",
    targetId: "sa-saip-trademark-fees",
    query: "SAIP trademark registration application publication certificate fees SAR",
  },
  {
    id: "sa-trademark-classification-name",
    targetId: "sa-saip-trademark-classification",
    query: "Saudi SAIP Nice Classification 45 classes goods services trademark",
  },
  {
    id: "sa-trademark-law-name",
    targetId: "sa-saip-trademark-law",
    query: "Saudi SAIP trademark laws regulations intellectual property",
  },
  {
    id: "sa-trademark-proceedings-name",
    targetId: "sa-saip-trademark-proceedings",
    query: "SAIP trademark appeal objection cancellation litigation paths",
  },
  {
    id: "ae-trademarks-name",
    targetId: "ae-moet-trademarks",
    query: "UAE Ministry Economy Tourism trademark services registration renewal opposition",
  },
  {
    id: "ae-trademark-filing-name",
    targetId: "ae-moet-trademark-filing",
    query: "UAE MoET register trademark application examination publication",
  },
  {
    id: "ae-trademark-search-name",
    targetId: "ae-moet-trademark-search",
    query: "UAE MoET trademark inquiry search service",
  },
  {
    id: "ae-trademark-fees-name",
    targetId: "ae-moet-trademark-fees",
    query: "UAE trademark examination publication registration renewal fees AED MoET",
  },
  {
    id: "ae-trademark-classification-name",
    targetId: "ae-moet-trademark-classification",
    query: "UAE Ministry Economy Nice Classification trademark goods services",
  },
  {
    id: "ae-trademark-law-name",
    targetId: "ae-moet-trademark-law",
    query: "UAE Federal Decree Law 36 2021 trademarks Cabinet Decision 57 2022",
  },
  {
    id: "ae-trademark-proceedings-name",
    targetId: "ae-moet-trademark-proceedings",
    query: "UAE MoET trademark opposition objection response appeal procedure",
  },
  {
    id: "qa-trademarks-name",
    targetId: "qa-moci-trademarks",
    query: "Qatar MOCI intellectual property trademark protection",
  },
  {
    id: "qa-trademark-filing-name",
    targetId: "qa-moci-trademark-filing",
    query: "Qatar MOCI trademark registration filing publication 60 days",
  },
  {
    id: "qa-trademark-search-name",
    targetId: "qa-moci-trademark-search",
    query: "Qatar MOCI trademark database QA published registered marks",
  },
  {
    id: "qa-trademark-fees-name",
    targetId: "qa-moci-trademark-fees",
    query: "Qatar MOCI trademark fees 1000 500 3000 QAR",
  },
  {
    id: "qa-trademark-classification-name",
    targetId: "qa-moci-trademark-classification",
    query: "Qatar MOCI Nice classification goods services trademarks",
  },
  {
    id: "qa-trademark-law-name",
    targetId: "qa-moci-trademark-law",
    query: "Qatar trademark Law 9 2002 GCC Law 7 2014 MOCI",
  },
  {
    id: "qa-trademark-proceedings-name",
    targetId: "qa-moci-trademark-proceedings",
    query: "Qatar MOCI trademark opposition grievance hearing forms",
  },
  {
    id: "om-trademarks-name",
    targetId: "om-mociip-trademarks",
    query: "Oman National Intellectual Property Office MoCIIP trademark services",
  },
  {
    id: "om-trademark-filing-name",
    targetId: "om-mociip-trademark-filing",
    query: "Oman apply trademark MoCIIP national filing single class",
  },
  {
    id: "om-trademark-search-name",
    targetId: "om-mociip-trademark-search",
    query: "Oman verify trademark availability search before registration",
  },
  {
    id: "om-trademark-fees-name",
    targetId: "om-mociip-trademark-fees",
    query: "Oman trademark renewal transfer publication licence fees MoCIIP",
  },
  {
    id: "om-trademark-classification-name",
    targetId: "om-mociip-trademark-classification",
    query: "Oman trademark Nice international classification single class",
  },
  {
    id: "om-trademark-law-name",
    targetId: "om-mociip-trademark-law",
    query: "Oman Royal Decree 33 2017 GCC Trademark Law Industrial Property Rights 67 2008",
  },
  {
    id: "om-trademark-proceedings-name",
    targetId: "om-mociip-trademark-proceedings",
    query: "Oman trademark opposition objection registrar rejection hearing",
  },
  {
    id: "bh-trademarks-name",
    targetId: "bh-moic-trademarks",
    query: "Bahrain MOIC Industrial Property trademark services",
  },
  {
    id: "bh-trademark-filing-name",
    targetId: "bh-moic-trademark-filing",
    query: "Bahrain MOIC trademark electronic filing one class Nice",
  },
  {
    id: "bh-trademark-search-name",
    targetId: "bh-moic-trademark-search",
    query: "Bahrain MOIC WIPO PUBLISH trademark search registered marks",
  },
  {
    id: "bh-trademark-fees-name",
    targetId: "bh-moic-trademark-fees",
    query: "Bahrain MOIC trademark service fees examination registration",
  },
  {
    id: "bh-trademark-classification-name",
    targetId: "bh-moic-trademark-classification",
    query: "Bahrain trademark classification goods services Nice MOIC",
  },
  {
    id: "bh-trademark-law-name",
    targetId: "bh-moic-trademark-law",
    query: "Bahrain Law 6 2014 GCC Trademark Law 2021 amendment legal regulations",
  },
  {
    id: "bh-trademark-proceedings-name",
    targetId: "bh-moic-trademark-proceedings",
    query: "Bahrain MOIC trademark opposition grievance procedure guidelines",
  },
  {
    id: "kw-trademarks-name",
    targetId: "kw-moci-trademarks",
    query: "Kuwait MOCI automated trademark registration services",
  },
  {
    id: "kw-trademark-filing-name",
    targetId: "kw-moci-trademark-filing",
    query: "Kuwait MOCI trademark filing deposit local foreign registration",
  },
  {
    id: "kw-trademark-search-name",
    targetId: "kw-moci-trademark-search",
    query: "Kuwait MOCI preliminary trademark examination search",
  },
  {
    id: "kw-trademark-fees-name",
    targetId: "kw-moci-trademark-fees",
    query: "Kuwait trademark filing publication registration renewal fees KD",
  },
  {
    id: "kw-trademark-renewal-name",
    targetId: "kw-moci-trademark-renewal",
    query: "Kuwait trademark renewal ten years six months MOCI",
  },
  {
    id: "kw-trademark-law-name",
    targetId: "kw-moci-trademark-law",
    query: "Kuwait Law 13 2015 unified GCC Trademark Law implementing regulation",
  },
  {
    id: "kw-trademark-proceedings-name",
    targetId: "kw-moci-trademark-proceedings",
    query: "Kuwait MOCI trademark opposition grievance refusal hearing",
  },
  {
    id: "jo-trademarks-name",
    targetId: "jo-ippd-trademarks",
    query: "Jordan IPPD Ministry trademark services industrial property",
  },
  {
    id: "jo-trademark-filing-name",
    targetId: "jo-ippd-trademark-filing",
    query: "Jordan trademark electronic filing IPPD e-service registration",
  },
  {
    id: "jo-trademark-search-name",
    targetId: "jo-ippd-trademark-search",
    query: "Jordan official trademark search IP Publish mark owner",
  },
  {
    id: "jo-trademark-fees-name",
    targetId: "jo-ippd-trademark-fees",
    query: "Jordan trademark filing publication registration renewal opposition fees",
  },
  {
    id: "jo-trademark-classification-name",
    targetId: "jo-ippd-trademark-classification",
    query: "Jordan IPPD trademark goods services classification TMClass Nice",
  },
  {
    id: "jo-trademark-law-name",
    targetId: "jo-ippd-trademark-law",
    query: "Jordan Trademark Law 33 1952 regulations amendments fees",
  },
  {
    id: "jo-trademark-proceedings-name",
    targetId: "jo-ippd-trademark-proceedings",
    query: "Jordan trademark opposition cancellation appeal IPPD cases",
  },
  {
    id: "bd-trademarks-name",
    targetId: "bd-dpdt-trademarks",
    query: "Bangladesh DPDT trademark services filing Nice classification",
  },
  {
    id: "bd-trademark-filing-name",
    targetId: "bd-dpdt-trademark-filing",
    query: "Bangladesh DPDT online trademark filing TM-1 WIPO efiling",
  },
  {
    id: "bd-trademark-search-name",
    targetId: "bd-dpdt-trademark-search",
    query: "Bangladesh DPDT TM-4 trademark search request",
  },
  {
    id: "bd-trademark-fees-name",
    targetId: "bd-dpdt-trademark-fees",
    query: "Bangladesh DPDT revised trademark fee schedule A-Challan",
  },
  {
    id: "bd-trademark-classification-name",
    targetId: "bd-dpdt-trademark-classification",
    query: "Bangladesh DPDT Nice Classification trademark goods services",
  },
  {
    id: "bd-trademark-law-name",
    targetId: "bd-dpdt-trademark-law",
    query: "Bangladesh Trademark Act 2009 amendment 2015 Trademark Rules 2015 DPDT",
  },
  {
    id: "bd-trademark-proceedings-name",
    targetId: "bd-dpdt-trademark-proceedings",
    query: "Bangladesh DPDT trademark opposition TM-5 counterstatement TM-6 hearing TM-7",
  },
  {
    id: "np-industrial-property-portal-name",
    targetId: "np-doi-industrial-property-portal",
    query: "Nepal Department of Industry trademark design patent industrial property",
  },
  {
    id: "np-trademark-filing-name",
    targetId: "np-doi-trademark-filing",
    query: "Nepal DOI domestic foreign trademark registration renewal transfer requirements",
  },
  {
    id: "np-trademark-fees-name",
    targetId: "np-doi-trademark-fees",
    query: "Nepal DOI trademark application registration fees citizen charter",
  },
  {
    id: "np-trademark-law-name",
    targetId: "np-doi-trademark-law",
    query: "Nepal Patent Design and Trademark Act 2022 1965 DOI",
  },
  {
    id: "np-trademark-guidelines-name",
    targetId: "np-doi-trademark-guidelines",
    query: "Nepal DOI official trademark guideline collective mark guideline",
  },
  {
    id: "np-trademark-proceedings-name",
    targetId: "np-doi-trademark-proceedings",
    query: "Nepal DOI trademark complaint Law Decision Implementation Section FAQ",
  },
  {
    id: "my-trademarks-name",
    targetId: "my-myipo-trademarks",
    query: "Malaysia MyIPO trademark public services filing search journal",
  },
  {
    id: "my-trademark-filing-name",
    targetId: "my-myipo-trademark-filing",
    query: "Malaysia MyIPO applying trademark IP Online filing preliminary advice",
  },
  {
    id: "my-trademark-search-name",
    targetId: "my-myipo-trademark-search",
    query: "Malaysia MyIPO official trademark search IP Online",
  },
  {
    id: "my-trademark-fees-name",
    targetId: "my-myipo-trademark-fees",
    query: "Malaysia MyIPO trademark forms fees Trademarks Act 2019",
  },
  {
    id: "my-trademark-classification-name",
    targetId: "my-myipo-trademark-classification",
    query: "Malaysia MyIPO goods services pre approved Nice classification",
  },
  {
    id: "my-trademark-law-name",
    targetId: "my-myipo-trademark-law",
    query: "Malaysia Trademarks Act 2019 regulations MyIPO law",
  },
  {
    id: "my-trademark-guidelines-2026-name",
    targetId: "my-myipo-trademark-guidelines-2026",
    query: "Malaysia MyIPO Guidelines Trademark 2019 VA1 2026",
  },
  {
    id: "my-trademark-proceedings-name",
    targetId: "my-myipo-trademark-proceedings",
    query: "Malaysia MyIPO trademark opposition hearing appeal renewal proceedings",
  },
  {
    id: "ph-trademarks-name",
    targetId: "ph-ipophl-trademarks",
    query: "Philippines IPOPHL trademark services search filing publication maintenance",
  },
  {
    id: "ph-trademark-filing-name",
    targetId: "ph-ipophl-trademark-filing",
    query: "Philippines IPOPHL eTMFile trademark online filing application",
  },
  {
    id: "ph-trademark-search-name",
    targetId: "ph-ipophl-trademark-search",
    query: "Philippines IPOPHL trademark database search status application holder",
  },
  {
    id: "ph-trademark-fees-name",
    targetId: "ph-ipophl-trademark-fees",
    query: "Philippines IPOPHL trademark fees filing renewal DAU publication",
  },
  {
    id: "ph-trademark-classification-name",
    targetId: "ph-ipophl-trademark-classification",
    query: "Philippines IPOPHL Nice classification goods services eTMFile",
  },
  {
    id: "ph-trademark-law-name",
    targetId: "ph-ipophl-trademark-law",
    query: "Philippines IP Code trademark regulations 2023 IPOPHL",
  },
  {
    id: "ph-trademark-examination-guidelines-name",
    targetId: "ph-ipophl-trademark-examination-guidelines",
    query: "Philippines IPOPHL trademark examination guidelines Bureau Trademarks",
  },
  {
    id: "ph-trademark-proceedings-name",
    targetId: "ph-ipophl-trademark-proceedings",
    query: "Philippines IPOPHL trademark opposition cancellation inter partes Bureau Legal Affairs",
  },
  {
    id: "id-trademarks-name",
    targetId: "id-djki-trademarks",
    query: "Indonesia DJKI trademark services registration search classification",
  },
  {
    id: "id-trademark-filing-name",
    targetId: "id-djki-trademark-filing",
    query: "Indonesia DJKI online trademark filing merek application procedure",
  },
  {
    id: "id-trademark-search-name",
    targetId: "id-djki-trademark-search",
    query: "Indonesia DJKI PDKI trademark search registered pending status",
  },
  {
    id: "id-trademark-fees-name",
    targetId: "id-djki-trademark-fees",
    query: "Indonesia DJKI trademark PNBP fees filing renewal opposition appeal",
  },
  {
    id: "id-trademark-classification-name",
    targetId: "id-djki-trademark-classification",
    query: "Indonesia DJKI Sistem Klasifikasi Merek Nice goods services",
  },
  {
    id: "id-trademark-law-name",
    targetId: "id-djki-trademark-law",
    query: "Indonesia Law 20 2016 trademarks geographical indications DJKI registration regulation",
  },
  {
    id: "id-trademark-examination-guidance-name",
    targetId: "id-djki-trademark-examination-guidance",
    query: "Indonesia DJKI substantive trademark examination technical guidance",
  },
  {
    id: "id-trademark-proceedings-name",
    targetId: "id-djki-trademark-proceedings",
    query: "Indonesia DJKI trademark opposition rebuttal hearing appeal forms procedures",
  },
  {
    id: "vn-trademarks-name",
    targetId: "vn-ipvn-trademarks",
    query: "Vietnam IPVN trademark services portal procedures search classification",
  },
  {
    id: "vn-trademark-filing-name",
    targetId: "vn-ipvn-trademark-filing",
    query: "Vietnam IPVN trademark filing forms online application procedures 2026",
  },
  {
    id: "vn-trademark-search-name",
    targetId: "vn-ipvn-trademark-search",
    query: "Vietnam IPVN WIPO Publish trademark search published registered marks",
  },
  {
    id: "vn-trademark-fees-name",
    targetId: "vn-ipvn-trademark-fees",
    query: "Vietnam IPVN trademark fees charges filing examination registration renewal",
  },
  {
    id: "vn-trademark-classification-name",
    targetId: "vn-ipvn-trademark-classification",
    query: "Vietnam IPVN Nice Classification 13-2026 goods services trademark",
  },
  {
    id: "vn-trademark-law-name",
    targetId: "vn-ipvn-trademark-law",
    query: "Vietnam IPVN intellectual property law trademark decree circular legal documents",
  },
  {
    id: "lk-trademarks-name",
    targetId: "lk-nipo-trademarks",
    query: "Sri Lanka NIPO trademark services registration search forms fees",
  },
  {
    id: "lk-trademark-filing-name",
    targetId: "lk-nipo-trademark-filing",
    query: "Sri Lanka NIPO trademark registration procedure M1 examination Gazette opposition",
  },
  {
    id: "lk-trademark-search-name",
    targetId: "lk-nipo-trademark-search",
    query: "Sri Lanka NIPO online public trademark search database",
  },
  {
    id: "lk-trademark-forms-name",
    targetId: "lk-nipo-trademark-forms",
    query: "Sri Lanka NIPO trademark forms M01 M02 renewal assignment publication",
  },
  {
    id: "lk-trademark-fees-name",
    targetId: "lk-nipo-trademark-fees",
    query: "Sri Lanka NIPO trademark fees application opposition registration renewal Gazette",
  },
  {
    id: "lk-intellectual-property-act-name",
    targetId: "lk-nipo-intellectual-property-act",
    query: "Sri Lanka Intellectual Property Act 36 2003 trademarks marks registration",
  },
  {
    id: "lk-intellectual-property-regulations-name",
    targetId: "lk-nipo-intellectual-property-regulations",
    query: "Sri Lanka NIPO Intellectual Property Regulations 2006 trademark 2026 amendment",
  },
  {
    id: "th-trademarks-name",
    targetId: "th-dip-trademarks",
    query: "Thailand DIP trademark services e-filing search forms fees law",
  },
  {
    id: "th-trademark-filing-name",
    targetId: "th-dip-trademark-filing",
    query: "Thailand DIP trademark electronic filing e-Filing registration application",
  },
  {
    id: "th-trademark-search-name",
    targetId: "th-dip-trademark-search",
    query: "Thailand DIP public trademark search database similar mark",
  },
  {
    id: "th-trademark-forms-name",
    targetId: "th-dip-trademark-forms",
    query: "Thailand DIP trademark forms ก.01 ก.02 application opposition guide",
  },
  {
    id: "th-trademark-fees-name",
    targetId: "th-dip-trademark-fees",
    query: "Thailand DIP trademark fees application registration opposition renewal",
  },
  {
    id: "th-trademark-goods-services-name",
    targetId: "th-dip-trademark-goods-services",
    query: "Thailand DIP recommended trademark goods services classification list",
  },
  {
    id: "th-trademark-law-name",
    targetId: "th-dip-trademark-law",
    query: "Thailand Trademark Act B.E. 2534 amended 2559 regulations DIP",
  },
  {
    id: "th-trademark-examination-manual-name",
    targetId: "th-dip-trademark-examination-manual",
    query: "Thailand DIP trademark registration examination manual 2565 2022",
  },
  {
    id: "za-trademarks-name",
    targetId: "za-cipc-trademarks",
    query: "South Africa CIPC trade mark registration portal search filing classification",
  },
  {
    id: "za-trademark-filing-name",
    targetId: "za-cipc-trademark-filing",
    query: "South Africa CIPC IPOnline trade mark electronic filing application",
  },
  {
    id: "za-trademark-search-name",
    targetId: "za-cipc-trademark-search",
    query: "South Africa CIPC free trade mark register search IPOnline",
  },
  {
    id: "za-trademark-fees-name",
    targetId: "za-cipc-trademark-fees",
    query: "South Africa CIPC trade mark forms fees TM1 TM2 renewal assignment",
  },
  {
    id: "za-trademark-classification-name",
    targetId: "za-cipc-trademark-classification",
    query: "South Africa CIPC Nice Classification 13 2026 class headings explanatory notes",
  },
  {
    id: "za-trademark-law-name",
    targetId: "za-cipc-trademark-law",
    query: "South Africa Trade Marks Act 194 1993 Trade Mark Regulations CIPC",
  },
  {
    id: "za-trademark-maintenance-name",
    targetId: "za-cipc-trademark-maintenance",
    query: "South Africa CIPC trade mark maintenance renew restoration extension oppose prosecute",
  },
  {
    id: "za-trademark-guidelines-practice-notes-name",
    targetId: "za-cipc-trademark-guidelines-practice-notes",
    query: "South Africa CIPC trade mark guidelines practice notes registrar",
  },
  {
    id: "cl-trademarks-name",
    targetId: "cl-inapi-trademarks",
    query: "Chile INAPI trademark portal registration search filing classification",
  },
  {
    id: "cl-trademark-filing-name",
    targetId: "cl-inapi-trademark-filing",
    query: "Chile INAPI online trademark application filing payment",
  },
  {
    id: "cl-trademark-search-name",
    targetId: "cl-inapi-trademark-search",
    query: "Chile INAPI trademark database search application registration owner class status",
  },
  {
    id: "cl-trademark-fees-name",
    targetId: "cl-inapi-trademark-fees",
    query: "Chile INAPI trademark fees UTM filing registration renewal",
  },
  {
    id: "cl-trademark-classification-name",
    targetId: "cl-inapi-trademark-classification",
    query: "Chile INAPI goods services classifier Nice NIZA accepted descriptions",
  },
  {
    id: "cl-trademark-directives-2026-name",
    targetId: "cl-inapi-trademark-directives-2026",
    query: "Chile INAPI Trademark Directives 2026 examination registration opposition appeal",
  },
  {
    id: "cl-trademark-law-name",
    targetId: "cl-inapi-trademark-law",
    query: "Chile INAPI industrial property law trademark legislation regulations",
  },
  {
    id: "cl-trademark-proceedings-name",
    targetId: "cl-inapi-trademark-proceedings",
    query: "Chile INAPI trademark opposition proceedings nullity appeal online filing",
  },
  {
    id: "co-trademarks-name",
    targetId: "co-sic-trademarks",
    query: "Colombia SIC trademark portal registration SIPI search filing classification",
  },
  {
    id: "co-trademark-filing-name",
    targetId: "co-sic-trademark-filing",
    query: "Colombia SIC online trademark registration SIPI filing application",
  },
  {
    id: "co-trademark-search-name",
    targetId: "co-sic-trademark-search",
    query: "Colombia SIC SIPI trademark search distinctive signs database status documents",
  },
  {
    id: "co-trademark-fees-name",
    targetId: "co-sic-trademark-fees",
    query: "Colombia SIC 2026 trademark fees registration opposition cancellation assignment",
  },
  {
    id: "co-trademark-classification-name",
    targetId: "co-sic-trademark-classification",
    query: "Colombia SIC Nice Classification goods services trademark classes",
  },
  {
    id: "co-trademark-procedure-2026-name",
    targetId: "co-sic-trademark-procedure-2026",
    query: "Colombia SIC PI01-P01 v12 2026 trademark registration examination procedure",
  },
  {
    id: "co-trademark-law-name",
    targetId: "co-sic-trademark-law",
    query: "Colombia SIC Decision 486 trademark law industrial property regulations",
  },
  {
    id: "co-trademark-proceedings-name",
    targetId: "co-sic-trademark-proceedings",
    query: "Colombia SIC trademark opposition cancellation non-use notoriety proceedings",
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
