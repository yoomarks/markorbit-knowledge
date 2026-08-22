export const ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION = "1.0" as const;

export const ACQUISITION_ARCHITECTURES = [
  "STATIC_HTML",
  "SSR",
  "SPA",
  "API_BACKED",
  "PDF_HEAVY",
  "HYBRID",
  "UNKNOWN",
] as const;
export type AcquisitionArchitecture = (typeof ACQUISITION_ARCHITECTURES)[number];

export const ACQUISITION_DISCOVERY_SURFACES = [
  "SITEMAP",
  "ROBOTS",
  "INDEX_PAGE",
  "TOC",
  "SEARCH_ENDPOINT",
  "API",
  "RSS",
  "COUNTRY_INDEX",
  "DOCUMENT_CATALOG",
] as const;
export type AcquisitionDiscoverySurface = (typeof ACQUISITION_DISCOVERY_SURFACES)[number];

export const ACQUISITION_RENDER_REQUIREMENTS = ["NONE", "OPTIONAL", "REQUIRED", "UNKNOWN"] as const;
export type AcquisitionRenderRequirement = (typeof ACQUISITION_RENDER_REQUIREMENTS)[number];

export const ACQUISITION_LOCALE_STRUCTURES = [
  "SINGLE",
  "MULTI_LOCALE",
  "JURISDICTION_GRAPH",
  "UNKNOWN",
] as const;
export type AcquisitionLocaleStructure = (typeof ACQUISITION_LOCALE_STRUCTURES)[number];

export const ACQUISITION_PRIMITIVES = [
  "SITEMAP_ENUMERATION",
  "INDEX_TREE_ENUMERATION",
  "COUNTRY_INDEX_ENUMERATION",
  "TOC_GRAPH_ENUMERATION",
  "API_CATALOG_ENUMERATION",
  "STATIC_HTML_FETCH",
  "JS_RENDERED_FETCH",
  "PDF_ATTACHMENT_FOLLOW",
  "HTTP_VALIDATOR_CHANGE_WATCH",
  "CONTENT_DIGEST_CHANGE_WATCH",
  "CORPUS_RECONCILIATION",
] as const;
export type AcquisitionPrimitive = (typeof ACQUISITION_PRIMITIVES)[number];

export const ACQUISITION_PROMOTION_STAGES = [
  "OBSERVED",
  "CANDIDATE",
  "VALIDATED",
  "PROMOTED",
  "ACTIVE",
  "DEPRECATED",
] as const;
export type AcquisitionPromotionStage = (typeof ACQUISITION_PROMOTION_STAGES)[number];

export const ACQUISITION_LESSON_TYPES = [
  "AUTHORITATIVE_ENUMERATOR",
  "INCOMPLETE_ENUMERATOR",
  "RENDERING_UNNECESSARY",
  "RENDERING_REQUIRED",
  "HTTP_VALIDATORS_EFFECTIVE",
  "HTTP_VALIDATORS_UNAVAILABLE",
  "DIGEST_WATCH_REQUIRED",
  "DUPLICATION_HIGH",
  "COVERAGE_REGRESSION",
  "FAILURE_SIGNATURE",
  "PLAYBOOK_SUCCESS",
] as const;
export type AcquisitionLessonType = (typeof ACQUISITION_LESSON_TYPES)[number];

export const ACQUISITION_LESSON_SCOPES = ["SOURCE", "DOMAIN", "SITE_FAMILY", "GENERIC"] as const;
export type AcquisitionLessonScope = (typeof ACQUISITION_LESSON_SCOPES)[number];

export type SourceFingerprint = {
  protocolVersion: typeof ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION;
  objectType: "SOURCE_FINGERPRINT";
  sourceId: string;
  observedAt: string;
  architecture: AcquisitionArchitecture;
  discoverySurfaces: AcquisitionDiscoverySurface[];
  renderRequirement: AcquisitionRenderRequirement;
  localeStructure: AcquisitionLocaleStructure;
  supportsHttpValidators: boolean | null;
  attachmentKinds: string[];
  confidence: number;
  evidenceRefs: string[];
};

export type AcquisitionPlaybookCompatibility = {
  architectures?: AcquisitionArchitecture[];
  requiresDiscoverySurfaces?: AcquisitionDiscoverySurface[];
  anyDiscoverySurfaces?: AcquisitionDiscoverySurface[];
  renderRequirements?: AcquisitionRenderRequirement[];
  localeStructures?: AcquisitionLocaleStructure[];
};

export type AcquisitionPlaybook = {
  protocolVersion: typeof ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION;
  objectType: "ACQUISITION_PLAYBOOK";
  id: string;
  revision: number;
  stage: AcquisitionPromotionStage;
  name: string;
  primitives: AcquisitionPrimitive[];
  compatibility: AcquisitionPlaybookCompatibility;
  fallbackPlaybookIds: string[];
  prior: {
    expectedCoverage: number;
    expectedSuccessRate: number;
    expectedCostScore: number;
    confidence: number;
  };
  evidenceRefs: string[];
};

export type AcquisitionSurfaceOutcome = {
  surface: AcquisitionDiscoverySurface;
  discovered: number;
  accepted: number;
  knownCorpus: number | null;
};

export type AcquisitionFailureSignature = {
  code: string;
  count: number;
  sample?: string;
};

