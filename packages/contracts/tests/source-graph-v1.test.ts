import { describe, expect, it } from "vitest";
import {
  isSourceGraphEdge,
  isSourceGraphNode,
  isSourceGraphObservationBatch,
  isWebsiteSourceProfile,
  validateSourceGraphObservationBatch,
  type SourceGraphEdge,
  type SourceGraphNode,
  type SourceGraphObservationBatch,
  type WebsiteSourceProfile,
} from "../src/source-graph-v1";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const sourceId = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const profileId = "spf_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const rootNodeId = "sgn_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const pageNodeId = "sgn_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const organizationNodeId = "sgn_01ARZ3NDEKTSV4RRFFQ69G5FAX";
const contactNodeId = "sgn_01ARZ3NDEKTSV4RRFFQ69G5FAY";
const observedAt = "2026-08-08T05:00:00Z";

const provenance = {
  kind: "DISCOVERY" as const,
  sourceId,
  sourceUri: "https://www.uspto.gov/trademarks",
  observedAt,
  discoveryCandidateId: "cand_0123456789abcdef01234567",
  discoveryBatchId: "disc_0123456789abcdef0123456789abcdef",
};

function baseNode(id: string) {
  return {
    protocolVersion: "1.0" as const,
    objectType: "SOURCE_GRAPH_NODE" as const,
    id,
    workspaceId,
    sourceId,
    profileId,
    reviewState: "OBSERVED" as const,
    lifecycleState: "ACTIVE" as const,
    firstObservedAt: observedAt,
    lastObservedAt: observedAt,
    provenance: [provenance],
  };
}

const profile: WebsiteSourceProfile = {
  protocolVersion: "1.0",
  objectType: "WEBSITE_SOURCE_PROFILE",
  id: profileId,
  workspaceId,
  sourceId,
  canonicalOrigin: "https://www.uspto.gov",
  canonicalHost: "www.uspto.gov",
  observedHostAliases: ["uspto.gov"],
  rootNodeId,
  createdAt: observedAt,
  updatedAt: observedAt,
};

const websiteNode: SourceGraphNode = {
  ...baseNode(rootNodeId),
  kind: "WEBSITE",
  identity: { strategy: "CANONICAL_URI", key: "https://www.uspto.gov" },
  canonicalOrigin: "https://www.uspto.gov",
  host: "www.uspto.gov",
  displayName: "United States Patent and Trademark Office",
};

const pageNode: SourceGraphNode = {
  ...baseNode(pageNodeId),
  kind: "PAGE",
  identity: { strategy: "CANONICAL_URI", key: "https://www.uspto.gov/trademarks" },
  canonicalUri: "https://www.uspto.gov/trademarks",
  title: "Trademarks",
  language: "en",
  topic: "TRADEMARKS",
};

const organizationNode: SourceGraphNode = {
  ...baseNode(organizationNodeId),
  kind: "ORGANIZATION",
  identity: { strategy: "SOURCE_LOCAL", key: "org:united-states-patent-and-trademark-office" },
  displayName: "United States Patent and Trademark Office",
  organizationType: "AUTHORITY",
  websiteUri: "https://www.uspto.gov",
};

const contactNode: SourceGraphNode = {
  ...baseNode(contactNodeId),
  kind: "CONTACT_POINT",
  identity: { strategy: "SOURCE_LOCAL", key: "contact:trademark-assistance-center" },
  contactKind: "GENERAL_EMAIL",
  value: "TrademarkAssistanceCenter@uspto.gov",
  visibility: "PUBLIC_BUSINESS",
  roleLabel: "Trademark Assistance Center",
};

const containsEdge: SourceGraphEdge = {
  protocolVersion: "1.0",
  objectType: "SOURCE_GRAPH_EDGE",
  id: "sge_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  workspaceId,
  sourceId,
  profileId,
  kind: "CONTAINS",
  subjectNodeId: rootNodeId,
  objectNodeId: pageNodeId,
  reviewState: "OBSERVED",
  lifecycleState: "ACTIVE",
  firstObservedAt: observedAt,
  lastObservedAt: observedAt,
  provenance: [provenance],
};

