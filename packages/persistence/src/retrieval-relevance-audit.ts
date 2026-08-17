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
  {
    id: "is-trademarks-name",
    targetId: "is-isipo-trademarks",
    query: "Iceland ISIPO trademark registration filing search classification opposition",
  },
  {
    id: "is-trademark-filing-name",
    targetId: "is-isipo-trademark-filing",
    query: "Iceland ISIPO online trademark application electronic certificate filing",
  },
  {
    id: "is-trademark-search-name",
    targetId: "is-isipo-trademark-search",
    query: "Iceland ISIPO trademark database search classes status advanced search",
  },
  {
    id: "is-trademark-forms-name",
    targetId: "is-isipo-trademark-forms",
    query:
      "Iceland ISIPO trademark forms collective certification renewal assignment power attorney",
  },
  {
    id: "is-trademark-fees-name",
    targetId: "is-isipo-trademark-fees",
    query: "Iceland ISIPO trademark fees application renewal opposition revocation appeal",
  },
  {
    id: "is-trademark-classification-name",
    targetId: "is-isipo-trademark-classification",
    query: "Iceland ISIPO Nice classification goods services 45 classes 2026",
  },
  {
    id: "is-trademark-law-name",
    targetId: "is-isipo-trademark-law",
    query: "Iceland Trademark Act 45 1997 Regulation 850 2020 Advertisement 1355 2025",
  },
  {
    id: "is-trademark-proceedings-name",
    targetId: "is-isipo-trademark-proceedings",
    query: "Iceland ISIPO trademark opposition two months proceedings appeal",
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
  {
    id: "ma-ompic-trademark-portal-name",
    targetId: "ma-ompic-trademark-portal",
    query: "marque",
  },
  {
    id: "ma-ompic-trademark-filing-name",
    targetId: "ma-ompic-trademark-filing",
    query: "déposer marque",
  },
  {
    id: "ma-ompic-trademark-search-name",
    targetId: "ma-ompic-trademark-search",
    query: "recherche marques nationales",
  },
  {
    id: "ma-ompic-trademark-forms-name",
    targetId: "ma-ompic-trademark-forms",
    query: "formulaire marque",
  },
  {
    id: "ma-ompic-trademark-fees-name",
    targetId: "ma-ompic-trademark-fees",
    query: "tarifs",
  },
  {
    id: "ma-ompic-nice-classification-name",
    targetId: "ma-ompic-nice-classification",
    query: "classification de Nice",
  },
  {
    id: "ma-ompic-trademark-legal-texts-name",
    targetId: "ma-ompic-trademark-legal-texts",
    query: "loi propriété industrielle",
  },
  {
    id: "ma-ompic-trademark-opposition-name",
    targetId: "ma-ompic-trademark-opposition",
    query: "opposition marque",
  },
  {
    id: "ar-inpi-trademark-portal-name",
    targetId: "ar-inpi-trademark-portal",
    query: "marcas",
  },
  {
    id: "ar-inpi-trademark-filing-name",
    targetId: "ar-inpi-trademark-filing",
    query: "solicitud nueva marca",
  },
  {
    id: "ar-inpi-trademark-search-name",
    targetId: "ar-inpi-trademark-search",
    query: "buscador de marcas",
  },
  {
    id: "ar-inpi-trademark-fees-name",
    targetId: "ar-inpi-trademark-fees",
    query: "aranceles marcas",
  },
  {
    id: "ar-inpi-trademark-classification-name",
    targetId: "ar-inpi-trademark-classification",
    query: "clasificación de marcas",
  },
  {
    id: "ar-inpi-trademark-legal-texts-name",
    targetId: "ar-inpi-trademark-legal-texts",
    query: "ley de marcas",
  },
  {
    id: "ar-inpi-trademark-opposition-name",
    targetId: "ar-inpi-trademark-opposition",
    query: "oponerse a una marca",
  },
  {
    id: "ar-inpi-trademark-renewal-name",
    targetId: "ar-inpi-trademark-renewal",
    query: "renovar una marca",
  },
  {
    id: "pe-indecopi-trademark-portal-name",
    targetId: "pe-indecopi-trademark-portal",
    query: "registra tu marca",
  },
  {
    id: "pe-indecopi-trademark-filing-name",
    targetId: "pe-indecopi-trademark-filing",
    query: "registro virtual de marcas",
  },
  {
    id: "pe-indecopi-trademark-search-name",
    targetId: "pe-indecopi-trademark-search",
    query: "busca tu marca",
  },
  {
    id: "pe-indecopi-tupa-2026-name",
    targetId: "pe-indecopi-tupa-2026",
    query: "TUPA consolidado 2026",
  },
  {
    id: "pe-indecopi-trademark-classification-name",
    targetId: "pe-indecopi-trademark-classification",
    query: "buscador peruanizado",
  },
  {
    id: "pe-indecopi-trademark-legal-texts-name",
    targetId: "pe-indecopi-trademark-legal-texts",
    query: "Decisión 486 propiedad industrial",
  },
  {
    id: "pe-indecopi-trademark-opposition-name",
    targetId: "pe-indecopi-trademark-opposition",
    query: "oposición registro marca",
  },
  {
    id: "pe-indecopi-trademark-renewal-name",
    targetId: "pe-indecopi-trademark-renewal",
    query: "renovar registro marca",
  },
  {
    id: "ke-kipi-trademark-portal-name",
    targetId: "ke-kipi-trademark-portal",
    query: "trade marks Nice 13th edition",
  },
  {
    id: "ke-kipi-trademark-filing-name",
    targetId: "ke-kipi-trademark-filing",
    query: "TM2 application registration mark",
  },
  {
    id: "ke-kipi-trademark-search-name",
    targetId: "ke-kipi-trademark-search",
    query: "TM27 search preliminary advice distinctiveness",
  },
  {
    id: "ke-kipi-trademark-forms-name",
    targetId: "ke-kipi-trademark-forms",
    query: "trademark forms TM6 TM10",
  },
  {
    id: "ke-kipi-trademark-fees-name",
    targetId: "ke-kipi-trademark-fees",
    query: "trade marks fees schedule",
  },
  {
    id: "ke-kipi-trademark-legal-texts-name",
    targetId: "ke-kipi-trademark-legal-texts",
    query: "Trademarks Act Kenya",
  },
  {
    id: "ke-kipi-trademark-rulings-name",
    targetId: "ke-kipi-trademark-rulings",
    query: "trade mark rulings opposition expungement",
  },
  {
    id: "hk-ipd-trademark-portal-name",
    targetId: "hk-ipd-trademark-portal",
    query: "trade marks Hong Kong",
  },
  {
    id: "hk-ipd-trademark-filing-name",
    targetId: "hk-ipd-trademark-filing",
    query: "trade mark e-filing",
  },
  {
    id: "hk-ipd-trademark-search-name",
    targetId: "hk-ipd-trademark-search",
    query: "online trade mark search",
  },
  {
    id: "hk-ipd-trademark-forms-fees-name",
    targetId: "hk-ipd-trademark-forms-fees",
    query: "trade marks forms fees T2",
  },
  {
    id: "hk-ipd-trademark-classification-name",
    targetId: "hk-ipd-trademark-classification",
    query: "Nice Classification 13th edition 2026",
  },
  {
    id: "hk-ipd-trademark-legal-texts-name",
    targetId: "hk-ipd-trademark-legal-texts",
    query: "Trade Marks Ordinance Cap 559 Rules 559A",
  },
  {
    id: "hk-ipd-trademark-work-manual-name",
    targetId: "hk-ipd-trademark-work-manual",
    query: "Trade Marks Registry Work Manual",
  },
  {
    id: "hk-ipd-trademark-opposition-name",
    targetId: "hk-ipd-trademark-opposition",
    query: "trade mark opposition",
  },
  {
    id: "il-ilpo-trademark-portal-name",
    targetId: "il-ilpo-trademark-portal",
    query: "Israel Patent Office trademarks",
  },
  {
    id: "il-ilpo-trademark-filing-name",
    targetId: "il-ilpo-trademark-filing",
    query: "trademark registration online application",
  },
  {
    id: "il-ilpo-trademark-search-name",
    targetId: "il-ilpo-trademark-search",
    query: "trademarks search Israel",
  },
  {
    id: "il-ilpo-trademark-search-fees-name",
    targetId: "il-ilpo-trademark-search-fees",
    query: "trademark search fee Rule 78A",
  },
  {
    id: "il-ilpo-trademark-classification-name",
    targetId: "il-ilpo-trademark-classification",
    query: "Nice classification goods services 45 classes",
  },
  {
    id: "il-ilpo-trademark-legal-texts-name",
    targetId: "il-ilpo-trademark-legal-texts",
    query: "Trade Marks Ordinance 1972",
  },
  {
    id: "il-ilpo-registrar-circulars-name",
    targetId: "il-ilpo-registrar-circulars",
    query: "Registrar circulars trademarks",
  },
  {
    id: "il-ilpo-trademark-opposition-name",
    targetId: "il-ilpo-trademark-opposition",
    query: "trademark opposition three months",
  },
  {
    id: "il-ilpo-trademark-renewal-name",
    targetId: "il-ilpo-trademark-renewal",
    query: "trademark renewal",
  },
  {
    id: "ua-nipo-trademark-portal-name",
    targetId: "ua-nipo-trademark-portal",
    query: "торговельні марки NIPO Ukraine",
  },
  {
    id: "ua-nipo-trademark-filing-name",
    targetId: "ua-nipo-trademark-filing",
    query: "електронне подання заявки знак для товарів послуг",
  },
  {
    id: "ua-nipo-trademark-search-name",
    targetId: "ua-nipo-trademark-search",
    query: "пошук торговельна марка заявка реєстрація",
  },
  {
    id: "ua-nipo-trademark-fees-name",
    targetId: "ua-nipo-trademark-fees",
    query: "збори державне мито торговельна марка",
  },
  {
    id: "ua-nipo-trademark-classification-name",
    targetId: "ua-nipo-trademark-classification",
    query: "МКТП 13-2026 Nice Classification",
  },
  {
    id: "ua-nipo-trademark-legal-texts-name",
    targetId: "ua-nipo-trademark-legal-texts",
    query: "Закон охорону прав на знаки товарів послуг",
  },
  {
    id: "ua-nipo-trademark-examination-rules-name",
    targetId: "ua-nipo-trademark-examination-rules",
    query: "Правила подання заявки торговельну марку експертизи 19889",
  },
  {
    id: "ua-nipo-trademark-appeals-name",
    targetId: "ua-nipo-trademark-appeals",
    query: "Апеляційна палата торговельні марки заперечення",
  },
  {
    id: "tw-tipo-trademark-portal-name",
    targetId: "tw-tipo-trademark-portal",
    query: "TIPO trademarks Taiwan",
  },
  {
    id: "tw-tipo-trademark-filing-name",
    targetId: "tw-tipo-trademark-filing",
    query: "新版商標線上申請 電子送件",
  },
  {
    id: "tw-tipo-trademark-search-name",
    targetId: "tw-tipo-trademark-search",
    query: "new trademark search system",
  },
  {
    id: "tw-tipo-trademark-fees-name",
    targetId: "tw-tipo-trademark-fees",
    query: "商標規費 註冊申請費 延展",
  },
  {
    id: "tw-tipo-trademark-classification-name",
    targetId: "tw-tipo-trademark-classification",
    query: "尼斯第13-2026版 商品 服務",
  },
  {
    id: "tw-tipo-trademark-legal-texts-name",
    targetId: "tw-tipo-trademark-legal-texts",
    query: "Trademark Act Enforcement Rules",
  },
  {
    id: "tw-tipo-trademark-examination-guidelines-name",
    targetId: "tw-tipo-trademark-examination-guidelines",
    query: "商標註冊申請案件程序審查基準",
  },
  {
    id: "tw-tipo-trademark-proceedings-name",
    targetId: "tw-tipo-trademark-proceedings",
    query: "商標爭議案件程序審查基準 異議 評定",
  },
  {
    id: "tw-tipo-trademark-renewal-name",
    targetId: "tw-tipo-trademark-renewal",
    query: "trademark renewal term rights fee",
  },
  {
    id: "kz-qazpatent-trademark-portal-name",
    targetId: "kz-qazpatent-trademark-portal",
    query: "Qazpatent trademark Kazakhstan",
  },
  {
    id: "kz-qazpatent-trademark-filing-name",
    targetId: "kz-qazpatent-trademark-filing",
    query: "electronic trademark application newcab",
  },
  {
    id: "kz-qazpatent-trademark-search-name",
    targetId: "kz-qazpatent-trademark-search",
    query: "State Register of Trademarks search",
  },
  {
    id: "kz-qazpatent-trademark-fees-name",
    targetId: "kz-qazpatent-trademark-fees",
    query: "trademark fee 2026 Nice class item",
  },
  {
    id: "kz-qazpatent-trademark-classification-name",
    targetId: "kz-qazpatent-trademark-classification",
    query: "International Nice Classification goods services",
  },
  {
    id: "kz-qazpatent-trademark-legal-texts-name",
    targetId: "kz-qazpatent-trademark-legal-texts",
    query: "Trademark Law examination rules State Register",
  },
  {
    id: "kz-qazpatent-trademark-examination-name",
    targetId: "kz-qazpatent-trademark-examination",
    query: "trademark preliminary full examination stages",
  },
  {
    id: "kz-qazpatent-trademark-renewal-name",
    targetId: "kz-qazpatent-trademark-renewal",
    query: "trademark extension renewal registration",
  },
  {
    id: "ge-sakpatenti-trademark-portal-name",
    targetId: "ge-sakpatenti-trademark-portal",
    query: "Sakpatenti trademarks Georgia",
  },
  {
    id: "ge-sakpatenti-trademark-filing-name",
    targetId: "ge-sakpatenti-trademark-filing",
    query: "online trademark filing electronic application",
  },
  {
    id: "ge-sakpatenti-trademark-search-name",
    targetId: "ge-sakpatenti-trademark-search",
    query: "trademarks protected in Georgia Nice classes image search",
  },
  {
    id: "ge-sakpatenti-trademark-fees-name",
    targetId: "ge-sakpatenti-trademark-fees",
    query: "trademark fees examination publication registration renewal",
  },
  {
    id: "ge-sakpatenti-trademark-classification-name",
    targetId: "ge-sakpatenti-trademark-classification",
    query: "Nice Classification goods services Vienna marks",
  },
  {
    id: "ge-sakpatenti-trademark-legal-texts-name",
    targetId: "ge-sakpatenti-trademark-legal-texts",
    query: "Trademark Law of Georgia",
  },
  {
    id: "ge-sakpatenti-trademark-practice-name",
    targetId: "ge-sakpatenti-trademark-practice",
    query: "trademark practice distinctiveness likelihood confusion CP3 CP5",
  },
  {
    id: "ge-sakpatenti-trademark-proceedings-name",
    targetId: "ge-sakpatenti-trademark-proceedings",
    query: "trademark registration appeal Chamber of Appeals three months",
  },
  {
    id: "md-agepi-trademark-portal-name",
    targetId: "md-agepi-trademark-portal",
    query: "AGEPI trademarks Moldova",
  },
  {
    id: "md-agepi-trademark-filing-name",
    targetId: "md-agepi-trademark-filing",
    query: "online submission trademark application AGEPI",
  },
  {
    id: "md-agepi-trademark-search-name",
    targetId: "md-agepi-trademark-search",
    query: "national trademark database Moldova marks",
  },
  {
    id: "md-agepi-trademark-fees-name",
    targetId: "md-agepi-trademark-fees",
    query: "trademark filing examination registration renewal fees",
  },
  {
    id: "md-agepi-trademark-classification-name",
    targetId: "md-agepi-trademark-classification",
    query: "NCL 13-2026 Nice Classification Moldova",
  },
  {
    id: "md-agepi-trademark-legal-texts-name",
    targetId: "md-agepi-trademark-legal-texts",
    query: "Law 38 2008 Law 25 2024 trademarks",
  },
  {
    id: "md-agepi-trademark-requirements-name",
    targetId: "md-agepi-trademark-requirements",
    query: "trademark application requirements goods services representative",
  },
  {
    id: "md-agepi-trademark-proceedings-name",
    targetId: "md-agepi-trademark-proceedings",
    query: "trademark opposition Appeals Board AGEPI",
  },
  {
    id: "md-agepi-trademark-renewal-name",
    targetId: "md-agepi-trademark-renewal",
    query: "trademark renewal ten years six month grace period",
  },
  {
    id: "am-aipo-trademark-portal-name",
    targetId: "am-aipo-trademark-portal",
    query: "AIPO trademarks Armenia",
  },
  {
    id: "am-aipo-trademark-filing-name",
    targetId: "am-aipo-trademark-filing",
    query: "trademark electronic filing application Armenia",
  },
  {
    id: "am-aipo-trademark-search-name",
    targetId: "am-aipo-trademark-search",
    query: "national procedure trademark search Nice holder",
  },
  {
    id: "am-aipo-trademark-fees-name",
    targetId: "am-aipo-trademark-fees",
    query: "trademark filing examination registration renewal fees AMD",
  },
  {
    id: "am-aipo-trademark-classification-name",
    targetId: "am-aipo-trademark-classification",
    query: "Nice 13 2026 classification Armenia",
  },
  {
    id: "am-aipo-trademark-legal-texts-name",
    targetId: "am-aipo-trademark-legal-texts",
    query: "Armenia Trademark Law application examination opposition renewal",
  },
  {
    id: "am-aipo-trademark-proceedings-name",
    targetId: "am-aipo-trademark-proceedings",
    query: "Board of Appeal trademark decisions Armenia",
  },
  {
    id: "am-aipo-trademark-renewal-name",
    targetId: "am-aipo-trademark-renewal",
    query: "trademark registration renewal form ten years six months",
  },
  {
    id: "az-copat-trademark-portal-name",
    targetId: "az-copat-trademark-portal",
    query: "Azerbaijan Intellectual Property Agency trademarks",
  },
  {
    id: "az-copat-trademark-filing-name",
    targetId: "az-copat-trademark-filing",
    query: "əmtəə nişanının qeydiyyata alınması iddia sənədi ekspertiza",
  },
  {
    id: "az-copat-trademark-search-name",
    targetId: "az-copat-trademark-search",
    query: "əmtəə nişanları reyestr Nitsa qeydiyyat nömrəsi",
  },
  {
    id: "az-copat-trademark-fees-name",
    targetId: "az-copat-trademark-fees",
    query: "əmtəə nişanı ilkin ekspertiza ekspertiza xidmət haqları",
  },
  {
    id: "az-copat-trademark-classification-name",
    targetId: "az-copat-trademark-classification",
    query: "ƏXBT Nitsa əmtəə xidmət beynəlxalq təsnifatı",
  },
  {
    id: "az-copat-trademark-legal-texts-name",
    targetId: "az-copat-trademark-legal-texts",
    query: "Əmtəə nişanları coğrafi göstəricilər haqqında Qanun",
  },
  {
    id: "az-copat-trademark-examination-rules-name",
    targetId: "az-copat-trademark-examination-rules",
    query: "əmtəə nişanlarının qeydə alınması iddia sənədinin verilməsi ekspertizası Qaydaları",
  },
  {
    id: "az-copat-trademark-proceedings-name",
    targetId: "az-copat-trademark-proceedings",
    query: "Apellyasiya şurası əmtəə nişanı qərarları etiraz",
  },
  {
    id: "az-copat-trademark-renewal-name",
    targetId: "az-copat-trademark-renewal",
    query: "əmtəə nişanı qeydiyyat müddətinin növbəti 10 il uzadılması",
  },
  {
    id: "ng-ipo-trademark-portal-name",
    targetId: "ng-ipo-trademark-portal",
    query: "IPO Nigeria Trademark Registry Federal Ministry Industry Trade Investment",
  },
  {
    id: "ng-ipo-trademark-filing-name",
    targetId: "ng-ipo-trademark-filing",
    query: "Nigeria online trademark application filing register IP rights",
  },
  {
    id: "ng-ipo-trademark-search-name",
    targetId: "ng-ipo-trademark-search",
    query: "Nigeria trademark file status search class title file ID",
  },
  {
    id: "ng-ipo-trademark-fees-name",
    targetId: "ng-ipo-trademark-fees",
    query: "Nigeria trademark availability search registration renewal opposition fees",
  },
  {
    id: "ng-ipo-trademark-classification-name",
    targetId: "ng-ipo-trademark-classification",
    query: "Nigeria trademark 45 classes goods services classification",
  },
  {
    id: "ng-ipo-trademark-legal-texts-name",
    targetId: "ng-ipo-trademark-legal-texts",
    query: "Nigeria Trademarks Act regulations official",
  },
  {
    id: "ng-ipo-trademark-opposition-name",
    targetId: "ng-ipo-trademark-opposition",
    query: "Nigeria trademark opposition published application",
  },
  {
    id: "ng-ipo-trademark-maintenance-name",
    targetId: "ng-ipo-trademark-maintenance",
    query: "Nigeria trademark renewal assignment recordal change applicant name address",
  },
  {
    id: "dz-inapi-trademark-portal-name",
    targetId: "dz-inapi-trademark-portal",
    query: "INAPI Algérie marque enregistrer protéger",
  },
  {
    id: "dz-inapi-trademark-filing-name",
    targetId: "dz-inapi-trademark-filing",
    query: "dépôt marque nouveau dépôt formulaire quittance paiement",
  },
  {
    id: "dz-inapi-trademark-search-name",
    targetId: "dz-inapi-trademark-search",
    query: "rechercher une marque base de données INAPI",
  },
  {
    id: "dz-inapi-trademark-fees-name",
    targetId: "dz-inapi-trademark-fees",
    query: "taxes marques dépôt publication renouvellement recherche recours",
  },
  {
    id: "dz-inapi-trademark-classification-name",
    targetId: "dz-inapi-trademark-classification",
    query: "classification de Nice produits services recherche antériorité",
  },
  {
    id: "dz-inapi-trademark-legal-texts-name",
    targetId: "dz-inapi-trademark-legal-texts",
    query: "Ordonnance 03-06 marques Décret exécutif 05-277",
  },
  {
    id: "dz-inapi-trademark-maintenance-name",
    targetId: "dz-inapi-trademark-maintenance",
    query: "renouvellement marque inscription cession changement adresse",
  },
  {
    id: "tn-innorpi-trademark-portal-name",
    targetId: "tn-innorpi-trademark-portal",
    query: "INNORPI Tunisie propriété industrielle marques",
  },
  {
    id: "tn-innorpi-trademark-filing-name",
    targetId: "tn-innorpi-trademark-filing",
    query: "système digitalisé dépôt électronique demandes marques 2026",
  },
  {
    id: "tn-innorpi-trademark-search-name",
    targetId: "tn-innorpi-trademark-search",
    query: "Tunisian IP Search System trademark simple brand advanced search",
  },
  {
    id: "tn-innorpi-trademark-fees-name",
    targetId: "tn-innorpi-trademark-fees",
    query: "redevance dépôt marque renouvellement opposition recherche antériorité",
  },
  {
    id: "tn-innorpi-trademark-legal-texts-name",
    targetId: "tn-innorpi-trademark-legal-texts",
    query: "Loi 2001-36 Décret gouvernemental 2015-303 marques",
  },
  {
    id: "tn-innorpi-trademark-maintenance-name",
    targetId: "tn-innorpi-trademark-maintenance",
    query: "formulaire marque renouvellement levée déchéance inscription registre",
  },
  {
    id: "ug-ursb-trademark-portal-name",
    targetId: "ug-ursb-trademark-portal",
    query: "Uganda IP Online Registration Portal trademarks",
  },
  {
    id: "ug-ursb-trademark-filing-name",
    targetId: "ug-ursb-trademark-filing",
    query: "Uganda apply for trademark online registration",
  },
  {
    id: "ug-ursb-trademark-search-name",
    targetId: "ug-ursb-trademark-search",
    query: "Uganda public trademark register search",
  },
  {
    id: "ug-ursb-trademark-fees-name",
    targetId: "ug-ursb-trademark-fees",
    query: "Uganda trademark application search opposition renewal fees",
  },
  {
    id: "ug-ursb-trademark-legal-texts-name",
    targetId: "ug-ursb-trademark-legal-texts",
    query: "Uganda Trademarks Act regulations URSB",
  },
  {
    id: "ug-ursb-trademark-proceedings-name",
    targetId: "ug-ursb-trademark-proceedings",
    query: "Uganda trademark opposition cancellation Registrar rulings",
  },
  {
    id: "ug-ursb-trademark-maintenance-name",
    targetId: "ug-ursb-trademark-maintenance",
    query: "Uganda trademark renewal restoration assignment change forms",
  },
  {
    id: "rw-rdb-trademark-portal-name",
    targetId: "rw-rdb-trademark-portal",
    query: "Rwanda Office Registrar General intellectual property trademark",
  },
  {
    id: "rw-rdb-trademark-filing-name",
    targetId: "rw-rdb-trademark-filing",
    query: "Rwanda register a trade mark search application examination publication opposition",
  },
  {
    id: "rw-rdb-trademark-search-name",
    targetId: "rw-rdb-trademark-search",
    query: "Rwanda request trademark search Nice classification search result notice",
  },
  {
    id: "rw-rdb-trademark-fees-name",
    targetId: "rw-rdb-trademark-fees",
    query: "Rwanda trademark opposition renewal international classes search fees",
  },
  {
    id: "rw-rdb-trademark-legal-texts-name",
    targetId: "rw-rdb-trademark-legal-texts",
    query: "Rwanda IP Law 055/2024 intellectual property legal documents",
  },
  {
    id: "rw-rdb-trademark-forms-name",
    targetId: "rw-rdb-trademark-forms",
    query: "Rwanda trademark application search amendment non-use opposition forms",
  },
  {
    id: "gh-rgd-industrial-property-portal-name",
    targetId: "gh-rgd-industrial-property-portal",
    query: "Ghana Registrar General Department industrial property trademarks mandate",
  },
  {
    id: "gh-rgd-trademark-fees-name",
    targetId: "gh-rgd-trademark-fees",
    query: "Ghana trademark search application examination publication opposition renewal fees",
  },
  {
    id: "gh-rgd-trademark-regulations-name",
    targetId: "gh-rgd-trademark-regulations",
    query: "Ghana Trade Marks Regulations LI 667 application search opposition renewal forms",
  },
  {
    id: "gh-rgd-trademarks-act-2004-name",
    targetId: "gh-rgd-trademarks-act-2004",
    query: "Ghana Trade Marks Act 2004 Act 664 registration examination opposition renewal",
  },
  {
    id: "gh-rgd-trademarks-amendment-act-2014-name",
    targetId: "gh-rgd-trademarks-amendment-act-2014",
    query: "Ghana Trademarks Amendment Act 2014 Act 876 Madrid Protocol ten year renewal",
  },
  {
    id: "eg-eipa-operational-ip-portal-name",
    targetId: "eg-eipa-operational-ip-portal",
    query: "Egyptian Intellectual Property Authority Egypt IP portal trademark gazette",
  },
  {
    id: "eg-eipa-trademark-filing-regulations-name",
    targetId: "eg-eipa-trademark-filing-regulations",
    query:
      "Egypt trademark regulations filing application classes priority examination opposition registration",
  },
  {
    id: "eg-eipa-trademark-fee-schedule-name",
    targetId: "eg-eipa-trademark-fee-schedule",
    query:
      "Egypt trademark fee schedule filing publication registration opposition renewal recordal",
  },
  {
    id: "eg-eipa-ip-law-82-current-name",
    targetId: "eg-eipa-ip-law-82-current",
    query:
      "Egypt Law 82 2002 intellectual property trademarks trade names geographical indications",
  },
  {
    id: "eg-eipa-establishment-law-163-name",
    targetId: "eg-eipa-establishment-law-163",
    query: "Egypt Law 163 2023 Egyptian Intellectual Property Authority establishment",
  },
  {
    id: "ru-rospatent-trademark-portal-name",
    targetId: "ru-rospatent-trademark-portal",
    query: "Rospatent Federal Service Intellectual Property Russia trademark portal",
  },
  {
    id: "ru-rospatent-trademark-filing-service-name",
    targetId: "ru-rospatent-trademark-filing-service",
    query: "Rospatent trademark registration state service electronic filing application",
  },
  {
    id: "ru-rospatent-trademark-register-name",
    targetId: "ru-rospatent-trademark-register",
    query: "Russia open register trademarks service marks registration application owner expiry",
  },
  {
    id: "ru-rospatent-trademark-fees-name",
    targetId: "ru-rospatent-trademark-fees",
    query: "Rospatent trademark fees filing examination registration fee table",
  },
  {
    id: "ru-rospatent-trademark-filing-examination-rules-name",
    targetId: "ru-rospatent-trademark-filing-examination-rules",
    query: "Russia Order 482 trademark filing examination rules application documents",
  },
  {
    id: "ru-rospatent-civil-code-trademarks-name",
    targetId: "ru-rospatent-civil-code-trademarks",
    query: "Russia Civil Code Part Four Chapter 76 trademarks service marks registration rights",
  },
  {
    id: "ru-rospatent-trademark-appeals-name",
    targetId: "ru-rospatent-trademark-appeals",
    query: "Rospatent trademark appeal objections Patent Disputes Chamber administrative appeal",
  },
  {
    id: "ru-rospatent-trademark-renewal-name",
    targetId: "ru-rospatent-trademark-renewal",
    query: "Rospatent trademark renewal ten years six month additional period fees",
  },
  {
    id: "uz-justice-intellectual-property-portal-name",
    targetId: "uz-justice-intellectual-property-portal",
    query: "Uzbekistan Ministry Justice intellectual property trademark portal",
  },
  {
    id: "uz-justice-trademark-registration-service-name",
    targetId: "uz-justice-trademark-registration-service",
    query: "Uzbekistan trademark registration public service Ministry Justice filing examination",
  },
  {
    id: "uz-justice-trademark-registration-request-name",
    targetId: "uz-justice-trademark-registration-request",
    query: "Uzbekistan trademark registration applicant service Ministry Justice",
  },
  {
    id: "uz-justice-state-duty-rates-name",
    targetId: "uz-justice-state-duty-rates",
    query: "Uzbekistan state duty rates trademark registration fee Ministry Justice",
  },
  {
    id: "uz-trademark-law-current-name",
    targetId: "uz-trademark-law-current",
    query: "Uzbekistan Law 267-II trademarks service marks appellations origin 2024",
  },
  {
    id: "uz-trademark-filing-examination-rules-name",
    targetId: "uz-trademark-filing-examination-rules",
    query: "Uzbekistan trademark filing examination rules registration number 1988",
  },
  {
    id: "ir-ipc-intellectual-property-portal-name",
    targetId: "ir-ipc-intellectual-property-portal",
    query: "Iran Intellectual Property Center national IP office trademark portal SSAA",
  },
  {
    id: "ir-ipc-national-trademark-search-name",
    targetId: "ir-ipc-national-trademark-search",
    query: "Iran national trademark collection Global Brand Database",
  },
  {
    id: "ir-ipc-trademark-filing-regulation-name",
    targetId: "ir-ipc-trademark-filing-regulation",
    query: "Iran trademark registration executive regulation filing application procedure",
  },
  {
    id: "ir-ipc-trademark-regulatory-fee-schedule-name",
    targetId: "ir-ipc-trademark-regulatory-fee-schedule",
    query: "Iran trademark executive regulation statutory fee schedule registration renewal",
  },
  {
    id: "ir-ipc-industrial-property-act-2024-name",
    targetId: "ir-ipc-industrial-property-act-2024",
    query: "Iran Act Protection Industrial Property 2024 trademarks trade names",
  },
  {
    id: "ir-ipc-trademark-examination-regulation-pdf-name",
    targetId: "ir-ipc-trademark-examination-regulation-pdf",
    query: "Iran trademark filing examination opposition renewal executive regulation full text",
  },
  {
    id: "pk-ipo-trademark-portal-name",
    targetId: "pk-ipo-trademark-portal",
    query: "IPO Pakistan Trademarks Office official portal",
  },
  {
    id: "pk-ipo-national-trademark-search-name",
    targetId: "pk-ipo-national-trademark-search",
    query: "Pakistan national trademark collection Global Brand Database",
  },
  {
    id: "pk-ipo-trademark-filing-rules-name",
    targetId: "pk-ipo-trademark-filing-rules",
    query: "Pakistan Trade Marks Rules 2004 filing application registration",
  },
  {
    id: "pk-ipo-trademark-regulatory-fee-schedule-name",
    targetId: "pk-ipo-trademark-regulatory-fee-schedule",
    query: "Pakistan Trade Marks Rules First Schedule fees filing opposition renewal",
  },
  {
    id: "pk-ipo-trademarks-ordinance-2001-name",
    targetId: "pk-ipo-trademarks-ordinance-2001",
    query: "Pakistan Trade Marks Ordinance 2001 trademark law",
  },
  {
    id: "pk-ipo-trademark-examination-rules-fulltext-name",
    targetId: "pk-ipo-trademark-examination-rules-fulltext",
    query: "Pakistan Trade Marks Rules examination opposition renewal full text",
  },
  {
    id: "iq-moim-industrial-property-platform-name",
    targetId: "iq-moim-industrial-property-platform",
    query: "Iraq Ministry Industry Minerals trademark platform",
  },
  {
    id: "iq-moim-trademark-database-name",
    targetId: "iq-moim-trademark-database",
    query: "Iraq Ministry Industry registered trademark database search",
  },
  {
    id: "iq-ur-trademark-examination-service-name",
    targetId: "iq-ur-trademark-examination-service",
    query: "Iraq Ur portal trademark examination electronic payment service",
  },
  {
    id: "iq-ur-trademark-registration-fees-name",
    targetId: "iq-ur-trademark-registration-fees",
    query: "Iraq electronic trademark registration fees Ministry Industry Ur portal",
  },
  {
    id: "iq-trademark-law-consolidated-2010-name",
    targetId: "iq-trademark-law-consolidated-2010",
    query: "Iraq Law 21 1957 trademarks trade names amended Law 9 2010 consolidated",
  },
  {
    id: "iq-trademark-system-regulation-26-name",
    targetId: "iq-trademark-system-regulation-26",
    query: "Iraq System 26 1957 trademarks trade names implementing regulation",
  },
  {
    id: "nl-boip-trademark-portal-name",
    targetId: "nl-boip-trademark-portal",
    query: "BOIP Benelux trademark authority Netherlands portal",
  },
  {
    id: "nl-boip-trademark-procedure-name",
    targetId: "nl-boip-trademark-procedure",
    query:
      "BOIP trademark application registration procedure examination publication opposition Netherlands",
  },
  {
    id: "nl-boip-trademark-register-name",
    targetId: "nl-boip-trademark-register",
    query: "BOIP public trademarks register Netherlands Benelux applications registrations",
  },
  {
    id: "nl-boip-trademark-fees-name",
    targetId: "nl-boip-trademark-fees",
    query: "BOIP trademark registration costs fees Netherlands Benelux",
  },
  {
    id: "nl-benelux-convention-approval-act-name",
    targetId: "nl-benelux-convention-approval-act",
    query:
      "Netherlands Act 10 May 2006 approval Benelux Convention intellectual property trademarks",
  },
  {
    id: "nl-benelux-convention-current-name",
    targetId: "nl-benelux-convention-current",
    query: "Benelux Convention Intellectual Property trademarks designs current consolidated BOIP",
  },
  {
    id: "be-boip-trademark-portal-name",
    targetId: "be-boip-trademark-portal",
    query: "BOIP Benelux trademark authority Belgium portal",
  },
  {
    id: "be-boip-online-trademark-filing-name",
    targetId: "be-boip-online-trademark-filing",
    query: "BOIP My BOIP online trademark application filing Belgium five steps",
  },
  {
    id: "be-boip-trademark-register-name",
    targetId: "be-boip-trademark-register",
    query: "BOIP registre marques Belgium Benelux public trademark register",
  },
  {
    id: "be-boip-trademark-fee-payment-name",
    targetId: "be-boip-trademark-fee-payment",
    query: "BOIP trademark fee payment methods Belgium online application",
  },
  {
    id: "be-benelux-convention-approval-law-name",
    targetId: "be-benelux-convention-approval-law",
    query: "Belgium law 22 March 2006 approval Benelux Convention intellectual property trademarks",
  },
  {
    id: "be-benelux-convention-fulltext-name",
    targetId: "be-benelux-convention-fulltext",
    query: "Benelux Convention intellectual property full text Belgium trademarks BOIP",
  },
  {
    id: "al-dppi-industrial-property-portal-name",
    targetId: "al-dppi-industrial-property-portal",
    query: "Albania DPPI industrial property trademark portal",
  },
  {
    id: "al-dppi-trademark-filing-guidance-name",
    targetId: "al-dppi-trademark-filing-guidance",
    query: "Albania DPPI trademark service mark application filing documents",
  },
  {
    id: "al-dppi-industrial-property-register-name",
    targetId: "al-dppi-industrial-property-register",
    query: "Albania DPPI public trademark industrial property register search",
  },
  {
    id: "al-dppi-industrial-property-fees-decision-883-name",
    targetId: "al-dppi-industrial-property-fees-decision-883",
    query: "Albania Decision 883 industrial property trademark registration fees DPPI",
  },
  {
    id: "al-dppi-current-national-ip-legislation-name",
    targetId: "al-dppi-current-national-ip-legislation",
    query: "Albania Law 52 2025 trademarks current national legislation DPPI",
  },
  {
    id: "al-dppi-trademark-regulation-decision-315-name",
    targetId: "al-dppi-trademark-regulation-decision-315",
    query: "Albania Decision 315 2018 trademark regulation DPPI",
  },
  {
    id: "ba-ipr-trademark-portal-name",
    targetId: "ba-ipr-trademark-portal",
    query: "Bosnia Herzegovina Institute Intellectual Property trademark portal",
  },
  {
    id: "ba-ipr-trademark-protection-procedure-name",
    targetId: "ba-ipr-trademark-protection-procedure",
    query:
      "Bosnia Herzegovina trademark protection procedure application filing Nice classification",
  },
  {
    id: "ba-ipr-national-trademark-register-name",
    targetId: "ba-ipr-national-trademark-register",
    query: "Bosnia Herzegovina e-register national trademarks daily updated",
  },
  {
    id: "ba-ipr-trademark-fees-payments-name",
    targetId: "ba-ipr-trademark-fees-payments",
    query: "Bosnia Herzegovina trademark fees costs payment Institute intellectual property",
  },
  {
    id: "ba-ipr-trademark-law-index-name",
    targetId: "ba-ipr-trademark-law-index",
    query: "Bosnia Herzegovina Law on Trademarks regulations Institute",
  },
  {
    id: "ba-ipr-trademark-procedure-faq-name",
    targetId: "ba-ipr-trademark-procedure-faq",
    query: "Bosnia trademark procedure formal examination publication registration renewal FAQ",
  },
  {
    id: "mk-soip-industrial-property-portal-name",
    targetId: "mk-soip-industrial-property-portal",
    query: "North Macedonia State Office Industrial Property trademark portal",
  },
  {
    id: "mk-soip-trademark-application-requirements-name",
    targetId: "mk-soip-trademark-application-requirements",
    query: "North Macedonia trademark application requirements goods services SOIP",
  },
  {
    id: "mk-soip-trademark-database-name",
    targetId: "mk-soip-trademark-database",
    query: "North Macedonia SOIP online trademark database search",
  },
  {
    id: "mk-soip-trademark-filing-fees-name",
    targetId: "mk-soip-trademark-filing-fees",
    query: "North Macedonia trademark application fees SOIP payment",
  },
  {
    id: "mk-soip-industrial-property-legislation-name",
    targetId: "mk-soip-industrial-property-legislation",
    query: "North Macedonia industrial property law trademark legislation administrative fees SOIP",
  },
  {
    id: "mk-soip-trademark-examination-procedure-name",
    targetId: "mk-soip-trademark-examination-procedure",
    query: "North Macedonia trademark examination publication opposition registration procedure",
  },
  {
    id: "by-ncip-trademark-portal-name",
    targetId: "by-ncip-trademark-portal",
    query: "Belarus NCIP trademark service mark registration portal",
  },
  {
    id: "by-ncip-electronic-industrial-property-filing-name",
    targetId: "by-ncip-electronic-industrial-property-filing",
    query: "Belarus NCIP electronic trademark application E Pasluga filing 2026",
  },
  {
    id: "by-ncip-industrial-property-database-name",
    targetId: "by-ncip-industrial-property-database",
    query: "Belarus NCIP industrial property trademark database daily register search",
  },
  {
    id: "by-ncip-patent-duty-calculator-name",
    targetId: "by-ncip-patent-duty-calculator",
    query: "Belarus NCIP patent duty calculator trademark fees",
  },
  {
    id: "by-ncip-current-trademark-legislation-name",
    targetId: "by-ncip-current-trademark-legislation",
    query: "Belarus current trademark law patent duties NCIP legislation 2023",
  },
  {
    id: "by-ncip-trademark-registration-regulation-1719-name",
    targetId: "by-ncip-trademark-registration-regulation-1719",
    query: "Belarus Resolution 1719 trademark registration regulation amended 2023",
  },
  {
    id: "mn-ipom-portal-name",
    targetId: "mn-ipom-portal",
    query: "Mongolia IPOM intellectual property trademark portal",
  },
  {
    id: "mn-ipom-trademark-filing-guidance-name",
    targetId: "mn-ipom-trademark-filing-guidance",
    query: "Mongolia trademark filing application classes service fee IPOM",
  },
  {
    id: "mn-ipom-trademark-database-name",
    targetId: "mn-ipom-trademark-database",
    query: "Mongolia national trademark database IPOM publish",
  },
  {
    id: "mn-ipom-trademark-state-duty-name",
    targetId: "mn-ipom-trademark-state-duty",
    query: "Mongolia trademark certificate renewal state duty IPOM",
  },
  {
    id: "mn-trademark-law-current-base-name",
    targetId: "mn-trademark-law-current-base",
    query: "Mongolia law trademarks geographical indications 2021 WIPO",
  },
  {
    id: "mn-trademark-law-amendment-2024-name",
    targetId: "mn-trademark-law-amendment-2024",
    query: "Mongolia 2024 amendment trademark geographical indications law",
  },
  {
    id: "kh-dip-portal-name",
    targetId: "kh-dip-portal",
    query: "Cambodia Department Intellectual Property trademark portal Ministry Commerce",
  },
  {
    id: "kh-dip-trademark-efiling-name",
    targetId: "kh-dip-trademark-efiling",
    query: "Cambodia online trademark filing renewal post registration efiling",
  },
  {
    id: "kh-dip-trademark-search-name",
    targetId: "kh-dip-trademark-search",
    query: "Cambodia national trademark search DIP",
  },
  {
    id: "kh-dip-trademark-fee-notices-name",
    targetId: "kh-dip-trademark-fee-notices",
    query: "Cambodia trademark registration fees new fee policy notification",
  },
  {
    id: "kh-trademark-law-name",
    targetId: "kh-trademark-law",
    query: "Cambodia law marks trade names unfair competition",
  },
  {
    id: "kh-trademark-implementing-subdecree-name",
    targetId: "kh-trademark-implementing-subdecree",
    query: "Cambodia trademark implementing sub decree filing examination opposition",
  },
  {
    id: "la-dip-portal-name",
    targetId: "la-dip-portal",
    query: "Lao PDR Department Intellectual Property trademark portal",
  },
  {
    id: "la-dip-trademark-efiling-name",
    targetId: "la-dip-trademark-efiling",
    query: "Laos IP e filing trademark Department Intellectual Property",
  },
  {
    id: "la-dip-ip-search-name",
    targetId: "la-dip-ip-search",
    query: "Lao PDR IP search trademarks DIP",
  },
  {
    id: "la-dip-trademark-cost-guidance-name",
    targetId: "la-dip-trademark-cost-guidance",
    query: "Lao trademark registration cost 1.5 million kip eight months DIP",
  },
  {
    id: "la-ip-law-2023-name",
    targetId: "la-ip-law-2023",
    query: "Lao PDR intellectual property law 50 NA 2023 trademarks",
  },
  {
    id: "la-trademark-regulation-2023-name",
    targetId: "la-trademark-regulation-2023",
    query: "Lao trademark regulation 0436 MOIC 2023",
  },
  {
    id: "mm-ipd-portal-name",
    targetId: "mm-ipd-portal",
    query: "Myanmar Intellectual Property Department trademark portal",
  },
  {
    id: "mm-ipd-trademark-filing-process-name",
    targetId: "mm-ipd-trademark-filing-process",
    query: "Myanmar trademark filing examination publication opposition process IPD",
  },
  {
    id: "mm-ipd-ip-search-name",
    targetId: "mm-ipd-ip-search",
    query: "Myanmar IPD intellectual property trademark search",
  },
  {
    id: "mm-ipd-trademark-efiling-epayment-name",
    targetId: "mm-ipd-trademark-efiling-epayment",
    query: "Myanmar IPD trademark online filing e payment",
  },
  {
    id: "mm-trademark-law-2019-name",
    targetId: "mm-trademark-law-2019",
    query: "Myanmar Trademark Law 3 2019",
  },
  {
    id: "mm-trademark-registration-rules-2023-name",
    targetId: "mm-trademark-registration-rules-2023",
    query: "Myanmar Trademark Registration Rules Notification 1 2023",
  },
  {
    id: "bn-bruipo-portal-name",
    targetId: "bn-bruipo-portal",
    query: "Brunei Intellectual Property Office trademark portal",
  },
  {
    id: "bn-bruipo-trademark-filing-name",
    targetId: "bn-bruipo-trademark-filing",
    query: "BruIPO trade mark application process",
  },
  {
    id: "bn-bruipo-trademark-search-name",
    targetId: "bn-bruipo-trademark-search",
    query: "BruIPO trademark search Brunei",
  },
  {
    id: "bn-bruipo-trademark-forms-fees-name",
    targetId: "bn-bruipo-trademark-forms-fees",
    query: "BruIPO trademark forms fees filing renewal opposition",
  },
  {
    id: "bn-trade-marks-act-current-name",
    targetId: "bn-trade-marks-act-current",
    query: "Brunei Trade Marks Act Revised Edition 2022",
  },
  {
    id: "bn-trade-marks-rules-name",
    targetId: "bn-trade-marks-rules",
    query: "Brunei Trade Marks Rules registration fees forms classification",
  },
  {
    id: "ec-senadi-portal-name",
    targetId: "ec-senadi-portal",
    query: "EC SENADI Intellectual Rights Portal",
  },
  {
    id: "ec-senadi-trademark-registration-name",
    targetId: "ec-senadi-trademark-registration",
    query: "EC Ecuador Trademark Registration Guidance",
  },
  {
    id: "ec-senadi-trademark-search-guidance-name",
    targetId: "ec-senadi-trademark-search-guidance",
    query: "EC Ecuador Trademark Search and Industrial Property FAQ",
  },
  {
    id: "ec-senadi-trademark-fees-2026-name",
    targetId: "ec-senadi-trademark-fees-2026",
    query: "EC SENADI 2026 Official Fees",
  },
  {
    id: "ec-industrial-property-code-name",
    targetId: "ec-industrial-property-code",
    query: "EC Ecuador Organic Code on the Social Economy of Knowledge, Creativity and Innovation",
  },
  {
    id: "ec-senadi-distinctive-signs-procedure-name",
    targetId: "ec-senadi-distinctive-signs-procedure",
    query: "EC SENADI Distinctive Signs Technical Procedure",
  },
  {
    id: "uy-dnpi-portal-name",
    targetId: "uy-dnpi-portal",
    query: "UY Uruguay National Directorate of Industrial Property",
  },
  {
    id: "uy-dnpi-trademark-registration-name",
    targetId: "uy-dnpi-trademark-registration",
    query: "UY Uruguay Trademark Registration Service",
  },
  {
    id: "uy-dnpi-public-trademark-database-name",
    targetId: "uy-dnpi-public-trademark-database",
    query: "UY Uruguay Public Trademark Database Availability",
  },
  {
    id: "uy-dnpi-online-filing-payment-name",
    targetId: "uy-dnpi-online-filing-payment",
    query: "UY Uruguay Online IP Filing and Payment System",
  },
  {
    id: "uy-trademark-law-current-name",
    targetId: "uy-trademark-law-current",
    query: "UY Uruguay Law No. 17.011 on Trademarks",
  },
  {
    id: "uy-dnpi-distinctive-signs-examination-guide-name",
    targetId: "uy-dnpi-distinctive-signs-examination-guide",
    query: "UY Uruguay 2024 Distinctive Signs Examination and Procedure Guide",
  },
  {
    id: "gt-rpi-portal-name",
    targetId: "gt-rpi-portal",
    query: "GT Guatemala Registry of Intellectual Property",
  },
  {
    id: "gt-rpi-trademark-filing-name",
    targetId: "gt-rpi-trademark-filing",
    query: "GT Guatemala RPI Trademark Filing through VUFE",
  },
  {
    id: "gt-rpi-trademark-search-name",
    targetId: "gt-rpi-trademark-search",
    query: "GT Guatemala RPI Trademark Search",
  },
  {
    id: "gt-rpi-trademark-fees-name",
    targetId: "gt-rpi-trademark-fees",
    query: "GT Guatemala RPI Trademark Fees FAQ",
  },
  {
    id: "gt-industrial-property-law-name",
    targetId: "gt-industrial-property-law",
    query: "GT Guatemala Industrial Property Law Decree No. 57-2000",
  },
  {
    id: "gt-rpi-trademark-guides-name",
    targetId: "gt-rpi-trademark-guides",
    query: "GT Guatemala RPI Trademark Guides and Flowcharts",
  },
  {
    id: "cr-rpi-portal-name",
    targetId: "cr-rpi-portal",
    query: "CR Costa Rica Registry of Industrial Property Portal",
  },
  {
    id: "cr-rpi-online-trademark-filing-name",
    targetId: "cr-rpi-online-trademark-filing",
    query: "CR Costa Rica Online Trademark Filing Guidance",
  },
  {
    id: "cr-rpi-trademark-search-name",
    targetId: "cr-rpi-trademark-search",
    query: "CR Costa Rica Trademark Search and Global Brand Database Links",
  },
  {
    id: "cr-rpi-trademark-fees-name",
    targetId: "cr-rpi-trademark-fees",
    query: "CR Costa Rica Industrial Property Trademark Fees",
  },
  {
    id: "cr-trademark-law-7978-name",
    targetId: "cr-trademark-law-7978",
    query: "CR Costa Rica Law No. 7978 on Trademarks and Other Distinctive Signs",
  },
  {
    id: "cr-trademark-regulation-current-name",
    targetId: "cr-trademark-regulation-current",
    query: "CR Costa Rica Trademark Regulation – Current through September 2024",
  },
  {
    id: "pa-digerpi-portal-name",
    targetId: "pa-digerpi-portal",
    query: "PA Panama DIGERPI Portal",
  },
  {
    id: "pa-digerpi-trademark-requirements-name",
    targetId: "pa-digerpi-trademark-requirements",
    query: "PA Panama Trademark Application Requirements",
  },
  {
    id: "pa-digerpi-trademark-search-name",
    targetId: "pa-digerpi-trademark-search",
    query: "PA Panama DIGERPI Trademark Availability Search",
  },
  {
    id: "pa-trademark-registration-fees-name",
    targetId: "pa-trademark-registration-fees",
    query: "PA Panama Digital Trademark Registration Service and Fees",
  },
  {
    id: "pa-digerpi-current-legal-framework-name",
    targetId: "pa-digerpi-current-legal-framework",
    query: "PA Panama DIGERPI Current Trademark Legal Framework",
  },
  {
    id: "pa-digerpi-current-legislation-index-name",
    targetId: "pa-digerpi-current-legislation-index",
    query: "PA Panama DIGERPI Current Industrial Property Legislation",
  },
  {
    id: "do-onapi-portal-name",
    targetId: "do-onapi-portal",
    query: "DO Dominican Republic ONAPI Portal",
  },
  {
    id: "do-onapi-trademark-forms-name",
    targetId: "do-onapi-trademark-forms",
    query: "DO Dominican Republic ONAPI Trademark Forms",
  },
  {
    id: "do-onapi-trademark-search-name",
    targetId: "do-onapi-trademark-search",
    query: "DO Dominican Republic ONAPI Trademark Search",
  },
  {
    id: "do-onapi-trademark-registration-fees-name",
    targetId: "do-onapi-trademark-registration-fees",
    query: "DO Dominican Republic Trademark Registration Service and Fees",
  },
  {
    id: "do-industrial-property-law-20-00-name",
    targetId: "do-industrial-property-law-20-00",
    query: "DO Dominican Republic Industrial Property Law No. 20-00",
  },
  {
    id: "do-onapi-trademark-distinctiveness-manual-name",
    targetId: "do-onapi-trademark-distinctiveness-manual",
    query: "DO ONAPI Trademark Types and Distinctiveness Manual",
  },
  {
    id: "lb-moet-intellectual-property-portal-name",
    targetId: "lb-moet-intellectual-property-portal",
    query: "Lebanon Ministry Economy intellectual property trademark portal",
  },
  {
    id: "lb-moet-online-trademark-registration-name",
    targetId: "lb-moet-online-trademark-registration",
    query: "Lebanon Ministry online trademark registration electronic portal",
  },
  {
    id: "lb-moet-trademark-search-guidance-name",
    targetId: "lb-moet-trademark-search-guidance",
    query: "Lebanon Ministry trademark search protection guidance",
  },
  {
    id: "lb-moet-trademark-fees-pdf-name",
    targetId: "lb-moet-trademark-fees-pdf",
    query: "Lebanon Ministry trademark fees registration renewal PDF",
  },
  {
    id: "lb-moet-intellectual-property-legislation-name",
    targetId: "lb-moet-intellectual-property-legislation",
    query: "Lebanon Ministry trademark intellectual property legislation 2385 LR",
  },
  {
    id: "lb-moet-ip-applicant-guide-pdf-name",
    targetId: "lb-moet-ip-applicant-guide-pdf",
    query: "Lebanon trademark applicant guide filing publication certificate",
  },
  {
    id: "py-dinapi-portal-name",
    targetId: "py-dinapi-portal",
    query: "Paraguay DINAPI trademark portal",
  },
  {
    id: "py-dinapi-sfe-trademark-filing-name",
    targetId: "py-dinapi-sfe-trademark-filing",
    query: "Paraguay DINAPI SFE electronic trademark filing payment",
  },
  {
    id: "py-dinapi-joaju-public-search-name",
    targetId: "py-dinapi-joaju-public-search",
    query: "Paraguay DINAPI Joaju public trademark search",
  },
  {
    id: "py-dinapi-trademark-registration-fees-name",
    targetId: "py-dinapi-trademark-registration-fees",
    query: "Paraguay DINAPI trademark registration fees digital filing",
  },
  {
    id: "py-dinapi-trademark-legal-framework-name",
    targetId: "py-dinapi-trademark-legal-framework",
    query: "Paraguay Law 1294 1998 trademark Decree 22365 DINAPI",
  },
  {
    id: "py-dinapi-trademark-examination-guidelines-2025-name",
    targetId: "py-dinapi-trademark-examination-guidelines-2025",
    query: "Paraguay trademark examination guidelines Resolution 259 2025 DINAPI",
  },
  {
    id: "ve-sapi-portal-name",
    targetId: "ve-sapi-portal",
    query: "Venezuela SAPI intellectual property trademark portal",
  },
  {
    id: "ve-sapi-webpi-online-filing-name",
    targetId: "ve-sapi-webpi-online-filing",
    query: "Venezuela SAPI WebPI online trademark filing",
  },
  {
    id: "ve-sapi-trademark-search-procedure-name",
    targetId: "ve-sapi-trademark-search-procedure",
    query: "Venezuela SAPI automated trademark prior search WebPI procedure",
  },
  {
    id: "ve-sapi-trademark-tariff-pdf-name",
    targetId: "ve-sapi-trademark-tariff-pdf",
    query: "Venezuela SAPI official trademark tariff fees PDF",
  },
  {
    id: "ve-sapi-trademark-legal-framework-name",
    targetId: "ve-sapi-trademark-legal-framework",
    query: "Venezuela SAPI trademark industrial property legal framework",
  },
  {
    id: "ve-industrial-property-law-wipolex-name",
    targetId: "ve-industrial-property-law-wipolex",
    query: "Venezuela Industrial Property Law trademarks WIPO Lex",
  },
  {
    id: "et-eipa-portal-name",
    targetId: "et-eipa-portal",
    query: "Ethiopia EIPA intellectual property trademark portal",
  },
  {
    id: "et-eipa-trademark-application-procedure-name",
    targetId: "et-eipa-trademark-application-procedure",
    query: "Ethiopia EIPA trademark application procedure local foreign applicants",
  },
  {
    id: "et-eipa-trademark-search-name",
    targetId: "et-eipa-trademark-search",
    query: "Ethiopia EIPA registered trademark search records",
  },
  {
    id: "et-eipa-trademark-fees-name",
    targetId: "et-eipa-trademark-fees",
    query: "Ethiopia EIPA trademark application registration renewal search fees",
  },
  {
    id: "et-eipa-trademark-legislation-index-name",
    targetId: "et-eipa-trademark-legislation-index",
    query: "Ethiopia EIPA trademark proclamation 501 regulation 273 legislation",
  },
  {
    id: "et-trademark-regulation-273-2012-name",
    targetId: "et-trademark-regulation-273-2012",
    query: "Ethiopia trademark registration protection regulation 273 2012",
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
