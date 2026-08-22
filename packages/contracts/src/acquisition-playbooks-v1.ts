import {
  ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
  type AcquisitionPlaybook,
} from "./acquisition-intelligence-v1";

/**
 * Seed playbooks are deliberately structural. Source names and domains must not
 * appear in selector logic; source-specific adapters may only provide traits
 * that select one of these reusable strategies.
 */
export const ACQUISITION_SEED_PLAYBOOKS: readonly AcquisitionPlaybook[] = [
  {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "ACQUISITION_PLAYBOOK",
    id: "official-static-index-tree",
    revision: 1,
    stage: "ACTIVE",
    name: "Official static index tree",
    primitives: [
      "INDEX_TREE_ENUMERATION",
      "STATIC_HTML_FETCH",
      "HTTP_VALIDATOR_CHANGE_WATCH",
      "CONTENT_DIGEST_CHANGE_WATCH",
      "CORPUS_RECONCILIATION",
    ],
    compatibility: {
      architectures: ["STATIC_HTML", "SSR", "HYBRID"],
      anyDiscoverySurfaces: ["INDEX_PAGE", "TOC"],
      renderRequirements: ["NONE", "OPTIONAL", "UNKNOWN"],
    },
    fallbackPlaybookIds: ["official-toc-graph"],
    prior: {
      expectedCoverage: 0.94,
      expectedSuccessRate: 0.95,
      expectedCostScore: 0.2,
      confidence: 0.65,
    },
    evidenceRefs: [],
  },
  {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "ACQUISITION_PLAYBOOK",
    id: "official-toc-graph",
    revision: 1,
    stage: "ACTIVE",
    name: "Official table-of-contents graph",
    primitives: [
      "TOC_GRAPH_ENUMERATION",
      "STATIC_HTML_FETCH",
      "CONTENT_DIGEST_CHANGE_WATCH",
      "CORPUS_RECONCILIATION",
    ],
    compatibility: {
      architectures: ["STATIC_HTML", "SSR", "HYBRID"],
      requiresDiscoverySurfaces: ["TOC"],
      renderRequirements: ["NONE", "OPTIONAL", "UNKNOWN"],
    },
    fallbackPlaybookIds: ["official-static-index-tree"],
    prior: {
      expectedCoverage: 0.97,
      expectedSuccessRate: 0.94,
      expectedCostScore: 0.25,
      confidence: 0.7,
    },
    evidenceRefs: [],
  },
  {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "ACQUISITION_PLAYBOOK",
    id: "official-jurisdiction-index",
    revision: 1,
    stage: "ACTIVE",
    name: "Official jurisdiction index",
    primitives: [
      "COUNTRY_INDEX_ENUMERATION",
      "STATIC_HTML_FETCH",
      "CONTENT_DIGEST_CHANGE_WATCH",
      "CORPUS_RECONCILIATION",
    ],
    compatibility: {
      architectures: ["STATIC_HTML", "SSR", "HYBRID"],
      requiresDiscoverySurfaces: ["COUNTRY_INDEX"],
      localeStructures: ["JURISDICTION_GRAPH"],
      renderRequirements: ["NONE", "OPTIONAL", "UNKNOWN"],
    },
    fallbackPlaybookIds: [],
    prior: {
      expectedCoverage: 0.96,
      expectedSuccessRate: 0.95,
      expectedCostScore: 0.25,
      confidence: 0.7,
    },
    evidenceRefs: [],
  },
  {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "ACQUISITION_PLAYBOOK",
    id: "official-api-catalog",
    revision: 1,
    stage: "ACTIVE",
    name: "Official API or document catalog",
    primitives: [
      "API_CATALOG_ENUMERATION",
      "STATIC_HTML_FETCH",
      "HTTP_VALIDATOR_CHANGE_WATCH",
      "CONTENT_DIGEST_CHANGE_WATCH",
      "CORPUS_RECONCILIATION",
    ],
    compatibility: {
      architectures: ["API_BACKED", "HYBRID"],
      anyDiscoverySurfaces: ["API", "DOCUMENT_CATALOG"],
    },
    fallbackPlaybookIds: [],
    prior: {
      expectedCoverage: 0.98,
      expectedSuccessRate: 0.96,
      expectedCostScore: 0.15,
      confidence: 0.7,
    },
    evidenceRefs: [],
  },
];