describe("Source Graph Protocol v1", () => {
  it("accepts a website-level Source Profile without changing Schema v1 SourceDefinition", () => {
    expect(isWebsiteSourceProfile(profile)).toBe(true);
    expect(isSourceGraphNode(websiteNode)).toBe(true);
    expect(isSourceGraphNode(pageNode)).toBe(true);
    expect(isSourceGraphNode(organizationNode)).toBe(true);
    expect(isSourceGraphNode(contactNode)).toBe(true);
    expect(isSourceGraphEdge(containsEdge)).toBe(true);
  });

  it("requires URI-addressable resources to use canonical URI identity", () => {
    const invalid = {
      ...pageNode,
      identity: { strategy: "SOURCE_LOCAL", key: "page:trademarks" },
    };

    expect(isSourceGraphNode(invalid)).toBe(false);
  });

  it("keeps organization and person identity source-local instead of resolving globally", () => {
    const invalid = {
      ...organizationNode,
      identity: { strategy: "CANONICAL_URI", key: "https://www.uspto.gov" },
    };

    expect(isSourceGraphNode(invalid)).toBe(false);
  });

  it("requires evidence provenance and rejects unknown top-level node fields", () => {
    expect(isSourceGraphNode({ ...pageNode, provenance: [] })).toBe(false);
    expect(isSourceGraphNode({ ...pageNode, authorityLevel: "PRIMARY_OFFICIAL" })).toBe(false);
  });

  it("accepts a source-scoped idempotent observation batch", () => {
    const batch: SourceGraphObservationBatch = {
      protocolVersion: "1.0",
      objectType: "SOURCE_GRAPH_OBSERVATION_BATCH",
      id: "sgb_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      workspaceId,
      sourceId,
      profileId,
      idempotencyKey: "discovery:uspto:2026-08-08T05:00:00Z",
      observedAt,
      producer: {
        kind: "DISCOVERY",
        name: "http-website-discovery-provider",
        version: "1.0.0",
        discoveryBatchId: "disc_0123456789abcdef0123456789abcdef",
      },
      nodes: [websiteNode, pageNode, organizationNode, contactNode],
      edges: [containsEdge],
    };

    expect(validateSourceGraphObservationBatch(batch)).toEqual([]);
    expect(isSourceGraphObservationBatch(batch)).toBe(true);
  });

  it("rejects cross-source observations and duplicate identities inside one batch", () => {
    const batch = {
      protocolVersion: "1.0",
      objectType: "SOURCE_GRAPH_OBSERVATION_BATCH",
      id: "sgb_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      workspaceId,
      sourceId,
      profileId,
      idempotencyKey: "discovery:invalid",
      observedAt,
      producer: { kind: "DISCOVERY", name: "test" },
      nodes: [
        pageNode,
        { ...pageNode, id: "sgn_01ARZ3NDEKTSV4RRFFQ69G5FAZ" },
        {
          ...organizationNode,
          sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAW",
          provenance: [
            {
              ...provenance,
              sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAW",
            },
          ],
        },
      ],
      edges: [],
    };

    const issues = validateSourceGraphObservationBatch(batch);
    expect(issues.some((issue) => issue.includes("duplicate node identity"))).toBe(true);
    expect(issues.some((issue) => issue.includes("escapes the batch"))).toBe(true);
    expect(isSourceGraphObservationBatch(batch)).toBe(false);
  });

  it("does not expose a VERIFIED review state that could be confused with professional truth", () => {
    expect(isSourceGraphNode({ ...pageNode, reviewState: "VERIFIED" })).toBe(false);
    expect(isSourceGraphEdge({ ...containsEdge, reviewState: "VERIFIED" })).toBe(false);
  });
});