export type AcquisitionRunEvidence = {
  protocolVersion: typeof ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION;
  objectType: "ACQUISITION_RUN_EVIDENCE";
  runId: string;
  sourceId: string;
  playbookId: string;
  playbookRevision: number;
  startedAt: string;
  finishedAt: string;
  outcome: "SUCCESS" | "DEGRADED" | "FAILED";
  counts: {
    discovered: number;
    attempted: number;
    fetched: number;
    accepted: number;
    duplicates: number;
    retries: number;
  };
  coverage: {
    knownCorpus: number | null;
    ratio: number | null;
    previousRatio: number | null;
  };
  httpStatusCounts: Record<string, number>;
  failureSignatures: AcquisitionFailureSignature[];
  surfaceOutcomes: AcquisitionSurfaceOutcome[];
  rendering: {
    used: boolean;
    comparativeProbe?: {
      staticAccepted: number;
      renderedAccepted: number;
    };
  };
  changeDetection: {
    etagObserved: boolean | null;
    lastModifiedObserved: boolean | null;
    validator304Count: number;
    digestChanges: number;
  };
  performance: {
    durationMs: number;
    bytes: number;
  };
  evidenceRefs: string[];
  boundaries: {
    legalTruthVerified: false;
    autoPromotionApplied: false;
    collectionAuthorityGranted: false;
  };
};

export type RunLesson = {
  protocolVersion: typeof ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION;
  objectType: "ACQUISITION_RUN_LESSON";
  runId: string;
  sourceId: string;
  lessonType: AcquisitionLessonType;
  scope: AcquisitionLessonScope;
  statement: string;
  confidence: number;
  evidenceRefs: string[];
  reasonCodes: string[];
  recommendedPrimitive?: AcquisitionPrimitive;
  affectedSurface?: AcquisitionDiscoverySurface;
};

export type StrategyCandidate = {
  protocolVersion: typeof ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION;
  objectType: "ACQUISITION_STRATEGY_CANDIDATE";
  id: string;
  playbookId: string;
  proposedRevision: number;
  stage: AcquisitionPromotionStage;
  createdAt: string;
  sourceScope: string[];
  lessonRefs: string[];
  confidence: number;
  rationale: string[];
  boundaries: {
    autoActivated: false;
    requiresPromotionEvidence: true;
  };
};

export type AcquisitionPlaybookHistory = {
  runs: number;
  successRate: number;
  averageCoverage: number | null;
  averageDurationMs: number | null;
};

export type AcquisitionStrategySelection = {
  protocolVersion: typeof ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION;
  objectType: "ACQUISITION_STRATEGY_SELECTION";
  sourceId: string;
  selectedPlaybookId: string | null;
  selectedRevision: number | null;
  ranked: Array<{
    playbookId: string;
    revision: number;
    compatible: boolean;
    score: number;
    reasonCodes: string[];
  }>;
  fallbackOrder: string[];
  rationale: string[];
  boundaries: {
    selectionGrantsCollectionAuthority: false;
    autoPromotionApplied: false;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProbability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isSourceFingerprint(value: unknown): value is SourceFingerprint {
  return (
    isRecord(value) &&
    value.protocolVersion === ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION &&
    value.objectType === "SOURCE_FINGERPRINT" &&
    typeof value.sourceId === "string" &&
    typeof value.observedAt === "string" &&
    Number.isFinite(Date.parse(value.observedAt)) &&
    typeof value.architecture === "string" &&
    ACQUISITION_ARCHITECTURES.includes(value.architecture as AcquisitionArchitecture) &&
    Array.isArray(value.discoverySurfaces) &&
    value.discoverySurfaces.every(
      (surface) =>
        typeof surface === "string" &&
        ACQUISITION_DISCOVERY_SURFACES.includes(surface as AcquisitionDiscoverySurface),
    ) &&
    typeof value.renderRequirement === "string" &&
    ACQUISITION_RENDER_REQUIREMENTS.includes(
      value.renderRequirement as AcquisitionRenderRequirement,
    ) &&
    typeof value.localeStructure === "string" &&
    ACQUISITION_LOCALE_STRUCTURES.includes(value.localeStructure as AcquisitionLocaleStructure) &&
    (value.supportsHttpValidators === null || typeof value.supportsHttpValidators === "boolean") &&
    isStringArray(value.attachmentKinds) &&
    isProbability(value.confidence) &&
    isStringArray(value.evidenceRefs)
  );
}

export function isAcquisitionRunEvidence(value: unknown): value is AcquisitionRunEvidence {
  if (
    !isRecord(value) ||
    !isRecord(value.counts) ||
    !isRecord(value.coverage) ||
    !isRecord(value.rendering) ||
    !isRecord(value.changeDetection) ||
    !isRecord(value.performance) ||
    !isRecord(value.boundaries)
  ) {
    return false;
  }
  return (
    value.protocolVersion === ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION &&
    value.objectType === "ACQUISITION_RUN_EVIDENCE" &&
    typeof value.runId === "string" &&
    typeof value.sourceId === "string" &&
    typeof value.playbookId === "string" &&
    typeof value.playbookRevision === "number" &&
    Number.isInteger(value.playbookRevision) &&
    value.playbookRevision > 0 &&
    typeof value.startedAt === "string" &&
    typeof value.finishedAt === "string" &&
    ["SUCCESS", "DEGRADED", "FAILED"].includes(String(value.outcome)) &&
    isStringArray(value.evidenceRefs) &&
    value.boundaries.legalTruthVerified === false &&
    value.boundaries.autoPromotionApplied === false &&
    value.boundaries.collectionAuthorityGranted === false
  );
}
