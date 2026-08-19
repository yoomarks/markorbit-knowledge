import type { ArtifactKind, AuthorityLevel, SourceCategory } from "./schema-v1";
import type { SourceType } from "./vocabularies";
import type { SourceDiscoveryProvenance, SourceRelationship } from "./source-registry-v2";

export const SOURCE_OPERATIONAL_TOPOLOGY_PROTOCOL_VERSION = "1.0" as const;

export type SourceOperationalTopologyAuthority = {
  nodeId: string;
  displayName: string;
  websiteUri: string | null;
  publishedByEdgeIds: string[];
};

export type SourceOperationalTopologyEntrypoint = {
  uri: string;
  label: string | null;
  graphNodeId: string | null;
  artifactIds: string[];
};

export type SourceOperationalTopologyArtifact = {
  artifactId: string;
  artifactKind: ArtifactKind;
  version: number;
  logicalDocumentId: string | null;
  canonicalUri: string | null;
  sourceUri: string;
  binarySha256: string;
  contentSha256: string | null;
  sizeBytes: number;
  capturedAt: string;
  matchedEntrypointUri: string | null;
};

export type SourceOperationalTopology = {
  protocolVersion: typeof SOURCE_OPERATIONAL_TOPOLOGY_PROTOCOL_VERSION;
  objectType: "SOURCE_OPERATIONAL_TOPOLOGY";
  workspaceId: string;
  source: {
    sourceId: string;
    name: string;
    sourceType: SourceType;
    category: SourceCategory;
    authorityLevel: AuthorityLevel;
    canonicalUri: string | null;
  };
  family: {
    parentSourceIds: string[];
    familyRootSourceId: string;
    relationshipBasis: "EXPLICIT_PARENT_SOURCE_ID";
  };
  authorities: SourceOperationalTopologyAuthority[];
  entrypoints: SourceOperationalTopologyEntrypoint[];
  artifacts: SourceOperationalTopologyArtifact[];
  relationships: SourceRelationship[];
  discoveryProvenance: SourceDiscoveryProvenance[];
  graph: {
    profileId: string;
    rootNodeId: string;
    nodeCount: number;
    edgeCount: number;
  } | null;
  coverage: {
    sourceRegistryV2Observed: boolean;
    sourceGraphObserved: boolean;
    explicitParentageObserved: boolean;
    explicitAuthorityObserved: boolean;
    rawArtifactRegistryAvailable: boolean;
    rawArtifactsObserved: boolean;
  };
};
